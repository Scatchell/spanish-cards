import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { requestLogger } from '../../src/logging/request-log.js';

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
});

async function startServer(configure: (app: express.Express) => void) {
  const warnings: string[] = [];
  const infos: string[] = [];
  const app = express();
  app.use(requestLogger({ warn: (m) => warnings.push(m), info: (m) => infos.push(m) }));
  configure(app);
  const server = await new Promise<http.Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, warnings, infos };
}

const waitForResponseEvents = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('requestLogger', () => {
  it('logs 4xx responses with status, method, path and the JSON error message', async () => {
    const { baseUrl, warnings } = await startServer((app) => {
      app.post('/api/cards/20/explanation', (_req, res) => {
        res.status(401).json({ error: 'Not authenticated' });
      });
    });

    await fetch(`${baseUrl}/api/cards/20/explanation`, { method: 'POST' });
    await waitForResponseEvents();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^\[api\] 401 POST \/api\/cards\/20\/explanation from .+ after \d+ms — Not authenticated$/);
  });

  it('logs 5xx responses that carry no JSON error body', async () => {
    const { baseUrl, warnings } = await startServer((app) => {
      app.get('/boom', (_req, res) => {
        res.status(502).send('bad gateway');
      });
    });

    await fetch(`${baseUrl}/boom`);
    await waitForResponseEvents();

    expect(warnings).toEqual([expect.stringMatching(/^\[api\] 502 GET \/boom from .+ after \d+ms$/)]);
  });

  it('stays quiet for fast successful responses', async () => {
    const { baseUrl, warnings, infos } = await startServer((app) => {
      app.get('/ok', (_req, res) => {
        res.json({ ok: true });
      });
    });

    await fetch(`${baseUrl}/ok`);
    await waitForResponseEvents();

    expect(warnings).toEqual([]);
    expect(infos).toEqual([]);
  });

  it('logs when the client disconnects before a response is sent', async () => {
    const { baseUrl, warnings } = await startServer((app) => {
      app.get('/hang', () => undefined);
    });

    const controller = new AbortController();
    const pending = fetch(`${baseUrl}/hang`, { signal: controller.signal }).catch(() => undefined);
    await waitForResponseEvents();
    controller.abort();
    await pending;
    await waitForResponseEvents();

    expect(warnings).toEqual([
      expect.stringMatching(/^\[api\] client disconnected before response: GET \/hang from /),
    ]);
  });
});
