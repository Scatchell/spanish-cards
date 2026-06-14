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
