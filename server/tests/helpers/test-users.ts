import type { DbQueryable } from '../../src/db.js';

// Idempotently creates (or finds) a password-less user for integration tests.
// Test users are left in the dev DB; they own no rows once each suite cleans up.
export async function ensureTestUser(pool: DbQueryable, email: string): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO users (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [email],
  );
  return result.rows[0]!.id;
}
