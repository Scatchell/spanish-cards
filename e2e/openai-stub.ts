import http from 'node:http';

const port = Number(process.env.OPENAI_STUB_PORT ?? 4115);
let requestCount = 0;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);

  if (req.method === 'GET' && url.pathname === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/__requests') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: requestCount }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/__reset') {
    requestCount = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/responses') {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      requestCount++;
      let parsed: { input?: string } = {};
      try {
        parsed = JSON.parse(body) as { input?: string };
      } catch {
        // ignore parse errors — stub always responds
      }

      if (typeof parsed.input === 'string' && parsed.input.includes('TRIGGER-EXPLAIN-FAILURE')) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Stub triggered failure' } }));
        return;
      }

      const isFollowUp =
        typeof parsed.input === 'string' && parsed.input.includes("Learner's question:");
      const text = isFollowUp
        ? '- **stubbed** follow-up answer'
        : '- **stubbed** explanation for e2e';

      const payload = {
        id: 'stub-resp-001',
        object: 'response',
        status: 'completed',
        model: 'gpt-5.4-mini',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text,
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(port, () => {
  console.log(`OpenAI stub listening on http://localhost:${port}`);
});
