import { describe, expect, it } from 'vitest';
import {
  generateSetPasswordToken,
  hashSetPasswordToken,
  setPasswordLink,
} from '../../src/users/set-password-token.js';

describe('set-password tokens', () => {
  it('generates a 32-byte base64url token whose stored hash is its sha256 hex', () => {
    const { token, tokenHash } = generateSetPasswordToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSetPasswordToken(token)).toBe(tokenHash);
    expect(generateSetPasswordToken().token).not.toBe(token);
  });

  it('builds the link without double slashes', () => {
    expect(setPasswordLink('https://x.example/', 'abc-_')).toBe('https://x.example/set-password?token=abc-_');
    expect(setPasswordLink('http://localhost:4101', 't')).toBe('http://localhost:4101/set-password?token=t');
  });
});
