import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

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

// Deleting all cards also clears review history (cascade), so each test
// starts from an empty dashboard.
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

// The dd value of the stat tile whose dt label matches exactly.
function stat(page: Page, label: string): Locator {
  return page
    .locator('.stat-tile')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('dd');
}

test.beforeEach(async ({ page }) => {
  await logIn(page);
  await wipeAllCards(page);
});

test('full journey: create cards, train, and watch the dashboard update', async ({ page }) => {
  await createCard(page, 'el perro', 'the dog');
  await createCard(page, 'la casa', 'the house');

  // Fresh cards show as new and due on the cards page.
  await page.reload();
  await expect(page.locator('.existing-card .due-status').first()).toHaveText('New · due now');

  // Dashboard before training: everything due, nothing studied yet.
  await page.getByRole('link', { name: 'Progress' }).click();
  await expect(page).toHaveURL('/progress');
  await expect(stat(page, 'Total cards')).toHaveText('2');
  await expect(stat(page, 'Due now')).toHaveText('2');
  await expect(stat(page, 'New')).toHaveText('2');
  await expect(stat(page, 'Reviewed today')).toHaveText('0');
  await expect(stat(page, 'Correct today')).toHaveText('—');
  await expect(stat(page, 'Streak')).toHaveText('0 days');
  await expect(stat(page, 'Last studied')).toHaveText('Never');
  await expect(page.getByText('No reviews yet')).toBeVisible();

  // Train both cards: one correct, one wrong.
  await page.getByRole('link', { name: 'Train', exact: true }).click();
  await page.getByLabel(/Your answer/).fill('el perro');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Good/ }).click();
  await page.getByLabel(/Your answer/).fill('la ventana');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Don't remember/ }).click();

  // The done screen links straight to the dashboard.
  await page.getByRole('link', { name: 'See your progress' }).click();
  await expect(page).toHaveURL('/progress');

  // Both reviews are reflected, rated honestly (1 of 2 detected correct),
  // and both cards have moved out of "new" into learning.
  await expect(stat(page, 'Total cards')).toHaveText('2');
  await expect(stat(page, 'Reviewed today')).toHaveText('2');
  await expect(stat(page, 'Correct today')).toHaveText('50%');
  await expect(stat(page, 'Avg daily correct')).toHaveText('50%');
  await expect(stat(page, 'Streak')).toHaveText('1 day');
  await expect(stat(page, 'New')).toHaveText('0');
  await expect(stat(page, 'Learning')).toHaveText('2');
  await expect(page.locator('.trend-chart')).toHaveCount(2);

  // The cards page now shows when each card is next due instead of "new".
  await page.getByRole('link', { name: 'Back to cards' }).click();
  await expect(page.locator('.existing-card .due-status').first()).not.toHaveText('New · due now');
});

test('extra practice ahead of schedule is recorded but does not count as due', async ({
  page,
}) => {
  await createCard(page, 'el gato', 'the cat');

  // Review the only scheduled card, then keep practicing it ahead of schedule.
  await page.goto('/train');
  await page.getByLabel(/Your answer/).fill('el gato');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Good/ }).click();
  await page.getByRole('button', { name: /Continue studying ahead/ }).click();
  await expect(page.locator('.ahead-badge')).toBeVisible();
  await page.getByLabel(/Your answer/).fill('el gato');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Good/ }).click();
  await expect(page.locator('.session-summary')).toContainText('1 card reviewed, 1 correct (100%)');

  // Both the scheduled review and the extra practice count as activity.
  await page.goto('/progress');
  await expect(stat(page, 'Reviewed today')).toHaveText('2');
  await expect(stat(page, 'Correct today')).toHaveText('100%');

  // The ahead-of-schedule rating advanced FSRS: the card is not due again
  // immediately.
  await expect(stat(page, 'Due now')).toHaveText('0');
});
