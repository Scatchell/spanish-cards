import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Credentials must match the .env used by the dev server (see .env.example).
const USERNAME = process.env.APP_USERNAME ?? 'admin';
const PASSWORD = process.env.APP_PASSWORD ?? 'change-me';

async function logIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/');
}

test('unauthenticated visitor is redirected to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
});

test('wrong credentials show an error and stay on login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Password').fill('definitely-wrong');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid username or password');
  await expect(page).toHaveURL('/login');
});

test('batch create saves valid drafts, keeps invalid ones, and supports delete', async ({
  page,
}) => {
  const unique = Date.now();
  await logIn(page);

  // First draft via the button, second via the keyboard shortcut.
  await page.getByRole('button', { name: /Add card/ }).click();
  await page.keyboard.press('Control+n');
  const drafts = page.locator('.draft-card');
  await expect(drafts).toHaveCount(2);

  // The shortcut focuses the new draft's Spanish input for rapid entry.
  await expect(drafts.nth(1).getByLabel('Spanish')).toBeFocused();

  await drafts.nth(0).getByLabel('Spanish').fill(`hola ${unique}`);
  await drafts.nth(0).getByLabel('English').fill(`hello ${unique}`);
  await drafts.nth(1).getByLabel('Spanish').fill(`gato ${unique}`);
  // Second draft's English is left empty, so it is invalid.

  await page.getByRole('button', { name: 'Save 2 cards' }).click();

  // The valid card lands in the deck; the invalid draft stays with its error.
  await expect(page.locator('.existing-card', { hasText: `hola ${unique}` })).toBeVisible();
  await expect(drafts).toHaveCount(1);
  await expect(drafts.nth(0).getByText('English text is required')).toBeVisible();

  // Fixing the draft and saving again clears it into the deck.
  await drafts.nth(0).getByLabel('English').fill(`cat ${unique}`);
  await page.getByRole('button', { name: 'Save 1 card' }).click();
  await expect(page.locator('.existing-card', { hasText: `gato ${unique}` })).toBeVisible();
  await expect(drafts).toHaveCount(0);

  // Hard delete removes the card from the grid after confirmation.
  for (const spanish of [`hola ${unique}`, `gato ${unique}`]) {
    const card = page.locator('.existing-card', { hasText: spanish });
    page.once('dialog', (dialog) => dialog.accept());
    await card.getByRole('button', { name: /Delete/ }).click();
    await expect(card).toHaveCount(0);
  }
});

test('logout returns to login and protects the cards page', async ({ page }) => {
  await logIn(page);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');
  await page.goto('/');
  await expect(page).toHaveURL('/login');
});
