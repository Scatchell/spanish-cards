import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { normalizeEmail } from './users/email.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env'), quiet: true });

export interface AppConfig {
  port: number;
  databaseUrl: string;
  // Base URL printed in set-password links (the browser-facing origin).
  appBaseUrl: string;
  sessionSecret: string;
  sessionTtlMs: number;
  // Bearer token for the /mcp endpoint. null disables MCP with a clear
  // configuration error instead of failing startup (see mcp/routes.ts).
  mcpToken: string | null;
  // The one account MCP tools act as; null disables /mcp with a config error.
  mcpUserEmail: string | null;
  openaiSecretKey: string | null;
  openaiBaseUrl: string | null;
  isProduction: boolean;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: env.PORT ? Number(env.PORT) : 4100,
    databaseUrl: required(env, 'DATABASE_URL'),
    appBaseUrl: env.APP_BASE_URL?.trim() || 'http://localhost:4101',
    sessionSecret: required(env, 'SESSION_SECRET'),
    sessionTtlMs: SESSION_TTL_MS,
    mcpToken: env.MCP_TOKEN?.trim() || null,
    mcpUserEmail: env.MCP_USER_EMAIL?.trim() ? normalizeEmail(env.MCP_USER_EMAIL) : null,
    openaiSecretKey: env.OPENAI_SECRET_KEY?.trim() || null,
    openaiBaseUrl: env.OPENAI_BASE_URL?.trim() || null,
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
