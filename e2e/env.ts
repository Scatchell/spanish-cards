import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
export const E2E_COMPOSE_ENV_FILE = '.test-env';

function readEnvFile(fileName: string): Record<string, string> {
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing test environment file: ${fileName}. Copy .test-env.example to ${fileName} and update it before running E2E tests.`,
    );
  }

  const values: Record<string, string> = {};

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    values[key] = value.replace(/^['"]|['"]$/g, '');
  }

  return values;
}

const envFile = readEnvFile(E2E_COMPOSE_ENV_FILE);

function env(name: string, fallback: string): string {
  return process.env[name] ?? envFile[name] ?? fallback;
}

export const E2E_COMPOSE_PROJECT = env('E2E_COMPOSE_PROJECT', 'spanish-cards-e2e');
export const E2E_POSTGRES_USER = env('POSTGRES_USER', 'spanish_cards');
export const E2E_POSTGRES_PASSWORD = env('POSTGRES_PASSWORD', 'spanish_cards');
export const E2E_POSTGRES_DB = env('POSTGRES_DB', 'spanish_cards_test');
export const E2E_POSTGRES_HOST_PORT = env('POSTGRES_HOST_PORT', '55435');
export const E2E_API_PORT = Number(env('API_PORT', '4102'));
export const E2E_CLIENT_PORT = Number(env('CLIENT_PORT', '4103'));
export const E2E_DATABASE_URL = `postgres://${E2E_POSTGRES_USER}:${E2E_POSTGRES_PASSWORD}@localhost:${E2E_POSTGRES_HOST_PORT}/${E2E_POSTGRES_DB}`;

export const E2E_COMPOSE_ARGS = [
  'compose',
  '--env-file',
  E2E_COMPOSE_ENV_FILE,
  '-p',
  E2E_COMPOSE_PROJECT,
];
