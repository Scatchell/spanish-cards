import { createHash, timingSafeEqual } from 'node:crypto';

export interface ExpectedCredentials {
  username: string;
  password: string;
}

export function checkCredentials(
  username: unknown,
  password: unknown,
  expected: ExpectedCredentials,
): boolean {
  if (typeof username !== 'string' || typeof password !== 'string') {
    return false;
  }
  // Compare both fields in constant time so response timing can't reveal how
  // many leading characters of the username/password were correct.
  const usernameOk = constantTimeEquals(username, expected.username);
  const passwordOk = constantTimeEquals(password, expected.password);
  return usernameOk && passwordOk;
}

// Hash both sides so the comparison is constant-time regardless of input length.
function constantTimeEquals(provided: string, expected: string): boolean {
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}
