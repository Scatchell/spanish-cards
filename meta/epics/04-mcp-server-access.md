# Epic 04: MCP Server Access

## Implementation Prompt

Build the fourth vertical slice of the Spanish flashcard app: authenticated Model Context Protocol access to card creation, card listing, and fuzzy duplicate-check search. This slice should let AI agents and local LLM tools safely interact with the existing single-user card service through a Streamable HTTP MCP endpoint exposed by the existing Express server.

This prompt is self-contained. Assume the application is a single-user, authenticated, mobile-responsive Spanish flashcard web app backed by PostgreSQL. The user can create/delete cards, log in/out, and train using typed answers with FSRS scheduling. If parts of that foundation are missing, implement the minimal required behavior to satisfy this slice end-to-end.

## Core Goals

- Add an MCP endpoint at `/mcp` using Streamable HTTP.
- Integrate the MCP endpoint into the existing Express server rather than adding a separate daemon or stdio process.
- Authenticate MCP access with a single bearer token from environment variables.
- Expose MCP tools for batch card creation, listing all cards, and fuzzy duplicate-check search.
- Reuse existing card domain/service logic directly instead of introducing an internal HTTP API just for MCP.
- Add validation and clear error handling so MCP callers understand why a card could not be created.
- Document MCP installation/configuration for Opencode, OpenClaw, Claude CLI, and LM Studio.
- Keep the app single-user and single-deck.

## Transport and Endpoint Requirements

Use Streamable HTTP MCP as the required transport.

Required behavior:

- Mount the MCP server at `POST /mcp` or the MCP SDK's equivalent Streamable HTTP route shape rooted at `/mcp`.
- The endpoint must be hosted by the same Express server that serves the existing API/app.
- Do not add a stdio MCP launcher unless the selected MCP SDK requires it for local development only; production/user-facing configuration should use Streamable HTTP.
- Do not add SSE unless the selected SDK requires it as a compatibility layer; if present, Streamable HTTP must remain the documented and preferred transport.
- MCP handlers should call existing card domain/service/database functions directly.
- Do not create a new unauthenticated card HTTP API for the MCP layer to call.

Recommended implementation:

- Use the official TypeScript MCP SDK if it cleanly supports Express + Streamable HTTP in the current app stack.
- Keep MCP tool definitions and schemas in a small server-side module, separate from UI routes.
- Keep imports at the top of files.

## Authentication Requirements

MCP access is protected by a single static token.

Required behavior:

- Read `MCP_TOKEN` from `.env` / environment variables.
- Document `MCP_TOKEN` in `.env.example` and `README.md`.
- Require `Authorization: Bearer <MCP_TOKEN>` for every MCP request.
- Reject missing, malformed, or incorrect authorization with a clear `401 Unauthorized` response.
- If `MCP_TOKEN` is missing at server startup, fail closed or disable the MCP endpoint with a clear startup/configuration error. Prefer failing startup if this does not make local development painful; otherwise log a clear warning and return a clear configuration error from `/mcp`.
- Do not reuse the browser login session cookie for MCP authentication.
- Do not add OAuth, registration, per-client tokens, scopes, or multi-user permissions in this epic.

Security guidance:

- Treat MCP tool input as untrusted.
- Avoid logging token values.
- Keep README examples using placeholders such as `<MCP_TOKEN>` rather than real secrets.
- Keep the existing app's browser/session auth behavior unchanged.

## MCP Tools

Expose exactly these MCP tools unless the selected SDK requires naming normalization:

- `create_card`
- `list_cards`
- `search_cards`

Tool names should be stable and documented. Tool descriptions should be concise but specific enough that an AI caller understands when to use each tool.

### `create_card`

Creates one or more cards in a batch. Duplicates are allowed.

Input schema:

```json
{
  "cards": [
    {
      "spanish_text": "Hola",
      "english_text": "Hello"
    }
  ]
}
```

Required validation:

- `cards` is required and must be a non-empty array.
- Each card requires `spanish_text` and `english_text`.
- Both text fields must be strings.
- Both text fields must be non-empty after trimming.
- Both text fields must satisfy the existing card text constraints, including the 70 character maximum from Epic 01 unless the current implementation has intentionally changed that limit.
- Fields are single-line strings; reject or normalize line breaks consistently with the existing card validation behavior.
- Unknown fields may be ignored or rejected. Prefer rejecting unknown fields if the existing validation style already does so; otherwise ignore them without persisting them.

Required save behavior:

- Valid cards should save even when other cards in the same request are invalid.
- Invalid cards should not save.
- Duplicate cards are allowed and should save if otherwise valid.
- Newly created cards should receive the same default scheduling behavior as cards created from the web UI, including being immediately due for training if FSRS is implemented.

