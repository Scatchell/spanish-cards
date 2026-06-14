import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Rate limiters for the public surface. All key on the real visitor IP: behind
// the Cloudflare tunnel the TCP peer is cloudflared on loopback, so the genuine
// client address arrives in CF-Connecting-IP. We fall back to req.ip for the
// on-LAN NPM path (where that header is absent). ipKeyGenerator normalizes IPv6
// to a subnet so a single client can't sidestep the limit by rotating addresses.

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function clientKey(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  const ip = typeof cf === 'string' && cf.length > 0 ? cf : (req.ip ?? '');
  return ipKeyGenerator(ip);
}

const TOO_MANY = { error: 'Too many requests, please slow down and try again later.' };

// Strict guard on /login. skipSuccessfulRequests means only FAILED logins count,
// so ordinary password typos never lock the single user out — only sustained
// guessing (10 failures in 15 min from one IP) trips it.
export const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: TOO_MANY,
});

// Blanket flood guard for the authenticated JSON API (generous for one user).
export const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: TOO_MANY,
});

// MCP is machine-to-machine; a tighter ceiling, with a JSON-RPC shaped error.
export const mcpLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES_MS,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
  message: { jsonrpc: '2.0', error: { code: -32000, message: 'Too many requests' }, id: null },
});
