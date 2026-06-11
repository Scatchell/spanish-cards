import { createHmac, timingSafeEqual } from 'node:crypto';

// Stateless session token: "<expiresAtMs>.<hmac>". Survives server restarts
// without a session store, which is all a single-user app needs.

export function createSessionToken(secret: string, expiresAtMs: number): string {
  const payload = String(expiresAtMs);
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string,
  nowMs: number,
): boolean {
  if (!token) {
    return false;
  }
  const separator = token.lastIndexOf('.');
  if (separator <= 0) {
    return false;
  }
  const payload = token.slice(0, separator);
  const signature = Buffer.from(token.slice(separator + 1));
  const expectedSignature = Buffer.from(sign(payload, secret));
  if (signature.length !== expectedSignature.length || !timingSafeEqual(signature, expectedSignature)) {
    return false;
  }
  const expiresAtMs = Number(payload);
  return Number.isFinite(expiresAtMs) && nowMs < expiresAtMs;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
