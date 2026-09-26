import type { NextFunction, Request, Response } from 'express';
import { clientIp } from '../security/client-ip.js';

export const SLOW_REQUEST_MS = 3000;

export interface RequestLogSink {
  warn: (message: string) => void;
  info: (message: string) => void;
}

// Many rejections (auth, rate limits, validation) respond without logging
// anything themselves, so failures are otherwise invisible in the server logs.
export function requestLogger(sink: RequestLogSink = console) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = performance.now();
    let errorMessage: string | undefined;

    const sendJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 400 && body && typeof (body as { error?: unknown }).error === 'string') {
        errorMessage = (body as { error: string }).error;
      }
      return sendJson(body);
    };

    const describe = () =>
      `${req.method} ${req.originalUrl} from ${clientIp(req)} after ${Math.round(performance.now() - startedAt)}ms`;

    res.on('finish', () => {
      if (res.statusCode >= 400) {
        sink.warn(`[api] ${res.statusCode} ${describe()}${errorMessage ? ` — ${errorMessage}` : ''}`);
      } else if (performance.now() - startedAt >= SLOW_REQUEST_MS) {
        sink.info(`[api] slow ${res.statusCode} ${describe()}`);
      }
    });
    res.on('close', () => {
      if (!res.writableFinished) sink.warn(`[api] client disconnected before response: ${describe()}`);
    });

    next();
  };
}
