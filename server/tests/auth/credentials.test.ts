import { describe, expect, it } from 'vitest';
import { checkCredentials } from '../../src/auth/credentials.js';

const EXPECTED = { username: 'admin', password: 's3cret' };

describe('checkCredentials', () => {
  it('accepts the configured username and password', () => {
    expect(checkCredentials('admin', 's3cret', EXPECTED)).toBe(true);
  });

  it('rejects a wrong username or password', () => {
    expect(checkCredentials('admin', 'wrong', EXPECTED)).toBe(false);
    expect(checkCredentials('someone', 's3cret', EXPECTED)).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(checkCredentials(undefined, 's3cret', EXPECTED)).toBe(false);
    expect(checkCredentials('admin', { toString: () => 's3cret' }, EXPECTED)).toBe(false);
  });
});
