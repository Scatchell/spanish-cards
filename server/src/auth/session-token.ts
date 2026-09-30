import { createHmac, timingSafeEqual } from 'node:crypto';

// Stateless session token: "<userId>.<sessionVersion>.<expiresAtMs>.<hmac>".
// Survives restarts without a session store; bumping users.session_version
// revokes every outstanding token for that user.

export interface SessionClaims {
  userId: number;
  sessionVersion: number;
  expiresAtMs: number;
}

const TOKEN_PATTERN = /^(\d{1,10})\.(\d{1,10})\.(\d{1,16})\.([A-Za-z0-9_-]+)$/;

export function createSessionToken(claims: SessionClaims, secret: string): string {
  const payload = `${claims.userId}.${claims.sessionVersion}.${claims.expiresAtMs}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function parseSessionToken(
  token: string | undefined,
  secret: string,
  nowMs: number,
): SessionClaims | null {
  const match = token ? TOKEN_PATTERN.exec(token) : null;
  if (!match) return null;
  const [, userId, sessionVersion, expiresAtMs, signature] = match;
  const payload = `${userId}.${sessionVersion}.${expiresAtMs}`;
  const provided = Buffer.from(signature!);
  const expected = Buffer.from(sign(payload, secret));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  const claims = {
    userId: Number(userId),
    sessionVersion: Number(sessionVersion),
    expiresAtMs: Number(expiresAtMs),
  };
  return nowMs < claims.expiresAtMs ? claims : null;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
