import { execSync } from 'node:child_process';
import pg from 'pg';
import { E2E_COMPOSE_ARGS, E2E_DATABASE_URL } from './env.js';

const docker = ['docker', ...E2E_COMPOSE_ARGS].join(' ');

// Starts an isolated Postgres project with a fresh volume, then runs migrations
// from scratch so E2E never touches dev data or depends on dev containers.
export default async function globalSetup(): Promise<void> {
  execSync(`${docker} down -v --remove-orphans`, { stdio: 'inherit' });
  execSync(`${docker} up -d postgres`, { stdio: 'inherit' });
  await waitForPostgres();

  execSync('npm run migrate:up -w server', {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'inherit',
  });
}

async function waitForPostgres(): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
    try {
      await client.connect();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  throw lastError;
}
