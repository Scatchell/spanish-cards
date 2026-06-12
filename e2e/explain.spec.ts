import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_OPENAI_STUB_PORT } from './env.js';

const USERNAME = process.env.APP_USERNAME ?? 'admin';
const PASSWORD = process.env.APP_PASSWORD ?? 'change-me';
const STUB_BASE = `http://localhost:${E2E_OPENAI_STUB_PORT}`;

async function logIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/');
}

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

async function resetStub(page: Page) {
  await page.request.post(`${STUB_BASE}/__reset`);
}

async function stubRequestCount(page: Page): Promise<number> {
  const res = await page.request.get(`${STUB_BASE}/__requests`);
  const { count } = (await res.json()) as { count: number };
  return count;
}

test.beforeEach(async ({ page }) => {
  await logIn(page);
  await wipeAllCards(page);
  await resetStub(page);
});

test('Train: no explain button before checking; button + modal after; cached on reopen', async ({
  page,
}) => {
  await createCard(page, 'me llamo', 'my name is');
  await page.goto('/train');
  await expect(page.locator('.train-prompt')).toHaveText('me llamo');

  // No explain button before checking
  await expect(page.getByRole('button', { name: 'Explain' })).toHaveCount(0);

  // Check the answer
  await page.getByLabel(/Your answer/).fill('my name is');
  await page.keyboard.press('Enter');

  // Explain button is now visible
  const explainBtn = page.getByRole('button', { name: 'Explain' });
  await expect(explainBtn).toBeVisible();

  // Click explain — modal opens with stub content
  await explainBtn.click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('stubbed');

  // Close and reopen — content shown immediately (cached), no new stub call
  const countBeforeReopen = await stubRequestCount(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(modal).toHaveCount(0);
  await explainBtn.click();
  await expect(page.getByRole('dialog')).toContainText('stubbed');
  const countAfterReopen = await stubRequestCount(page);
  expect(countAfterReopen).toBe(countBeforeReopen);
});

test('Train: E opens modal, Escape closes, 2 does not advance card while open', async ({
  page,
}) => {
  await createCard(page, 'la casa', 'the house');
  await page.goto('/train');
  await page.getByLabel(/Your answer/).fill('the house');
  await page.keyboard.press('Enter');

  // E opens modal
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toBeVisible();

  // 2 should not advance the card while modal is open
  await page.keyboard.press('2');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.train-prompt')).toHaveText('la casa');

  // Escape closes the modal
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Card is still present (not advanced)
  await expect(page.locator('.train-prompt')).toHaveText('la casa');
});

test('Learn: explain button hidden before answer shown, visible after', async ({ page }) => {
  await createCard(page, 'el gato', 'the cat');
  await page.goto('/learn');

  // Start learning session
  await page.getByRole('button', { name: /Start learning/ }).click();
  await expect(page.locator('.train-prompt')).toBeVisible();

  // Explain button exists but is concealed before answer is shown
  const explainBtn = page.locator('.explain-button');
  await expect(explainBtn).toHaveCSS('visibility', 'hidden');

  // Show the answer
  await page.getByRole('button', { name: /Show answer/ }).click();

  // Explain button is now visible
  await expect(explainBtn).toBeVisible();
  await expect(explainBtn).not.toHaveCSS('visibility', 'hidden');

  // Click explain — modal opens
  await explainBtn.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('Learn: layout does not shift when showing/hiding answer with explain button present', async ({
  page,
}) => {
  await createCard(page, 'el gato', 'the cat');
  await page.goto('/learn');
  await page.getByRole('button', { name: /Start learning/ }).click();
  await expect(page.locator('.train-card')).toBeVisible();

  const heightBefore = (await page.locator('.train-card').boundingBox())!.height;
  await page.getByRole('button', { name: /Show answer/ }).click();
  expect((await page.locator('.train-card').boundingBox())!.height).not.toBe(0);
  await page.getByRole('button', { name: /Hide answer/ }).click();
  expect((await page.locator('.train-card').boundingBox())!.height).toBe(heightBefore);
});

test('Failure path: modal shows friendly error message', async ({ page }) => {
  // The stub returns 500 when input contains TRIGGER-EXPLAIN-FAILURE
  await createCard(page, 'TRIGGER-EXPLAIN-FAILURE', 'trigger failure');
  await page.goto('/train');
  await page.getByLabel(/Your answer/).fill('trigger failure');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Sorry! Something went wrong with this explanation.',
  );
});

test('Cross-card cache: second card with identical texts does not call the stub again', async ({
  page,
}) => {
  await createCard(page, 'hola', 'hello');
  await page.goto('/train');
  await page.getByLabel(/Your answer/).fill('hello');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByRole('dialog')).toContainText('stubbed');
  await page.getByRole('button', { name: 'Close' }).click();

  // Rate this card and create another card with the same texts
  await page.keyboard.press('2');

  // Record stub count after the first card's explanation is cached
  const countAfterFirst = await stubRequestCount(page);

  // Create a second card with same texts, then train it
  await createCard(page, 'hola', 'hello');
  await page.reload();
  await page.getByLabel(/Your answer/).fill('hello');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByRole('dialog')).toContainText('stubbed');
  // Stub was NOT called again — served from cache (count unchanged)
  const countAfterSecond = await stubRequestCount(page);
  expect(countAfterSecond).toBe(countAfterFirst);
});
