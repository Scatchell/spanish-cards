import { createHash, randomBytes } from 'node:crypto';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

export function hashSetPasswordToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateSetPasswordToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSetPasswordToken(token) };
}

export function setPasswordLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/set-password?token=${encodeURIComponent(token)}`;
}
