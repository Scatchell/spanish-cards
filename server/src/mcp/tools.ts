import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Card } from '../cards/repository.js';
import { saveCardBatch } from '../cards/service.js';
import type { CardField, CardInput } from '../cards/validation.js';
import { CARD_TEXT_MAX_LENGTH } from '../cards/validation.js';
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT, searchCards } from '../cards/search.js';
import type { MatchedField } from '../cards/search.js';

// The card functions MCP tools need, injected so this module stays decoupled
// from the database and easy to exercise in tests.
export interface McpDeps {
  listCards: () => Promise<Card[]>;
  insertCards: (inputs: CardInput[]) => Promise<Card[]>;
}

// MCP responses use snake_case field names (the wire convention for MCP
// tools); the domain layer stays camelCase.
const cardDtoSchema = {
  id: z.number(),
  spanish_text: z.string(),
  english_text: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
};

const cardInputSchema = z.object({
  spanish_text: z
    .string()
    .describe(`Spanish side of the card. Single line, 1-${CARD_TEXT_MAX_LENGTH} characters.`),
  english_text: z
    .string()
    .describe(`English side of the card. Single line, 1-${CARD_TEXT_MAX_LENGTH} characters.`),
});

export function buildMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: 'spanish-cards', version: '1.0.0' });

  server.registerTool(
    'create_card',
    {
      title: 'Create flashcards',
      description:
        'Create one or more Spanish/English flashcards in a batch. Valid cards are saved even when ' +
        'other cards in the same batch fail validation; failures are reported per index. Duplicates ' +
        'are allowed — call search_cards first to avoid creating near-duplicates. New cards are ' +
        'immediately due for training.',
      inputSchema: {
        cards: z.array(cardInputSchema).min(1).describe('Cards to create.'),
      },
      outputSchema: {
        created: z.array(z.object({ index: z.number(), card: z.object(cardDtoSchema) })),
        failed: z.array(
          z.object({
            index: z.number(),
            input: cardInputSchema,
            errors: z.array(z.object({ field: z.string(), message: z.string() })),
          }),
        ),
      },
    },
    async ({ cards }) => {
      const inputs: CardInput[] = cards.map((card) => ({
        spanishText: card.spanish_text,
        englishText: card.english_text,
      }));
      const result = await saveCardBatch(inputs, deps.insertCards);
      const failedIndexes = new Set(result.failures.map((failure) => failure.index));
      const createdIndexes = inputs.map((_, i) => i).filter((i) => !failedIndexes.has(i));
      const payload = {
        created: result.saved.map((card, i) => ({ index: createdIndexes[i] ?? i, card: toCardDto(card) })),
        failed: result.failures.map((failure) => ({
          index: failure.index,
          input: cards[failure.index],
          errors: failure.errors.map((error) => ({ field: toDtoField(error.field), message: error.message })),
        })),
      };
      return structured(payload);
    },
  );

  server.registerTool(
    'list_cards',
    {
      title: 'List all flashcards',
      description:
        'List every flashcard in the deck with both text sides and timestamps, newest first. ' +
        'For duplicate checking against a specific phrase, prefer search_cards.',
      inputSchema: {},
      outputSchema: { cards: z.array(z.object(cardDtoSchema)) },
    },
    async () => {
      const cards = await deps.listCards();
      return structured({ cards: cards.map(toCardDto) });
    },
  );

  server.registerTool(
    'search_cards',
    {
      title: 'Search flashcards (duplicate check)',
      description:
        'Fuzzy-search existing cards by English text, Spanish text, or both. Use before create_card ' +
        'to check for near-duplicates. Matching ignores case, accents, and punctuation; results are ' +
        'ranked exact > phrase containment > close typo, and unrelated cards are excluded.',
      inputSchema: {
        query: z.string().min(1).describe('Text to search for.'),
        language: z
          .enum(['english', 'spanish', 'both'])
          .describe('Which card side(s) to search: english_text, spanish_text, or both.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_LIMIT)
          .optional()
          .describe(`Maximum matches to return (default ${DEFAULT_SEARCH_LIMIT}, max ${MAX_SEARCH_LIMIT}).`),
      },
      outputSchema: {
        query: z.string(),
        language: z.string(),
        matches: z.array(
          z.object({
            card: z.object(cardDtoSchema),
            matched_field: z.enum(['spanish_text', 'english_text']),
            matched_text: z.string(),
            score: z.number().describe('1 is a perfect match; results are ordered best to weakest.'),
            rank_reason: z.enum(['exact', 'containment', 'fuzzy']),
          }),
        ),
      },
    },
    async ({ query, language, limit }) => {
      const cards = await deps.listCards();
      const matches = searchCards(cards, query, language, limit ?? DEFAULT_SEARCH_LIMIT);
      const payload = {
        query,
        language,
        matches: matches.map((match) => ({
          card: toCardDto(match.card),
          matched_field: toDtoField(match.matchedField),
          matched_text: match.matchedText,
          score: match.score,
          rank_reason: match.rankReason,
        })),
      };
      return structured(payload);
    },
  );

  return server;
}

function toCardDto(card: Card) {
  return {
    id: card.id,
    spanish_text: card.spanishText,
    english_text: card.englishText,
    created_at: card.createdAt,
    updated_at: card.updatedAt,
  };
}

function toDtoField(field: CardField | MatchedField): 'spanish_text' | 'english_text' {
  return field === 'spanishText' ? 'spanish_text' : 'english_text';
}

function structured(payload: object) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}
