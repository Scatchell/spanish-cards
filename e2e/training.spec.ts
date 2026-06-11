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

// Creates one card per call so created_at timestamps (and therefore due
// order for new cards) follow the call order.
async function createCard(page: Page, spanishText: string, englishText: string) {
  const response = await page.request.post('/api/cards/batch', {
    data: { cards: [{ spanishText, englishText }] },
  });
  expect(response.ok()).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await logIn(page);
  await wipeAllCards(page);
});

test('trains due cards oldest-first: typed answers, rating, and studying ahead', async ({
  page,
}) => {
  await createCard(page, 'el perro', 'the dog');
  await createCard(page, 'la casa', 'the house');

  await page.getByRole('link', { name: 'Train' }).click();
  await expect(page).toHaveURL('/train');

  // Both new cards are immediately due, oldest (first created) first.
  await expect(page.locator('.queue-count')).toContainText('2 cards left');
  await expect(page.locator('.train-prompt')).toHaveText('el perro');

  // Correct typed answer: success state, answer revealed, no "Don't remember".
  await page.getByLabel(/Your answer/).fill('the dog');
  await page.keyboard.press('Enter');
  await expect(page.locator('.verdict')).toHaveText('Correct!');
  await expect(page.locator('.correct-answer')).toHaveText('the dog');
  await expect(page.getByRole('button', { name: /Don't remember/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Good/ }).click();

  // Incorrect typed answer: both answers shown, override rating allowed.
  await expect(page.locator('.train-prompt')).toHaveText('la casa');
  await page.getByLabel(/Your answer/).fill('the table');
  await page.keyboard.press('Enter');
  await expect(page.locator('.verdict')).toHaveText('Not quite');
  await expect(page.locator('.submitted-answer')).toContainText('the table');
  await expect(page.locator('.correct-answer')).toHaveText('the house');
  await expect(page.getByRole('button', { name: /Don't remember/ })).toBeVisible();
  await page.getByRole('button', { name: /Hard/ }).click();

  // All scheduled cards are done, and FSRS state persists across a reload.
  await expect(page.getByText("All done!")).toBeVisible();
  await page.reload();
  await expect(page.getByText("All done!")).toBeVisible();

  // Studying ahead surfaces not-yet-due cards soonest-first ("la casa" was
  // rated Hard, so it comes back sooner than the Good-rated "el perro").
  await page.getByRole('button', { name: /Continue studying ahead/ }).click();
  await expect(page.locator('.ahead-badge')).toBeVisible();
  await expect(page.locator('.train-prompt')).toHaveText('la casa');
  await page.getByLabel(/Your answer/).fill('the house');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Good/ }).click();
  await expect(page.locator('.train-prompt')).toHaveText('el perro');
});

test('empty answer reveals the correct answer and defaults to Don\'t remember', async ({
  page,
}) => {
  await createCard(page, 'el gato', 'the cat');
  await page.goto('/train');

  await expect(page.locator('.train-prompt')).toHaveText('el gato');
  await page.getByLabel(/Your answer/).press('Enter');

  // Answer revealed; "Don't remember" is the emphasized default action.
  await expect(page.locator('.correct-answer')).toHaveText('the cat');
  const dontRemember = page.getByRole('button', { name: /Don't remember/ });
  await expect(dontRemember).toBeFocused();

  // Rate via the keyboard shortcut (0 = Don't remember).
  await page.keyboard.press('0');
  await expect(page.getByText("All done!")).toBeVisible();
});

test('direction toggle trains English to Spanish with lenient accent matching', async ({
  page,
}) => {
  await createCard(page, 'estás', 'you are');
  await page.goto('/train');

  await page.getByRole('button', { name: 'Spanish → English' }).click();
  await expect(page.locator('.train-prompt')).toHaveText('you are');

  // Missing accent counts as correct but the difference is highlighted.
  await page.getByLabel(/Your answer \(Spanish\)/).fill('estas');
  await page.keyboard.press('Enter');
  await expect(page.locator('.verdict')).toContainText('Correct — but check');
  await expect(page.locator('.correct-answer mark')).toHaveText('á');

  // The direction preference persists for the browser session.
  await page.reload();
  await expect(page.getByRole('button', { name: 'English → Spanish' })).toBeVisible();
  await expect(page.locator('.train-prompt')).toHaveText('you are');
});
