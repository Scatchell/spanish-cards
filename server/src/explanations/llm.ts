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
