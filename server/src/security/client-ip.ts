import type { Request } from 'express';

// Behind the Cloudflare tunnel the TCP peer is cloudflared on loopback, so the
// genuine client address arrives in CF-Connecting-IP; the on-LAN NPM path lacks
// that header and req.ip (trust proxy: loopback) is already correct.
export function clientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  return typeof cf === 'string' && cf.length > 0 ? cf : (req.ip ?? '');
}
