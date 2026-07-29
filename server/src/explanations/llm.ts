import OpenAI from 'openai';
import type { AppConfig } from '../config.js';

export const EXPLANATION_MODEL = 'gpt-5.4-mini';

export type ExplanationGenerator = (
  spanishText: string,
  englishText: string,
) => Promise<string>;

const INSTRUCTIONS = [
  'You are a concise Spanish grammar tutor helping an English speaker memorize flashcards.',
  'You are given a Spanish word or phrase and the English translation the learner memorizes for it.',
  'Explain why the Spanish supports that English translation: break the phrase into meaningful chunks',
  'and add brief grammar notes (reflexives, articles, tense, idiom, word order) only where they help.',
  'For a single vocabulary word, give a short note on usage, gender, or memorable structure instead of a breakdown.',
  'Treat the provided English translation as the answer being explained; do not propose a different translation as the main output.',
  'Respond in GitHub-flavored markdown using short bullet points. Be scannable and brief: usually 3-6 bullets, no headings, no preamble.',
].join(' ');

export type FollowUpGenerator = (input: {
  spanishText: string;
  englishText: string;
  explanationMarkdown: string;
  question: string;
}) => Promise<string>;

const FOLLOWUP_INSTRUCTIONS = [
  'You are a concise Spanish language tutor answering a single follow-up question',
  'about one specific flashcard sentence. You are given the Spanish text, its',
  'English translation, the explanation already shown to the learner, and their',
  'question.',
  'Answer ONLY that question, strictly about the Spanish language content shown',
  '(grammar, word choice, tense, alternatives, nuance).',
  'Explain in English (of course, using Spanish examples) so the learner can more',
  'easily understand the response.',
  'Do not introduce unrelated vocabulary or new sentences to study.',
  'Be brief and scannable: a few short sentences or up to ~4 bullets, no preamble,',
  'no headings. Respond in GitHub-flavored markdown.',
  'NEVER offer follow ups. This is not a long running conversation, just a quick one off follow up answer.',
  'If the question is not about this sentence or about Spanish, briefly say you can',
  'only help with this sentence.',
].join(' ');

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

export interface AnswerCheckOutput {
  verdict: 'valid' | 'invalid';
  suggestedAnswer: string | null;
  critiqueMarkdown: string;
}

export type AnswerCheckGenerator = (input: {
  promptText: string; // the side shown to the learner
  expectedAnswer: string; // the card's stored answer for this direction
  submittedAnswer: string; // raw text the learner typed (may be empty)
}) => Promise<AnswerCheckOutput>;

const ANSWER_CHECK_INSTRUCTIONS = [
  'You are a strict, conservative Spanish/English translation examiner for one flashcard.',
  'You are given the prompt the learner saw, the expected answer stored on the card, and',
  'the answer the learner actually submitted.',
  '1. Judge, strictly, whether the submitted answer is an equal-or-better translation of',
  '   the prompt than the expected answer. Favor the most natural, native phrasing; do',
  '   NOT be lenient or eager to validate the learner. A different-but-equally-correct',
  '   rendering counts as "valid"; anything with a real error (wrong tense, gender/number',
  '   agreement, wrong preposition, wrong word, missing/added meaning, nonsense/empty)',
  '   counts as "invalid".',
  '2. Write a brief GitHub-flavored-markdown critique addressed directly to the learner as',
  '   "you"/"your", in plain language a language learner would use — never internal terms',
  '   like "prompt", "the card", or "expected answer". Refer to the two texts naturally,',
  '   e.g. "your translation" or "the Spanish/English phrase". When invalid, name the',
  '   specific error(s) concretely (say what is actually wrong, e.g. "this is a different',
  '   verb tense" or "your answer doesn\'t translate to that phrase", not vague labels like',
  '   "unrelated to the prompt"); when valid, briefly say why it is an acceptable or better',
  '   alternative. Do not call out small typo/style slips (missing accents, missing inverted',
  '   punctuation, capitalization, extra spacing) as their own bullet point — they are not',
  '   meaningful errors. A few short bullets, no headings, no preamble.',
  '3. When invalid, end with one final bullet giving your best-effort translation of exactly',
  '   what the learner typed, corrected only for spelling/accents/punctuation/spacing (never',
  '   for grammar or word choice), so they can see what their own words actually mean.',
  '   Format it as: `<cleaned-up version of what they typed> :: <its best English',
  '   translation>` compared against `<the correct phrase> :: <its translation>`, e.g.',
  '   "What you typed reads: No me da cuenta :: I don\'t realize. The correct phrase is:',
  '   No me di cuenta :: I didn\'t realize." If the learner\'s answer is unintelligible or',
  '   empty, say so briefly instead of forcing a translation.',
  '4. Set suggestedAnswer to the exact wording to store on the card ONLY when verdict is',
  '   "valid" (otherwise null). Keep suggestedAnswer a single line, at most 70 characters.',
].join(' ');

// Structured Outputs: the Responses API constrains decoding so the model's JSON
// literally cannot violate this schema (missing keys, wrong types, an out-of-enum
// verdict). This is enforced by OpenAI, not by us — it does not touch the e2e
// stub, which never inspects the request's `text.format`.
const ANSWER_CHECK_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['valid', 'invalid'] },
    suggestedAnswer: { type: ['string', 'null'] },
    critiqueMarkdown: { type: 'string' },
  },
  required: ['verdict', 'suggestedAnswer', 'critiqueMarkdown'],
  additionalProperties: false,
} as const;

// The schema guarantees shape and types but can't express the cross-field rule
// (suggestedAnswer must be null unless verdict is valid) or the length cap, so
// those still need a boundary check. Throws on violation so the route maps it
// to a retryable 502.
function parseAnswerCheck(raw: string | undefined): AnswerCheckOutput {
  if (!raw || raw.trim() === '') {
    throw new Error('Empty answer-check response from model');
  }
  const obj = JSON.parse(raw) as {
    verdict: 'valid' | 'invalid';
    suggestedAnswer: string | null;
    critiqueMarkdown: string;
  };
  const critiqueMarkdown = obj.critiqueMarkdown.trim();
  if (critiqueMarkdown === '') {
    throw new Error('Answer-check critique was missing');
  }
  let suggestedAnswer: string | null = null;
  if (obj.verdict === 'valid' && typeof obj.suggestedAnswer === 'string') {
    const trimmed = obj.suggestedAnswer.trim();
    if (trimmed !== '') {
      suggestedAnswer = trimmed.slice(0, 70);
    }
  }
  return { verdict: obj.verdict, suggestedAnswer, critiqueMarkdown };
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
      max_output_tokens: 500,
      reasoning: { effort: 'none' },
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
