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
  return username === expected.username && password === expected.password;
}
