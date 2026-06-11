import { execSync } from 'node:child_process';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../playwright.config.js';

const TEST_DB_NAME = 'spanish_cards_test';
const ADMIN_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://spanish_cards:spanish_cards@localhost:5434/spanish_cards';

// Creates the dedicated e2e database (so tests never touch dev data), brings
// its schema up to date, and starts every run from an empty deck.
export default async function globalSetup(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      TEST_DB_NAME,
    ]);
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    }
  } finally {
    await admin.end();
  }

  execSync('npm run migrate:up -w server', {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'inherit',
  });

  const testDb = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await testDb.connect();
  try {
    await testDb.query('TRUNCATE cards CASCADE');
  } finally {
    await testDb.end();
  }
}
