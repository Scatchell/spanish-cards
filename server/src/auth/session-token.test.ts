import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from './session-token.js';

const SECRET = 'test-secret';
const NOW = 1_700_000_000_000;

describe('session tokens', () => {
  it('accepts a token before its expiry', () => {
    const token = createSessionToken(SECRET, NOW + 1000);
    expect(verifySessionToken(token, SECRET, NOW)).toBe(true);
  });

  it('rejects a token at or after its expiry', () => {
    const token = createSessionToken(SECRET, NOW);
    expect(verifySessionToken(token, SECRET, NOW)).toBe(false);
    expect(verifySessionToken(token, SECRET, NOW + 1)).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken('other-secret', NOW + 1000);
    expect(verifySessionToken(token, SECRET, NOW)).toBe(false);
  });

  it('rejects a token whose expiry was tampered with', () => {
    const token = createSessionToken(SECRET, NOW + 1000);
    const signature = token.slice(token.lastIndexOf('.'));
    const tampered = `${NOW + 999_999_999}${signature}`;
    expect(verifySessionToken(tampered, SECRET, NOW)).toBe(false);
  });

  it('rejects missing and malformed tokens', () => {
    expect(verifySessionToken(undefined, SECRET, NOW)).toBe(false);
    expect(verifySessionToken('', SECRET, NOW)).toBe(false);
    expect(verifySessionToken('no-separator', SECRET, NOW)).toBe(false);
    expect(verifySessionToken('.only-signature', SECRET, NOW)).toBe(false);
  });
});
