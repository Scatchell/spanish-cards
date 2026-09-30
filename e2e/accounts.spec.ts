import { expect, test } from '@playwright/test';
import { E2E_EMAIL, E2E_PASSWORD, logIn } from './auth.js';
import { createUserWithPassword, inviteLink } from './users.js';

test('an invite link lets a new user choose a password and lands them in an empty deck', async ({ page }) => {
  const email = `invitee-${Date.now()}@example.com`;
  const link = await inviteLink(email);
  await page.goto(link.replace(/^http:\/\/localhost:\d+/, ''));
  await expect(page.getByText(`Set a password for ${email}`)).toBeVisible();
  await page.getByLabel('New password').fill('invitee-pass-1');
  await page.getByLabel('Confirm password').fill('invitee-pass-1');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page).toHaveURL('/');
  const cards = await (await page.request.get('/api/cards')).json();
  expect(cards.cards).toEqual([]);

  // The link is single-use.
  await page.goto(link.replace(/^http:\/\/localhost:\d+/, ''));
  await expect(page.getByText(/invalid or has expired/)).toBeVisible();
});

test('cards created by one user are invisible to another', async ({ browser }) => {
  const other = `other-${Date.now()}@example.com`;
  await createUserWithPassword(other, 'other-pass-1');
  const mine = await browser.newPage();
  await logIn(mine);
  const unique = `aislado ${Date.now()}`;
  await mine.request.post('/api/cards/batch', { data: { cards: [{ spanishText: unique, englishText: 'isolated' }] } });

  const theirs = await (await browser.newContext()).newPage();
  await logIn(theirs, other, 'other-pass-1');
  const cards = (await (await theirs.request.get('/api/cards')).json()).cards as { spanishText: string }[];
  expect(cards.some((c) => c.spanishText === unique)).toBe(false);
});

test('changing the password keeps this device, rejects the old password afterwards', async ({ page }) => {
  const email = `changer-${Date.now()}@example.com`;
  await createUserWithPassword(email, 'first-pass-1');
  await logIn(page, email, 'first-pass-1');
  await page.getByRole('link', { name: 'Account' }).first().click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByLabel('Current password').fill('first-pass-1');
  await page.getByLabel('New password', { exact: true }).fill('second-pass-2');
  await page.getByLabel('Confirm new password').fill('second-pass-2');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('status')).toContainText('Password changed');
  await page.goto('/');
  await expect(page).toHaveURL('/');

  await page.getByRole('button', { name: 'Log out' }).first().click();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('first-pass-1');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid email or password');
  await logIn(page, email, 'second-pass-2');
});

test('the seeded e2e user can still log in (sanity)', async ({ page }) => {
  await logIn(page, E2E_EMAIL, E2E_PASSWORD);
});
