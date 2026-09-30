import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import type { DbPool } from '../../src/db.js';
import { UserAdminError, inviteUser, issueResetLink } from '../../src/users/invites.js';
import {
  completeSetPassword,
  findUserByEmail,
  findUserBySetPasswordToken,
  updatePassword,
} from '../../src/users/repository.js';
import { hashSetPasswordToken } from '../../src/users/set-password-token.js';

const EMAIL = 'invite-integration@example.com';
const BASE = 'http://localhost:4101';
let pool: DbPool;

function tokenFrom(link: string): string {
  return new URL(link).searchParams.get('token')!;
}

beforeAll(() => {
  pool = createPool(loadConfig().databaseUrl);
});
beforeEach(async () => {
  await pool.query('DELETE FROM users WHERE email = $1', [EMAIL]);
});
afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email = $1', [EMAIL]);
  await pool.end();
});

describe('inviteUser', () => {
  it('creates a password-less user with a 7-day single-use link, normalizing the email', async () => {
    const now = new Date('2026-10-01T00:00:00Z');
    const link = await inviteUser(pool, `  ${EMAIL.toUpperCase()} `, BASE, now);
    expect(link.startsWith(`${BASE}/set-password?token=`)).toBe(true);
    const user = await findUserByEmail(pool, EMAIL);
    expect(user?.passwordHash).toBeNull();
    const tokenHash = hashSetPasswordToken(tokenFrom(link));
    expect(await findUserBySetPasswordToken(pool, tokenHash, new Date('2026-10-07T23:59:00Z'))).not.toBeNull();
    expect(await findUserBySetPasswordToken(pool, tokenHash, new Date('2026-10-08T00:00:01Z'))).toBeNull();
  });

  it('refuses an existing email and invalid emails', async () => {
    await inviteUser(pool, EMAIL, BASE);
    await expect(inviteUser(pool, EMAIL, BASE)).rejects.toThrow(UserAdminError);
    await expect(inviteUser(pool, 'not-an-email', BASE)).rejects.toThrow(UserAdminError);
  });
});

describe('completeSetPassword', () => {
  it('sets the hash, clears the token, bumps session_version, and is single-use', async () => {
    const link = await inviteUser(pool, EMAIL, BASE);
    const tokenHash = hashSetPasswordToken(tokenFrom(link));
    const before = await findUserByEmail(pool, EMAIL);
    const done = await completeSetPassword(pool, tokenHash, 'scrypt$fake', new Date());
    expect(done?.passwordHash).toBe('scrypt$fake');
    expect(done?.sessionVersion).toBe(before!.sessionVersion + 1);
    expect(await completeSetPassword(pool, tokenHash, 'scrypt$other', new Date())).toBeNull();
    expect((await findUserByEmail(pool, EMAIL))?.passwordHash).toBe('scrypt$fake');
  });
});

describe('issueResetLink', () => {
  it('replaces any previous link with a 1-hour one for an existing user', async () => {
    const invite = await inviteUser(pool, EMAIL, BASE);
    const now = new Date('2026-10-01T00:00:00Z');
    const reset = await issueResetLink(pool, EMAIL, BASE, now);
    const oldHash = hashSetPasswordToken(tokenFrom(invite));
    const newHash = hashSetPasswordToken(tokenFrom(reset));
    expect(await findUserBySetPasswordToken(pool, oldHash, now)).toBeNull();
    expect(await findUserBySetPasswordToken(pool, newHash, new Date('2026-10-01T00:59:00Z'))).not.toBeNull();
    expect(await findUserBySetPasswordToken(pool, newHash, new Date('2026-10-01T01:00:01Z'))).toBeNull();
  });

  it('refuses an unknown email', async () => {
    await expect(issueResetLink(pool, 'nobody-here@example.com', BASE)).rejects.toThrow(UserAdminError);
  });
});

describe('updatePassword', () => {
  it('stores the new hash and bumps session_version', async () => {
    await inviteUser(pool, EMAIL, BASE);
    const user = await findUserByEmail(pool, EMAIL);
    const updated = await updatePassword(pool, user!.id, 'scrypt$new');
    expect(updated?.passwordHash).toBe('scrypt$new');
    expect(updated?.sessionVersion).toBe(user!.sessionVersion + 1);
  });
});
