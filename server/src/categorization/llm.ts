import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import type { AppConfig } from '../config.js';
import { CATEGORIES } from './repository.js';
import type { Category } from './repository.js';

export const CATEGORIZATION_MODEL = 'gpt-5.4-mini';

const PROMPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../prompts');

function loadPrompt(filename: string): string {
  return readFileSync(path.join(PROMPTS_DIR, filename), 'utf-8').trim();
}

const INSTRUCTIONS = loadPrompt('categorize.md');

export interface CategorizationInput {
  index: number;
  direction: string;
  verdict: string;
  correctText: string;
  submittedText: string;
}

export interface PracticeTarget {
  expected: string;
  submitted: string | null;
}

export interface CategorizationOutput {
  index: number;
  category: Category;
  rationale: string;
  practiceTargets: PracticeTarget[];
}

export type CategorizationGenerator = (
  items: CategorizationInput[],
) => Promise<CategorizationOutput[]>;

// Structured Outputs require an object at the schema root, so the array of
// per-item results is wrapped in a `results` key rather than returned bare.
const CATEGORIZE_BATCH_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'number' },
          category: { type: 'string', enum: [...CATEGORIES] },
          rationale: { type: 'string' },
          practiceTargets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                expected: { type: 'string' },
                submitted: { type: ['string', 'null'] },
              },
              required: ['expected', 'submitted'],
              additionalProperties: false,
            },
          },
        },
        required: ['index', 'category', 'rationale', 'practiceTargets'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
} as const;

function buildInput(items: CategorizationInput[]): string {
  return items
    .map(
      (item) =>
        `${item.index}. direction: ${item.direction}; verdict: ${item.verdict}; ` +
        `correct: "${item.correctText}"; submitted: "${item.submittedText}"`,
    )
    .join('\n');
}

function parseCategorizationBatch(raw: string | undefined): CategorizationOutput[] {
  if (!raw || raw.trim() === '') {
    throw new Error('Empty categorization response from model');
  }
  const parsed = JSON.parse(raw) as { results: CategorizationOutput[] };
  return parsed.results;
}

export function createCategorizationGenerator(config: AppConfig): CategorizationGenerator | null {
  if (!config.openaiSecretKey) {
    return null;
  }
  const client = new OpenAI({
    apiKey: config.openaiSecretKey,
    ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    timeout: 20_000,
    maxRetries: 1,
  });
  return async (items) => {
    const response = await client.responses.create({
      model: CATEGORIZATION_MODEL,
      instructions: INSTRUCTIONS,
      input: buildInput(items),
      text: {
        format: {
          type: 'json_schema',
          name: 'categorize_batch',
          strict: true,
          schema: CATEGORIZE_BATCH_SCHEMA,
        },
      },
      // Sized for ~30-item batches (~140 tokens/item for a category + short
      // rationale), comparable to the ~500/item budget used for answer_check.
      max_output_tokens: 4200,
      // A deliberate departure from the 'none' used by the synchronous
      // explanation/answer-check calls: this job is background/async with no
      // one waiting on the response, and several categories genuinely
      // overlap (e.g. "soy cansado" could be grammar_words or agreement), so
      // a small reasoning budget is spent on accuracy instead of latency.
      reasoning: { effort: 'low' },
    });
    return parseCategorizationBatch(response.output_text);
  };
}