Response shape should be structured and easy for an AI caller to inspect:

```json
{
  "created": [
    {
      "index": 0,
      "card": {
        "id": "...",
        "spanish_text": "Hola",
        "english_text": "Hello",
        "created_at": "2026-06-11T00:00:00.000Z",
        "updated_at": "2026-06-11T00:00:00.000Z"
      }
    }
  ],
  "failed": [
    {
      "index": 1,
      "input": {
        "spanish_text": "",
        "english_text": "Hello"
      },
      "errors": [
        {
          "field": "spanish_text",
          "message": "Spanish text is required."
        }
      ]
    }
  ]
}
```

The exact field names can follow existing project conventions, but the response must distinguish saved cards from failed inputs and include per-card failure details.

### `list_cards`

Returns all cards in the single deck.

Input schema:

```json
{}
```

Required behavior:

- Return every non-deleted card.
- Include both front and back card text.
- Include timestamps.
- Sort consistently. Prefer `created_at` ascending unless the existing card list has a different clear default.

Response shape:

```json
{
  "cards": [
    {
      "id": "...",
      "spanish_text": "Hola",
      "english_text": "Hello",
      "created_at": "2026-06-11T00:00:00.000Z",
      "updated_at": "2026-06-11T00:00:00.000Z"
    }
  ]
}
```

Do not include scheduling internals, review history, session data, or auth data in `list_cards` unless needed by existing card DTO conventions.

### `search_cards`

Searches existing cards to help an AI caller avoid creating near-duplicates.

Input schema:

```json
{
  "query": "hello",
  "language": "english",
  "limit": 10
}
```

Required fields:

- `query`: required non-empty string.
- `language`: required enum: `english`, `spanish`, or `both`.

Optional fields:

- `limit`: optional positive integer. Default to `10`. Cap at a reasonable maximum such as `50`.

Required behavior:

- Search only `english_text` when `language` is `english`.
- Search only `spanish_text` when `language` is `spanish`.
- Search both fields when `language` is `both`.
- Return ranked matches above a lenient threshold only.
- Do not return lots of unrelated cards.
- Exact normalized matches should rank first.
- Phrase containment should rank above typo-only fuzzy matches.
- Similar typo matches should be returned when close enough, such as `Helo` matching `Hello`.
- Return an empty result array when no match is above threshold.

Response shape:

```json
{
  "query": "hello",
  "language": "english",
  "matches": [
    {
      "card": {
        "id": "...",
        "spanish_text": "Hola",
        "english_text": "Hello",
        "created_at": "2026-06-11T00:00:00.000Z",
        "updated_at": "2026-06-11T00:00:00.000Z"
      },
      "matched_field": "english_text",
      "matched_text": "Hello",
      "score": 1,
      "rank_reason": "exact"
    }
  ]
}
```

`score` and `rank_reason` may use another clear representation, but results must be ordered from best to weakest match.

## Fuzzy Search Requirements

Use a fuzzy search library rather than hand-rolling all fuzzy matching. Recommended default: `Fuse.js`.

Rationale for `Fuse.js`:

- Mature and lightweight.
- Works well in TypeScript/Node without database extensions.
- Supports fuzzy matching and weighted fields.
- Good fit for a small personal flashcard dataset.
- Easy to wrap with deterministic ranking tests.

Search normalization should be deterministic and tested:

- Lowercase text.
- Trim leading/trailing whitespace.
- Collapse repeated spaces.
- Remove or ignore diacritics/accents for matching.
- Ignore punctuation where practical.
- Preserve enough token information to identify phrase containment.

Ranking guidance:

- Use exact normalized equality as the strongest match.
- Use normalized phrase containment as the next strongest match.
- Use Fuse.js fuzzy score for remaining candidates.
- Prefer short direct matches over long incidental matches when scores are otherwise similar.
- Configure the threshold leniently enough to catch near-duplicates but strictly enough to avoid unrelated cards. Start around a Fuse threshold of `0.35` and adjust based on tests.
- Apply a default result limit of `10` and a hard cap of `50`.

Required examples to satisfy tests:

- Query `Hello` should return `Hello` first.
- Query `Hello` should also return `Hello, how are you?`.
- Query `Hello` should also return `My favorite word is hello!`.
- Query `Hello` should return a similar typo such as `Helo` below exact and containment matches.
- Query `Hello` should not return clearly unrelated terms.
- Spanish searches should handle accents leniently, such as `adios` matching `adiós`.

## Architecture Expectations

