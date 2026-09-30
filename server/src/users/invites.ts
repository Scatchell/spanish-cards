import type { DbQueryable } from '../db.js';
import { isValidEmail, normalizeEmail } from './email.js';
import { createInvitedUser, findUserByEmail, setSetPasswordToken } from './repository.js';
import { INVITE_TTL_MS, RESET_TTL_MS, generateSetPasswordToken, setPasswordLink } from './set-password-token.js';

// Operator-facing failure with a message safe to print as-is.
export class UserAdminError extends Error {}

function requireValidEmail(rawEmail: string): string {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    throw new UserAdminError(`"${rawEmail}" is not a valid email address`);
  }
  return email;
}

export async function inviteUser(
  db: DbQueryable,
  rawEmail: string,
  baseUrl: string,
  now: Date = new Date(),
): Promise<string> {
  const email = requireValidEmail(rawEmail);
  if (await findUserByEmail(db, email)) {
    throw new UserAdminError(`A user with email ${email} already exists (use user:reset-link instead)`);
  }
  const { token, tokenHash } = generateSetPasswordToken();
  await createInvitedUser(db, email, tokenHash, new Date(now.getTime() + INVITE_TTL_MS));
  return setPasswordLink(baseUrl, token);
}

export async function issueResetLink(
  db: DbQueryable,
  rawEmail: string,
  baseUrl: string,
  now: Date = new Date(),
): Promise<string> {
  const email = requireValidEmail(rawEmail);
  const user = await findUserByEmail(db, email);
  if (!user) {
    throw new UserAdminError(`No user with email ${email} (use user:invite instead)`);
  }
  const { token, tokenHash } = generateSetPasswordToken();
  await setSetPasswordToken(db, user.id, tokenHash, new Date(now.getTime() + RESET_TTL_MS));
  return setPasswordLink(baseUrl, token);
}
