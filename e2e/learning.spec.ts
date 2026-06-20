import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Credentials must match the .env used by the test server (see .env.example).
const USERNAME = process.env.APP_USERNAME ?? 'admin';
const PASSWORD = process.env.APP_PASSWORD ?? 'change-me';

async function logIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/');
}

// The e2e database is isolated, so each test can start from an empty deck.
async function wipeAllCards(page: Page) {
  const response = await page.request.get('/api/cards');
  const { cards } = (await response.json()) as { cards: { id: number }[] };
  for (const card of cards) {
    await page.request.delete(`/api/cards/${card.id}`);
  }
}

async function createCard(page: Page, spanishText: string, englishText: string) {
  const response = await page.request.post('/api/cards/batch', {
    data: { cards: [{ spanishText, englishText }] },
  });
  expect(response.ok()).toBe(true);
}

// Reviews a card through the real training API so it becomes a reviewed,
// future-scheduled card (Good pushes it past "due now").
async function reviewCard(page: Page, spanishText: string) {
  const listResponse = await page.request.get('/api/cards');
  const { cards } = (await listResponse.json()) as { cards: { id: number; spanishText: string }[] };
  const card = cards.find((c) => c.spanishText === spanishText);
  expect(card).toBeDefined();
  const response = await page.request.post('/api/training/reviews', {
    data: {
      cardId: card!.id,
      rating: 'good',
      direction: 'spanish-to-english',
      verdict: 'correct',
      submittedText: spanishText,
    },
  });
  expect(response.ok()).toBe(true);
}

async function fetchProgress(page: Page) {
  const response = await page.request.get('/api/progress?tzOffset=0');
  expect(response.ok()).toBe(true);
  return response.json() as Promise<Record<string, unknown>>;
}

const learnCard = (page: Page, text: string) => page.locator('.learn-card', { hasText: text });

test.beforeEach(async ({ page }) => {
  await logIn(page);
  await wipeAllCards(page);
});

test('selection screen: new cards default, bulk actions, manual toggling, zero-start guard', async ({
  page,
}) => {
  await createCard(page, 'el perro', 'the dog');
  await createCard(page, 'la casa', 'the house');
  await createCard(page, 'el sol', 'the sun');
  await reviewCard(page, 'el sol');

  await page.goto('/');
  await page.getByRole('link', { name: 'Learn' }).click();
  await expect(page).toHaveURL('/learn');

  // New cards are selected by default; the reviewed (future-scheduled) card
  // is visible with its due timing but unselected.
  await expect(learnCard(page, 'el perro').getByRole('checkbox')).toBeChecked();
  await expect(learnCard(page, 'la casa').getByRole('checkbox')).toBeChecked();
  await expect(learnCard(page, 'el sol').getByRole('checkbox')).not.toBeChecked();
  await expect(learnCard(page, 'el perro')).toContainText('New · due now');
  await expect(learnCard(page, 'el sol')).toContainText('Due in');
  await expect(page.getByRole('button', { name: 'Start learning (2 cards)' })).toBeEnabled();

  // Include all pulls in the reviewed card too.
  await page.getByRole('button', { name: 'Include all' }).click();
  await expect(learnCard(page, 'el sol').getByRole('checkbox')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Start learning (3 cards)' })).toBeVisible();

  // Clearing blocks starting; bulk-including new restores the default set.
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('button', { name: 'Select cards to learn' })).toBeDisabled();
  await page.getByRole('button', { name: 'Include new' }).click();
  await expect(page.getByRole('button', { name: 'Start learning (2 cards)' })).toBeVisible();

  // Include due re-adds any deselected due-now card (new cards are due now
  // too) while leaving the future-scheduled card alone.
  await learnCard(page, 'la casa').getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: 'Include due' }).click();
  await expect(learnCard(page, 'la casa').getByRole('checkbox')).toBeChecked();
  await expect(learnCard(page, 'el sol').getByRole('checkbox')).not.toBeChecked();

  // Manual per-card toggling.
  await learnCard(page, 'la casa').getByRole('checkbox').uncheck();
  await expect(page.getByRole('button', { name: 'Start learning (1 card)' })).toBeVisible();
  await learnCard(page, 'la casa').getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Start learning (2 cards)' })).toBeVisible();
});