- Keep MCP transport setup separate from card domain logic.
- Reuse existing card validation and persistence code where practical.
- If current card validation is embedded directly in route handlers, extract only the minimal reusable function needed by both HTTP routes and MCP tools.
- Keep fuzzy search in a domain/service module with direct unit tests.
- Keep MCP request validation schemas close to the tool definitions.
- Avoid adding multi-user, multi-deck, import/export, or card editing abstractions.
- Avoid adding a separate MCP package unless the existing project structure strongly benefits from it.
- Put imports at the top of files.

## Documentation Requirements

Update `README.md` with an MCP section.

Must document:

- `MCP_TOKEN` in the environment variable table.
- The MCP endpoint URL, defaulting to `http://localhost:4100/mcp` for local development if the current default API port remains `4100`.
- That callers must send `Authorization: Bearer <MCP_TOKEN>`.
- Available tools: `create_card`, `list_cards`, `search_cards`.
- Example request/use cases for creating cards and searching for duplicates.
- Setup examples for Opencode, OpenClaw, Claude CLI, and LM Studio.

Opencode example should use remote MCP config similar to:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "spanish-cards": {
      "type": "remote",
      "url": "http://localhost:4100/mcp",
      "enabled": true,
      "oauth": false,
      "headers": {
        "Authorization": "Bearer <MCP_TOKEN>"
      }
    }
  }
}
```

Claude CLI example should use HTTP transport similar to:

```bash
claude mcp add --transport http spanish-cards http://localhost:4100/mcp \
  --header "Authorization: Bearer <MCP_TOKEN>"
```

OpenClaw example should use `streamable-http` similar to:

```json5
{
  mcp: {
    servers: {
      "spanish-cards": {
        url: "http://localhost:4100/mcp",
        transport: "streamable-http",
        headers: {
          Authorization: "Bearer ${SPANISH_CARDS_MCP_TOKEN}",
        },
      },
    },
  },
}
```

LM Studio example should use its `mcp.json` remote server shape similar to:

```json
{
  "mcpServers": {
    "spanish-cards": {
      "url": "http://localhost:4100/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_TOKEN>"
      }
    }
  }
}
```

If the local API port is changed by the implementation, update examples accordingly.

## Testing Requirements

Include useful tests for MCP behavior and fuzzy matching.

Minimum expected coverage:

- Unit tests for fuzzy search normalization.
- Unit tests for fuzzy search ranking: exact > containment > close typo > unrelated excluded.
- Unit tests for Spanish accent-insensitive search.
- Unit tests for `search_cards` language filtering: `english`, `spanish`, and `both`.
- Unit or integration tests for MCP bearer token authentication.
- Integration tests for `create_card` partial success: valid cards save while invalid cards return per-index errors.
- Integration tests that `create_card` applies existing card validation, including required fields and maximum length.
- Integration tests for `list_cards` returning both text fields and timestamps.
- Smoke coverage that an MCP client can initialize/list/call the exposed tools if practical with the chosen SDK.

Avoid tests that only assert SDK internals. Focus on project behavior, auth, validation, persistence, and ranking.

## Acceptance Criteria

- The existing Express server exposes a Streamable HTTP MCP endpoint at `/mcp`.
- MCP requests require `Authorization: Bearer <MCP_TOKEN>`.
- Missing or invalid MCP auth returns a clear error and does not execute tools.
- `create_card` supports batch creation.
- `create_card` saves valid cards even if other cards in the same batch are invalid.
- `create_card` returns clear per-card validation failures for missing data, over-length data, and other existing card validation errors.
- Duplicate cards can be created through MCP.
- Cards created through MCP behave like UI-created cards, including training/scheduling defaults.
- `list_cards` returns all cards with `id`, `spanish_text`, `english_text`, `created_at`, and `updated_at`.
- `search_cards` searches English, Spanish, or both based on input.
- `search_cards` ranks exact matches above phrase containment and close typos.
- `search_cards` returns only matches above a lenient threshold and avoids unrelated results.
- README documents environment setup and MCP installation examples for Opencode, OpenClaw, Claude CLI, and LM Studio.
- `.env.example` documents `MCP_TOKEN`.
- Tests cover MCP auth, creation validation/partial success, listing shape, and fuzzy search ranking.

## Out of Scope

- OAuth for MCP.
- Multiple MCP tokens or per-client scopes.
- Public unauthenticated card API endpoints.
- stdio MCP support unless required only as a development fallback.
- SSE as the primary MCP transport.
- Card editing.
- Duplicate prevention during creation.
- Semantic translation matching or AI/LLM-based duplicate detection.
- Multiple decks.
- Multiple users.
- Import/export.
- Public sharing.
