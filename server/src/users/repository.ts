import type { DbQueryable } from '../db.js';

export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string | null;
  sessionVersion: number;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string | null;
  session_version: number;
}

const USER_COLUMNS = 'id, email, password_hash, session_version';

function toUser(row: UserRow): UserRecord {
  return { id: row.id, email: row.email, passwordHash: row.password_hash, sessionVersion: row.session_version };
}

async function one(db: DbQueryable, sql: string, params: unknown[]): Promise<UserRecord | null> {
  const result = await db.query<UserRow>(sql, params);
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export function findUserByEmail(db: DbQueryable, email: string): Promise<UserRecord | null> {
  return one(db, `SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
}

export function findUserById(db: DbQueryable, id: number): Promise<UserRecord | null> {
  return one(db, `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
}

export async function createInvitedUser(
  db: DbQueryable,
  email: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<UserRecord> {
  const user = await one(
    db,
    `INSERT INTO users (email, set_password_token_hash, set_password_expires_at)
     VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
    [email, tokenHash, expiresAt],
  );
  return user!;
}

export async function setSetPasswordToken(
  db: DbQueryable,
  userId: number,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await db.query(
    `UPDATE users SET set_password_token_hash = $2, set_password_expires_at = $3, updated_at = now()
     WHERE id = $1`,
    [userId, tokenHash, expiresAt],
  );
}

export function findUserBySetPasswordToken(
  db: DbQueryable,
  tokenHash: string,
  now: Date,
): Promise<UserRecord | null> {
  return one(
    db,
    `SELECT ${USER_COLUMNS} FROM users
     WHERE set_password_token_hash = $1 AND set_password_expires_at > $2`,
    [tokenHash, now],
  );
}

// One conditional UPDATE: the token check and its consumption are atomic, so a
// link can never be used twice even under concurrent submits.
export function completeSetPassword(
  db: DbQueryable,
  tokenHash: string,
  passwordHash: string,
  now: Date,
): Promise<UserRecord | null> {
  return one(
    db,
    `UPDATE users
     SET password_hash = $2, set_password_token_hash = NULL, set_password_expires_at = NULL,
         session_version = session_version + 1, updated_at = now()
     WHERE set_password_token_hash = $1 AND set_password_expires_at > $3
     RETURNING ${USER_COLUMNS}`,
    [tokenHash, passwordHash, now],
  );
}

export function updatePassword(
  db: DbQueryable,
  userId: number,
  passwordHash: string,
): Promise<UserRecord | null> {
  return one(
    db,
    `UPDATE users SET password_hash = $2, session_version = session_version + 1, updated_at = now()
     WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [userId, passwordHash],
  );
}
