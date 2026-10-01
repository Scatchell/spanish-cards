import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import type { AppConfig } from '../config.js';

export const EXPLANATION_MODEL = 'gpt-5.4-mini';

export type ExplanationGenerator = (
  spanishText: string,
  englishText: string,
) => Promise<string>;

// Prompts live as editable markdown files under src/prompts (copied to
// dist/prompts on build) rather than inline strings, so they can be tuned
// without touching code.
const PROMPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../prompts');

function loadPrompt(filename: string): string {
  return readFileSync(path.join(PROMPTS_DIR, filename), 'utf-8').trim();
}

const INSTRUCTIONS = loadPrompt('explain.md');

export type FollowUpGenerator = (input: {
  spanishText: string;
  englishText: string;
  explanationMarkdown: string;
  question: string;
}) => Promise<string>;

const FOLLOWUP_INSTRUCTIONS = loadPrompt('explain-followup.md');

export function createFollowUpGenerator(config: AppConfig): FollowUpGenerator | null {
  if (!config.openaiSecretKey) {
    return null;
  }
  const client = new OpenAI({
    apiKey: config.openaiSecretKey,
    ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    timeout: 20_000,
    maxRetries: 1,
  });
  return async ({ spanishText, englishText, explanationMarkdown, question }) => {
    const response = await client.responses.create({
      model: EXPLANATION_MODEL,
      instructions: FOLLOWUP_INSTRUCTIONS,
      input: [
        `Spanish: ${spanishText}`,
        `English translation: ${englishText}`,
        `Explanation already shown:\n${explanationMarkdown}`,
        `Learner's question: ${question}`,
      ].join('\n\n'),
      max_output_tokens: 300,
      reasoning: { effort: 'none' },
    });
    const text = response.output_text?.trim();
    if (!text) {
      throw new Error('Empty follow-up answer from model');
    }
    return text;
  };
}

export interface SubmittedReading {
  text: string; // what the learner typed, cleaned up for spelling/accents/punctuation
  translation: string; // best-effort translation of that text into the other language
}

export interface AnswerCheckOutput {
  verdict: 'valid' | 'invalid';
  suggestedAnswer: string | null;
  feedbackPoints: string[];
  submittedReading: SubmittedReading | null;
}

const MAX_FEEDBACK_POINTS = 3;

export type AnswerCheckGenerator = (input: {
  promptText: string; // the side shown to the learner
  expectedAnswer: string; // the card's stored answer for this direction
  submittedAnswer: string; // raw text the learner typed (may be empty)
}) => Promise<AnswerCheckOutput>;

const ANSWER_CHECK_INSTRUCTIONS = loadPrompt('answer-check.md');

// Part of the answer_checks cache key. Bump whenever answer-check.md changes in
// a way that could flip verdicts, so stale cached verdicts stop being served.
export const ANSWER_CHECK_PROMPT_VERSION = 3;

// Structured Outputs: the Responses API constrains decoding so the model's JSON
// literally cannot violate this schema (missing keys, wrong types, an out-of-enum
// verdict). This is enforced by OpenAI, not by us — it does not touch the e2e
// stub, which never inspects the request's `text.format`.
const ANSWER_CHECK_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['valid', 'invalid'] },
    suggestedAnswer: { type: ['string', 'null'] },
    feedbackPoints: { type: 'array', items: { type: 'string' } },
    submittedReading: {
      anyOf: [
        {
          type: 'object',
          properties: { text: { type: 'string' }, translation: { type: 'string' } },
          required: ['text', 'translation'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },
  },
  required: ['verdict', 'suggestedAnswer', 'feedbackPoints', 'submittedReading'],
  additionalProperties: false,
} as const;

// The schema guarantees shape and types but can't express the cross-field rule
// (suggestedAnswer must be null unless verdict is valid), the length cap, or the
// 1-3 feedbackPoints bound (strict mode has no minItems/maxItems), so those
// still need a boundary check. Throws on violation so the route maps it
// to a retryable 502.
export function parseAnswerCheck(raw: string | undefined): AnswerCheckOutput {
  if (!raw || raw.trim() === '') {
    throw new Error('Empty answer-check response from model');
  }
  const obj = JSON.parse(raw) as {
    verdict: 'valid' | 'invalid';
    suggestedAnswer: string | null;
    feedbackPoints: string[];
    submittedReading: SubmittedReading | null;
  };
  const feedbackPoints = obj.feedbackPoints
    .map((point) => point.trim())
    .filter((point) => point !== '')
    .slice(0, MAX_FEEDBACK_POINTS);
  if (feedbackPoints.length === 0) {
    throw new Error('Answer-check feedback was missing');
  }
  let suggestedAnswer: string | null = null;
  if (obj.verdict === 'valid' && typeof obj.suggestedAnswer === 'string') {
    const trimmed = obj.suggestedAnswer.trim();
    if (trimmed !== '') {
      suggestedAnswer = trimmed.slice(0, 70);
    }
  }
  // A reading with either half blank is as good as none.
  let submittedReading: SubmittedReading | null = null;
  if (obj.submittedReading) {
    const text = obj.submittedReading.text.trim();
    const translation = obj.submittedReading.translation.trim();
    if (text !== '' && translation !== '') {
      submittedReading = { text, translation };
    }
  }
  return { verdict: obj.verdict, suggestedAnswer, feedbackPoints, submittedReading };
}

export function createAnswerCheckGenerator(config: AppConfig): AnswerCheckGenerator | null {
  if (!config.openaiSecretKey) {
    return null;
  }
  const client = new OpenAI({
    apiKey: config.openaiSecretKey,
    ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    timeout: 20_000,
    maxRetries: 1,
  });
  return async ({ promptText, expectedAnswer, submittedAnswer }) => {
    const response = await client.responses.create({
      model: EXPLANATION_MODEL,
      instructions: ANSWER_CHECK_INSTRUCTIONS,
      input: [
        `Prompt shown to the learner: ${promptText}`,
        `Expected answer on the card: ${expectedAnswer}`,
        `Learner's submitted answer: ${submittedAnswer}`,
      ].join('\n'),
      text: {
        format: {
          type: 'json_schema',
          name: 'answer_check',
          strict: true,
          schema: ANSWER_CHECK_SCHEMA,
        },
      },
      // Reasoning tokens count against this cap; leave room for the JSON.
      max_output_tokens: 2000,
      // Low effort lets the model tell a real agreement error apart from a
      // choice the prompt leaves open (e.g. the gender of an implied "it").
      reasoning: { effort: 'low' },
    });
    return parseAnswerCheck(response.output_text);
  };
}

export function createExplanationGenerator(config: AppConfig): ExplanationGenerator | null {
  if (!config.openaiSecretKey) {
    return null;
  }
  const client = new OpenAI({
    apiKey: config.openaiSecretKey,
    ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    timeout: 20_000,
    maxRetries: 1,
  });
  return async (spanishText, englishText) => {
    const response = await client.responses.create({
      model: EXPLANATION_MODEL,
      instructions: INSTRUCTIONS,
      input: `Spanish: ${spanishText}\nEnglish translation to explain: ${englishText}`,
      max_output_tokens: 600,
      reasoning: { effort: 'none' },
    });
    const text = response.output_text?.trim();
    if (!text) {
      throw new Error('Empty explanation from model');
    }
    return text;
  };
}
