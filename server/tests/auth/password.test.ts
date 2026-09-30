import { describe, expect, it } from 'vitest';
import {
  MAX_PASSWORD_LENGTH,
  dummyPasswordHash,
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from '../../src/auth/password.js';

describe('password hashing', () => {
  it('round-trips and uses the self-describing scrypt format', async () => {
    const stored = await hashPassword('correct horse');
    expect(stored).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword('correct horse', stored)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse');
    expect(await verifyPassword('correct horsE', stored)).toBe(false);
  });

  it('salts each hash differently', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('returns false for malformed or tampered stored hashes instead of throwing', async () => {
    const stored = await hashPassword('pw-123456');
    const parts = stored.split('$');
    parts[5] = Buffer.alloc(64).toString('base64');
    expect(await verifyPassword('pw-123456', parts.join('$'))).toBe(false);
    expect(await verifyPassword('pw-123456', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('pw-123456', 'scrypt$x$8$1$aa$bb')).toBe(false);
  });

  it('dummy hash never verifies common input', async () => {
    const dummy = await dummyPasswordHash();
    expect(await verifyPassword('', dummy)).toBe(false);
    expect(await verifyPassword('password', dummy)).toBe(false);
  });
});

describe('validateNewPassword', () => {
  it('enforces 8..256 characters and string type only', () => {
    expect(validateNewPassword('1234567')).toMatch(/at least 8/);
    expect(validateNewPassword('12345678')).toBeNull();
    expect(validateNewPassword('x'.repeat(MAX_PASSWORD_LENGTH))).toBeNull();
    expect(validateNewPassword('x'.repeat(MAX_PASSWORD_LENGTH + 1))).toMatch(/at most 256/);
    expect(validateNewPassword(undefined)).toMatch(/required/);
    expect(validateNewPassword(12345678)).toMatch(/required/);
  });
});
