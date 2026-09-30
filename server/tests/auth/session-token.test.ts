import { describe, expect, it } from 'vitest';
import { createSessionToken, parseSessionToken } from '../../src/auth/session-token.js';

const SECRET = 'test-secret';
const NOW = 1_700_000_000_000;
const CLAIMS = { userId: 7, sessionVersion: 3, expiresAtMs: NOW + 1000 };

describe('session tokens', () => {
  it('round-trips user id, session version, and expiry', () => {
    expect(parseSessionToken(createSessionToken(CLAIMS, SECRET), SECRET, NOW)).toEqual(CLAIMS);
  });

  it('rejects a token at or after its expiry', () => {
    const token = createSessionToken({ ...CLAIMS, expiresAtMs: NOW }, SECRET);
    expect(parseSessionToken(token, SECRET, NOW)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    expect(parseSessionToken(createSessionToken(CLAIMS, 'other'), SECRET, NOW)).toBeNull();
  });

  it('rejects tampering with the user id, version, or expiry', () => {
    const token = createSessionToken(CLAIMS, SECRET);
    const [, , , sig] = token.split('.');
    expect(parseSessionToken(`8.3.${NOW + 1000}.${sig}`, SECRET, NOW)).toBeNull();
    expect(parseSessionToken(`7.4.${NOW + 1000}.${sig}`, SECRET, NOW)).toBeNull();
    expect(parseSessionToken(`7.3.${NOW + 999_999}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it('rejects the legacy "<expiresAtMs>.<hmac>" format and malformed input', () => {
    expect(parseSessionToken(`${NOW + 1000}.abc`, SECRET, NOW)).toBeNull();
    expect(parseSessionToken(undefined, SECRET, NOW)).toBeNull();
    expect(parseSessionToken('', SECRET, NOW)).toBeNull();
    expect(parseSessionToken('a.b.c.d', SECRET, NOW)).toBeNull();
    expect(parseSessionToken('1.2.3.4.5', SECRET, NOW)).toBeNull();
  });
});
