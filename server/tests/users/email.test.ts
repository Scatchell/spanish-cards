import { describe, expect, it } from 'vitest';
import { isValidEmail, normalizeEmail } from '../../src/users/email.js';

describe('normalizeEmail', () => {
  it('trims and lowercases so casing and stray spaces map to one account', () => {
    expect(normalizeEmail('  Scatchell@Gmail.COM ')).toBe('scatchell@gmail.com');
  });
});

describe('isValidEmail', () => {
  it('accepts ordinary addresses and rejects obvious junk', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.de')).toBe(false);
    expect(isValidEmail(`${'x'.repeat(250)}@b.co`)).toBe(false);
  });
});
