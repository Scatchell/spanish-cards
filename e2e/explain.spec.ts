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
  await expect(page.locator('.train-prompt')).toHaveText('my name is');

  // No explain button before checking
  await expect(page.getByRole('button', { name: 'Explain' })).toHaveCount(0);

  // Check the answer
  await page.getByLabel(/Your answer/).fill('me llamo');
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
  await page.getByLabel(/Your answer/).fill('la casa');
  await page.keyboard.press('Enter');

  // E opens modal
  await page.keyboard.press('e');
  await expect(page.getByRole('dialog')).toBeVisible();

  // 2 should not advance the card while modal is open
  await page.keyboard.press('2');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.train-prompt')).toHaveText('the house');

  // Escape closes the modal
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Card is still present (not advanced)
  await expect(page.locator('.train-prompt')).toHaveText('the house');
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
  await page.getByLabel(/Your answer/).fill('TRIGGER-EXPLAIN-FAILURE');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Sorry! Something went wrong with this explanation.',
  );
});

test('Follow-up: ask a question, see answer block, second question replaces first, no persistence on reopen', async ({
  page,
}) => {
  await createCard(page, 'me llamo', 'my name is');
  await page.goto('/train');
  await page.getByLabel(/Your answer/).fill('me llamo');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Explain' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toContainText('stubbed');

  // Fill follow-up input and submit
  const input = modal.getByLabel('Ask a question about this sentence');
  await input.fill('Why this tense?');
  await modal.getByRole('button', { name: 'Ask' }).click();

  // Answer block shows question and follow-up stub answer
  await expect(modal.locator('.followup-answer')).toContainText('Why this tense?');
  await expect(modal.locator('.followup-answer')).toContainText('follow-up answer');

  // Input is cleared
  await expect(input).toHaveValue('');

  // Submit a second question — it replaces the first
  await input.fill('Another option?');
  await modal.getByRole('button', { name: 'Ask' }).click();
  await expect(modal.locator('.followup-answer')).toContainText('Another option?');
  await expect(modal.locator('.followup-answer')).not.toContainText('Why this tense?');

  // Close and reopen — follow-up area is empty (not persisted)
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(modal).toHaveCount(0);
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByRole('dialog')).toContainText('stubbed');
  await expect(page.locator('.followup-answer')).toHaveCount(0);
});

test('Explain more: absent for a correct answer, present for an incorrect one', async ({
  page,
}) => {
  // Two cards so we can rate the first (advancing) and check the second without
  // draining the due queue via a reload.
  await createCard(page, 'me llamo', 'my name is');
  await createCard(page, 'la casa', 'the house');
  await page.goto('/train');
  await expect(page.locator('.train-prompt')).toHaveText('my name is');

  // Correct answer (english-to-spanish: prompt english, type spanish) — no Explain more
  await page.getByLabel(/Your answer/).fill('me llamo');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Explain' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Explain more' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();

  // Rate it Good to advance to the second card
  await page.keyboard.press('2');
  await expect(page.locator('.train-prompt')).toHaveText('the house');

  // Incorrect answer on the second card — Explain more is present
  await page.getByLabel(/Your answer/).fill('la kasa wrong');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(modal.getByRole('button', { name: 'Explain more' })).toBeVisible();
});

test('Explain more: invalid critique shown, no Adopt, cached on reopen', async ({ page }) => {
  await createCard(page, 'me llamo', 'my name is');
  await page.goto('/train');
  await page.getByLabel(/Your answer/).fill('me yamo');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Explain' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toContainText('stubbed');

  await modal.getByRole('button', { name: 'Explain more' }).click();
  await expect(modal.locator('.answer-check-result')).toContainText('stubbed critique');
  await expect(modal.getByRole('button', { name: 'Adopt' })).toHaveCount(0);

  // Close/reopen and run again — served from cache (no new stub calls)
  const countBeforeReopen = await stubRequestCount(page);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(modal).toHaveCount(0);
  await page.getByRole('button', { name: 'Explain' }).click();
  await modal.getByRole('button', { name: 'Explain more' }).click();
  await expect(modal.locator('.answer-check-result')).toContainText('stubbed critique');
  const countAfterReopen = await stubRequestCount(page);
  expect(countAfterReopen).toBe(countBeforeReopen);
});

test('Explain more: valid verdict → Adopt pre-fills the answer edit and saves', async ({
  page,
}) => {
  await createCard(page, 'me llamo', 'my name is');
  await page.goto('/train');
  await page.getByLabel(/Your answer/).fill('ADOPT-ME instead');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Explain' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Explain more' }).click();

  // Valid framing + Adopt visible
  await expect(modal).toContainText('valid alternative');
  const adopt = modal.getByRole('button', { name: 'Adopt' });
  await expect(adopt).toBeVisible();

  // Adopt closes the modal and pre-fills the answer edit input. Target the input
  // specifically: the view-mode pencil button shares the "Edit Spanish answer"
  // label, and it lingers until edit mode flips on a tick after the modal closes.
  await adopt.click();
  await expect(modal).toHaveCount(0);
  const editInput = page.locator('input[aria-label="Edit Spanish answer"]');
  await expect(editInput).toHaveValue('la mejor versión');

  // Commit the edit → the corrected answer shows and is persisted
  await editInput.press('Enter');
  await expect(page.locator('.correct-answer')).toHaveText('la mejor versión');
  const res = await page.request.get('/api/cards');
  const { cards } = (await res.json()) as { cards: { spanishText: string }[] };
  expect(cards.some((c) => c.spanishText === 'la mejor versión')).toBe(true);
});

test('Explain more: pressing E while the modal is open triggers the check', async ({ page }) => {
  await createCard(page, 'me llamo', 'my name is');
  await page.goto('/train');
  await page.getByLabel(/Your answer/).fill('me yamo');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Explain' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toContainText('stubbed');

  await page.keyboard.press('e');
  await expect(modal.locator('.answer-check-result')).toContainText('stubbed critique');
  // Modal stays open
  await expect(modal).toBeVisible();
});

test('Explain more: answer-check failure is isolated from the base explanation', async ({
  page,
}) => {
  await createCard(page, 'hola', 'hello');
  await page.goto('/train');
  await page.getByLabel(/Your answer/).fill('TRIGGER-CHECK-FAILURE');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Explain' }).click();
  const modal = page.getByRole('dialog');

  // Base explanation still renders
  await expect(modal).toContainText('stubbed');

  // Explain more fails with a recoverable inline error + Retry
  await modal.getByRole('button', { name: 'Explain more' }).click();
  await expect(modal.getByRole('alert')).toContainText("Couldn't check that answer");
  await expect(modal.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('Cross-card cache: second card with identical texts does not call the stub again', async ({
  page,
}) => {
  await createCard(page, 'hola', 'hello');
  await page.goto('/train');
  await page.getByLabel(/Your answer/).fill('hola');
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
  await page.getByLabel(/Your answer/).fill('hola');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByRole('dialog')).toContainText('stubbed');
  // Stub was NOT called again — served from cache (count unchanged)
  const countAfterSecond = await stubRequestCount(page);
  expect(countAfterSecond).toBe(countAfterFirst);
});
