import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import type { Card } from '../cards/repository.js';
import { CARD_TEXT_MAX_LENGTH } from '../cards/validation.js';
import { mcpRoutes } from './routes.js';
import type { McpDeps } from './tools.js';

const TOKEN = 'test-mcp-token';

interface FakeDeck {
  deps: McpDeps;
  cards: Card[];
  seed: (spanishText: string, englishText: string) => Card;
}

// In-memory stand-in for the cards repository, mirroring its newest-first
// list order.
function makeFakeDeck(): FakeDeck {
  const cards: Card[] = [];
  let nextId = 1;
  const seed = (spanishText: string, englishText: string): Card => {
    const timestamp = new Date(2026, 0, nextId).toISOString();
    const card: Card = {
      id: nextId++,
      spanishText,
      englishText,
      createdAt: timestamp,
      updatedAt: timestamp,
      due: timestamp,
      reviewed: false,
    };
    cards.push(card);
    return card;
  };
  return {
    cards,
    seed,
    deps: {
      listCards: async () => [...cards].sort((a, b) => b.id - a.id),
      insertCards: async (inputs) => inputs.map((input) => seed(input.spanishText, input.englishText)),
    },
  };
}

interface TestServer {
  url: URL;
  server: http.Server;
}

const servers: http.Server[] = [];
const clients: Client[] = [];

async function startServer(token: string | null, deps: McpDeps): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  app.use('/mcp', mcpRoutes(token, deps));
  const server = await new Promise<http.Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { url: new URL(`http://127.0.0.1:${port}/mcp`), server };
}

async function connectClient(url: URL, token: string): Promise<Client> {
  const client = new Client({ name: 'mcp-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close().catch(() => {})));
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

function initializePayload(): object {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'raw-test', version: '1.0.0' },
    },
  };
}

