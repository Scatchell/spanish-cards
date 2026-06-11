import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env'), quiet: true });

export interface AppConfig {
  port: number;
  databaseUrl: string;
  appUsername: string;
  appPassword: string;
  sessionSecret: string;
  sessionTtlMs: number;
  // Bearer token for the /mcp endpoint. null disables MCP with a clear
  // configuration error instead of failing startup (see mcp/routes.ts).
  mcpToken: string | null;
  isProduction: boolean;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: env.PORT ? Number(env.PORT) : 4100,
    databaseUrl: required(env, 'DATABASE_URL'),
    appUsername: required(env, 'APP_USERNAME'),
    appPassword: required(env, 'APP_PASSWORD'),
    sessionSecret: required(env, 'SESSION_SECRET'),
    sessionTtlMs: SESSION_TTL_MS,
    mcpToken: env.MCP_TOKEN?.trim() || null,
    isProduction: env.NODE_ENV === 'production',
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  }
  return value;
}
