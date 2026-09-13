import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import type { AppConfig } from '../config.js';
import type { MistakeDetail, PracticeExample, PracticeSentence } from './repository.js';

export const PRACTICE_MODEL = 'gpt-5.4';

const PROMPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../prompts');

function loadPrompt(filename: string): string {
  return readFileSync(path.join(PROMPTS_DIR, filename), 'utf-8').trim();
}

const INSTRUCTIONS = loadPrompt('practice-sentences.md');

export interface PracticeGenerationInput {
  target: MistakeDetail;
  examples: PracticeExample[];
}

export type PracticeSentenceGenerator = (input: PracticeGenerationInput) => Promise<PracticeSentence[]>;

const PRACTICE_SENTENCES_SCHEMA = {
  type: 'object',
  properties: {
    sentences: {
      type: 'array',
      minItems: 10,
      maxItems: 10,
      items: {
        type: 'object',
        properties: {
          spanish: { type: 'string' },
          english: { type: 'string' },
        },
        required: ['spanish', 'english'],
        additionalProperties: false,
      },
    },
  },
  required: ['sentences'],
  additionalProperties: false,
} as const;

function describeMistake(detail: MistakeDetail): string {
  const lines = [
    detail.spanishText && detail.englishText
      ? `Full sentence — Spanish: "${detail.spanishText}" / English: "${detail.englishText}"`
      : 'Full sentence: (original card no longer available)',
    `Correct: "${detail.correctText}" | Submitted: "${detail.submittedText || '(nothing entered)'}" | Direction: ${detail.direction}`,
    `Category: ${detail.category} | Rationale: ${detail.rationale}`,
  ];
  if (detail.practiceTargets.length > 0) {
    const targets = detail.practiceTargets
      .map((t) => `${t.submitted ?? '(nothing entered)'} -> ${t.expected}`)
      .join(', ');
    lines.push(`Specific word/form(s) missed: ${targets}`);
  }
  return lines.join('\n');
}

function buildInput(input: PracticeGenerationInput): string {
  const sections = [`Target mistake:\n${describeMistake(input.target)}`];
  if (input.examples.length > 0) {
    const examples = input.examples
      .map((example, i) => `${i + 1}. (tier ${example.tier})\n${describeMistake(example)}`)
      .join('\n\n');
    sections.push(`Similar past examples:\n${examples}`);
  } else {
    sections.push('Similar past examples: none found — base the sentences on the target mistake alone.');
  }
  return sections.join('\n\n');
}

function parseSentences(raw: string | undefined): PracticeSentence[] {
  if (!raw || raw.trim() === '') {
    throw new Error('Empty practice-sentence response from model');
  }
  const parsed = JSON.parse(raw) as { sentences: PracticeSentence[] };
  if (parsed.sentences.length !== 10) {
    throw new Error(`Expected exactly 10 practice sentences, got ${parsed.sentences.length}`);
  }
  return parsed.sentences;
}

export function createPracticeSentenceGenerator(config: AppConfig): PracticeSentenceGenerator | null {
  if (!config.openaiSecretKey) {
    return null;
  }
  const client = new OpenAI({
    apiKey: config.openaiSecretKey,
    ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    timeout: 30_000,
    maxRetries: 1,
  });
  return async (input) => {
    const response = await client.responses.create({
      model: PRACTICE_MODEL,
      instructions: INSTRUCTIONS,
      input: buildInput(input),
      text: {
        format: {
          type: 'json_schema',
          name: 'practice_sentences',
          strict: true,
          schema: PRACTICE_SENTENCES_SCHEMA,
        },
      },
      max_output_tokens: 3000,
      // This call is user-triggered and rare (only on button click), unlike
      // the background categorization job, so a slightly larger reasoning
      // budget is worth it for sentence quality over latency.
      reasoning: { effort: 'medium' },
    });
    return parseSentences(response.output_text);
  };
}