test('learning pass: flip, still-learning spacing, restart, and no scheduling side effects', async ({
  page,
}) => {
  await createCard(page, 'el perro', 'the dog');
  await createCard(page, 'la casa', 'the house');
  const answers: Record<string, string> = { 'the dog': 'el perro', 'the house': 'la casa' };

  const progressBefore = await fetchProgress(page);

  // Learning must never submit reviews; fail loudly if the page tries.
  const reviewCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/training/') && request.method() === 'POST') {
      reviewCalls.push(request.url());
    }
  });

  await page.goto('/learn');
  await page.getByRole('button', { name: 'Start learning (2 cards)' }).click();

  // One card at a time, training-card style, but no answer input or ratings.
  const prompt = page.locator('.train-prompt');
  await expect(prompt).toBeVisible();
  await expect(page.locator('.queue-count')).toHaveText('Remembered 0 of 2');
  await expect(page.getByLabel(/Your answer/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Good/ })).toHaveCount(0);

  // Flipping shows the back and is freely reversible, via the button or
  // Space, without the card changing size (so the buttons never move).
  const answer = page.locator('.learn-answer');
  const first = (await prompt.innerText()).trim();
  const heightBefore = (await page.locator('.train-card').boundingBox())!.height;
  await expect(answer).toBeHidden();
  await page.getByRole('button', { name: /Show answer/ }).click();
  await expect(answer).toHaveText(answers[first]!);
  expect((await page.locator('.train-card').boundingBox())!.height).toBe(heightBefore);
  await page.getByRole('button', { name: /Hide answer/ }).click();
  await expect(answer).toBeHidden();
  await page.keyboard.press('Space');
  await expect(answer).toBeVisible();
  await page.keyboard.press('Space');
  await expect(answer).toBeHidden();

  // Still learning (shortcut: 2) keeps the card in the pass but not as the
  // immediate next.
  await page.keyboard.press('2');
  const second = (await prompt.innerText()).trim();
  expect(second).not.toBe(first);
  await expect(page.locator('.queue-count')).toHaveText('Remembered 0 of 2');

  // Remembered (shortcut: 1) removes cards from the pass; the still-learning
  // card returns, with its answer hidden again.
  await page.keyboard.press('Space');
  await page.keyboard.press('1');
  await expect(prompt).toHaveText(first);
  await expect(answer).toBeHidden();
  await expect(page.locator('.queue-count')).toHaveText('Remembered 1 of 2');
  await page.getByRole('button', { name: /Remembered/ }).click();

  // Pass completion offers the follow-up actions.
  await expect(page.getByText('Pass complete!')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start training' })).toBeVisible();

  // Restarting reshuffles the same set, but the most recently seen card
  // (the last 20% tail, minimum 1) must not lead the new pass.
  await page.getByRole('button', { name: 'Keep learning these cards' }).click();
  await expect(prompt).toHaveText(second);
  await page.getByRole('button', { name: 'Remembered' }).click();
  await page.getByRole('button', { name: 'Remembered' }).click();
  await expect(page.getByText('Pass complete!')).toBeVisible();

  // Start training enters the normal scheduled flow, where both cards are
  // still due as new cards — learning recorded nothing.
  await page.getByRole('link', { name: 'Start training' }).click();
  await expect(page).toHaveURL('/train');
  await expect(page.locator('.queue-count')).toContainText('Card 1 of 2 scheduled');
  await expect(page.getByLabel(/Your answer/)).toBeVisible();

  // No review submissions were made, and progress metrics are untouched.
  expect(reviewCalls).toEqual([]);
  expect(await fetchProgress(page)).toEqual(progressBefore);
});