describe('MCP authentication', () => {
  it('rejects requests without an Authorization header', async () => {
    const deck = makeFakeDeck();
    const { url } = await startServer(TOKEN, deck.deps);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(initializePayload()),
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain('Unauthorized');
  });

  it('rejects a malformed Authorization header', async () => {
    const deck = makeFakeDeck();
    const { url } = await startServer(TOKEN, deck.deps);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Token ${TOKEN}`,
      },
      body: JSON.stringify(initializePayload()),
    });
    expect(response.status).toBe(401);
  });

  it('rejects an incorrect token and does not execute tools', async () => {
    const deck = makeFakeDeck();
    const { url } = await startServer(TOKEN, deck.deps);
    await expect(connectClient(url, 'wrong-token')).rejects.toThrow();
    expect(deck.cards).toHaveLength(0);
  });

  it('accepts the correct token', async () => {
    const deck = makeFakeDeck();
    const { url } = await startServer(TOKEN, deck.deps);
    const client = await connectClient(url, TOKEN);
    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);
  });

  it('returns a configuration error when MCP_TOKEN is not set', async () => {
    const deck = makeFakeDeck();
    const { url } = await startServer(null, deck.deps);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(initializePayload()),
    });
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain('MCP_TOKEN');
  });
});

describe('MCP tool listing (smoke)', () => {
  it('exposes exactly create_card, list_cards, and search_cards', async () => {
    const deck = makeFakeDeck();
    const { url } = await startServer(TOKEN, deck.deps);
    const client = await connectClient(url, TOKEN);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(['create_card', 'list_cards', 'search_cards']);
  });
});

describe('create_card', () => {
  it('saves valid cards and reports per-index failures for invalid ones', async () => {
    const deck = makeFakeDeck();
    const { url } = await startServer(TOKEN, deck.deps);
    const client = await connectClient(url, TOKEN);

    const result = await client.callTool({
      name: 'create_card',
      arguments: {
        cards: [
          { spanish_text: 'Hola', english_text: 'Hello' },
          { spanish_text: '', english_text: 'Broken' },
          { spanish_text: 'Gato', english_text: 'Cat' },
        ],
      },
    });

    const payload = result.structuredContent as {
      created: { index: number; card: { id: number; spanish_text: string; english_text: string } }[];
      failed: { index: number; input: { spanish_text: string }; errors: { field: string; message: string }[] }[];
    };
    expect(payload.created.map((entry) => entry.index)).toEqual([0, 2]);
    expect(payload.created[0]?.card.spanish_text).toBe('Hola');
    expect(payload.created[0]?.card.english_text).toBe('Hello');
    expect(payload.failed).toHaveLength(1);
    expect(payload.failed[0]?.index).toBe(1);
    expect(payload.failed[0]?.input.spanish_text).toBe('');
    expect(payload.failed[0]?.errors[0]?.field).toBe('spanish_text');
    expect(payload.failed[0]?.errors[0]?.message).toContain('required');
    expect(deck.cards.map((card) => card.spanishText)).toEqual(['Hola', 'Gato']);
  });

  it('applies the existing maximum length validation', async () => {
    const deck = makeFakeDeck();
    const { url } = await startServer(TOKEN, deck.deps);
    const client = await connectClient(url, TOKEN);

    const result = await client.callTool({
      name: 'create_card',
      arguments: {
        cards: [{ spanish_text: 'a'.repeat(CARD_TEXT_MAX_LENGTH + 1), english_text: 'too long' }],
      },
    });

    const payload = result.structuredContent as {
      created: unknown[];
      failed: { errors: { field: string; message: string }[] }[];
    };
    expect(payload.created).toEqual([]);
    expect(payload.failed[0]?.errors[0]?.field).toBe('spanish_text');
    expect(payload.failed[0]?.errors[0]?.message).toContain(String(CARD_TEXT_MAX_LENGTH));
    expect(deck.cards).toHaveLength(0);
  });

  it('allows duplicate cards', async () => {
    const deck = makeFakeDeck();
    deck.seed('Hola', 'Hello');
    const { url } = await startServer(TOKEN, deck.deps);
    const client = await connectClient(url, TOKEN);

    const result = await client.callTool({
      name: 'create_card',
      arguments: { cards: [{ spanish_text: 'Hola', english_text: 'Hello' }] },
    });

    const payload = result.structuredContent as { created: unknown[]; failed: unknown[] };
    expect(payload.created).toHaveLength(1);
    expect(payload.failed).toEqual([]);
    expect(deck.cards).toHaveLength(2);
  });

  it('rejects an empty cards array at the schema level', async () => {
    const deck = makeFakeDeck();
    const { url } = await startServer(TOKEN, deck.deps);
    const client = await connectClient(url, TOKEN);
    const result = await client.callTool({ name: 'create_card', arguments: { cards: [] } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('cards');
    expect(deck.cards).toHaveLength(0);
  });
});

describe('list_cards', () => {
  it('returns every card with both text fields and timestamps, newest first', async () => {
    const deck = makeFakeDeck();
    deck.seed('Hola', 'Hello');
    deck.seed('Adiós', 'Goodbye');
    const { url } = await startServer(TOKEN, deck.deps);
    const client = await connectClient(url, TOKEN);

    const result = await client.callTool({ name: 'list_cards', arguments: {} });
    const payload = result.structuredContent as {
      cards: { id: number; spanish_text: string; english_text: string; created_at: string; updated_at: string }[];
    };
    expect(payload.cards).toHaveLength(2);
    expect(payload.cards.map((card) => card.spanish_text)).toEqual(['Adiós', 'Hola']);
    for (const card of payload.cards) {
      expect(card.english_text).toBeTruthy();
      expect(Date.parse(card.created_at)).not.toBeNaN();
      expect(Date.parse(card.updated_at)).not.toBeNaN();
    }
  });
});

describe('search_cards', () => {
  it('returns ranked matches with matched field details', async () => {
    const deck = makeFakeDeck();
    deck.seed('Hola', 'Hello');
    deck.seed('Hola, ¿cómo estás?', 'Hello, how are you?');
    deck.seed('Tortuga', 'Turtle');
    const { url } = await startServer(TOKEN, deck.deps);
    const client = await connectClient(url, TOKEN);

    const result = await client.callTool({
      name: 'search_cards',
      arguments: { query: 'Hello', language: 'english' },
    });
    const payload = result.structuredContent as {
      query: string;
      language: string;
      matches: { matched_field: string; matched_text: string; rank_reason: string }[];
    };
    expect(payload.query).toBe('Hello');
    expect(payload.matches.map((match) => match.matched_text)).toEqual(['Hello', 'Hello, how are you?']);
    expect(payload.matches[0]?.rank_reason).toBe('exact');
    expect(payload.matches[0]?.matched_field).toBe('english_text');
  });

  it('rejects a missing language at the schema level', async () => {
    const deck = makeFakeDeck();
    const { url } = await startServer(TOKEN, deck.deps);
    const client = await connectClient(url, TOKEN);
    const result = await client.callTool({ name: 'search_cards', arguments: { query: 'Hello' } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('language');
  });
});
