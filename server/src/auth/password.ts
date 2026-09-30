import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;

const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// scrypt needs 128 * N * r bytes (32 MiB here); Node's default maxmem is
// exactly 32 MiB, which fails, so allow headroom.
const MAXMEM = 64 * 1024 * 1024;

function derive(plain: string, salt: Buffer, options: ScryptOptions, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain, salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// Stored as scrypt$N$r$p$salt$hash so parameters can be raised later without
// invalidating existing hashes.
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(plain, salt, { N, r: R, p: P, maxmem: MAXMEM }, KEY_LENGTH);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  if (salt.length === 0 || expected.length === 0) return false;
  try {
    const actual = await derive(plain, salt, { N: n!, r: r!, p: p!, maxmem: MAXMEM }, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validateNewPassword(plain: unknown): string | null {
  if (typeof plain !== 'string' || plain.length === 0) return 'Password is required';
  if (plain.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (plain.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  return null;
}

let dummy: Promise<string> | null = null;

// Verified against when a login email is unknown, so response timing does not
// reveal whether an account exists. Random input: nothing can match it.
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(32).toString('hex'));
  return dummy;
}
