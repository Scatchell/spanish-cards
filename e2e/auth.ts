import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Created by global-setup in the isolated e2e database.
export const E2E_EMAIL = 'e2e@example.com';
export const E2E_PASSWORD = 'e2e-password-123';

export async function logIn(page: Page, email = E2E_EMAIL, password = E2E_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/');
}
