import pg from 'pg';
import { hashPassword } from '../server/src/auth/password.ts';
import { inviteUser } from '../server/src/users/invites.ts';
import { E2E_CLIENT_PORT, E2E_DATABASE_URL } from './env.js';

async function withPool<T>(fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const pool = new pg.Pool({ connectionString: E2E_DATABASE_URL });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

export function createUserWithPassword(email: string, password: string): Promise<void> {
  return withPool(async (pool) => {
    await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [email, await hashPassword(password)],
    );
  });
}

// Same code path as `pnpm user:invite`, pointed at the e2e client.
export function inviteLink(email: string): Promise<string> {
  return withPool((pool) => inviteUser(pool, email, `http://localhost:${E2E_CLIENT_PORT}`));
}
