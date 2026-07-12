import { Router } from 'express';
import type { DbPool } from '../db.js';
import { getCard } from '../cards/repository.js';
import { findExplanation, insertExplanation } from './repository.js';
import type { Explanation, NewExplanation } from './repository.js';
import { findAnswerCheck, insertAnswerCheck } from './answer-check-repository.js';
import type {
  AnswerCheck,
  AnswerCheckDirection,
  AnswerCheckKey,
  NewAnswerCheck,
} from './answer-check-repository.js';
import { getOrCreateExplanation } from './service.js';
import { getOrCreateAnswerCheck } from './answer-check-service.js';
import type { AnswerCheckGenerator, ExplanationGenerator, FollowUpGenerator } from './llm.js';

const MAX_QUESTION_CHARS = 500;
const MAX_CONTEXT_CHARS = 4000;
const MAX_SUBMITTED_CHARS = 500;

const DIRECTIONS: readonly AnswerCheckDirection[] = ['spanish-to-english', 'english-to-spanish'];

export interface ExplanationRouteDeps {
  getCard: (id: number) => Promise<import('../cards/repository.js').Card | null>;
  findExplanation: (spanish: string, english: string) => Promise<Explanation | null>;
  insertExplanation: (input: NewExplanation) => Promise<Explanation>;
  findAnswerCheck: (key: AnswerCheckKey) => Promise<AnswerCheck | null>;
  insertAnswerCheck: (input: NewAnswerCheck) => Promise<AnswerCheck>;
  followUp?: FollowUpGenerator | null;
  answerCheck?: AnswerCheckGenerator | null;
}

export function explanationRoutes(
  pool: DbPool,
  generator: ExplanationGenerator | null,
  followUp: FollowUpGenerator | null,
  answerCheck: AnswerCheckGenerator | null,
  overrides?: Partial<ExplanationRouteDeps>,
): Router {
  const router = Router();

  const deps: ExplanationRouteDeps = {
    getCard: overrides?.getCard ?? ((cardId) => getCard(pool, cardId)),
    findExplanation:
      overrides?.findExplanation ?? ((spanish, english) => findExplanation(pool, spanish, english)),
    insertExplanation:
      overrides?.insertExplanation ?? ((input) => insertExplanation(pool, input)),
    findAnswerCheck: overrides?.findAnswerCheck ?? ((key) => findAnswerCheck(pool, key)),
    insertAnswerCheck: overrides?.insertAnswerCheck ?? ((input) => insertAnswerCheck(pool, input)),
    followUp: overrides?.followUp !== undefined ? overrides.followUp : followUp,
    answerCheck: overrides?.answerCheck !== undefined ? overrides.answerCheck : answerCheck,
  };

  router.post('/:id/explanation', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Card id must be a positive integer' });
      return;
    }

    const card = await deps.getCard(id);
    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }

    if (card.languagePair !== 'en<->es') {
      res.status(400).json({ error: 'Explanations are not supported for this card type' });
      return;
    }

    let result;
    try {
      result = await getOrCreateExplanation(
        {
          findExplanation: deps.findExplanation,
          insertExplanation: deps.insertExplanation,
          generate: generator,
        },
        card.spanishText,
        card.englishText,
      );
    } catch (err) {
      console.error('Explanation generation failed:', err);
      res.status(502).json({ error: 'Explanation generation failed' });
      return;
    }

    if (result.status === 'unavailable') {
      res.status(502).json({ error: 'Explanation generation is not configured' });
      return;
    }

    res.json({
      explanation: {
        contentMarkdown: result.explanation.contentMarkdown,
        model: result.explanation.model,
        createdAt: result.explanation.createdAt,
      },
      source: result.source,
    });
  });

  router.post('/:id/explanation/follow-up', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Card id must be a positive integer' });
      return;
    }

    const { question, explanationMarkdown } = (req.body ?? {}) as {
      question?: unknown;
      explanationMarkdown?: unknown;
    };

    if (typeof question !== 'string' || question.trim().length === 0) {
      res.status(400).json({ error: 'A question is required' });
      return;
    }
    if (question.length > MAX_QUESTION_CHARS) {
      res.status(400).json({ error: 'Question is too long' });
      return;
    }
    if (typeof explanationMarkdown !== 'string' || explanationMarkdown.length > MAX_CONTEXT_CHARS) {
      res.status(400).json({ error: 'Invalid explanation context' });
      return;
    }

    const card = await deps.getCard(id);
    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }
    if (card.languagePair !== 'en<->es') {
      res.status(400).json({ error: 'Explanations are not supported for this card type' });
      return;
    }

    const generate = deps.followUp;
    if (!generate) {
      res.status(502).json({ error: 'Explanation generation is not configured' });
      return;
    }

    try {
      const answerMarkdown = await generate({
        spanishText: card.spanishText,
        englishText: card.englishText,
        explanationMarkdown,
        question: question.trim(),
      });
      res.json({ answerMarkdown });
    } catch (err) {
      console.error('Follow-up generation failed:', err);
      res.status(502).json({ error: 'Follow-up generation failed' });
    }
  });

  router.post('/:id/explanation/answer-check', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Card id must be a positive integer' });
      return;
    }

    const { submittedAnswer, direction } = (req.body ?? {}) as {
      submittedAnswer?: unknown;
      direction?: unknown;
    };

    // Empty submissions are allowed — junk/empty answers should still be checked.
    if (typeof submittedAnswer !== 'string' || submittedAnswer.length > MAX_SUBMITTED_CHARS) {
      res.status(400).json({ error: 'Invalid submitted answer' });
      return;
    }
    if (typeof direction !== 'string' || !DIRECTIONS.includes(direction as AnswerCheckDirection)) {
      res.status(400).json({ error: 'Invalid direction' });
      return;
    }

    const card = await deps.getCard(id);
    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }
    if (card.languagePair !== 'en<->es') {
      res.status(400).json({ error: 'Explanations are not supported for this card type' });
      return;
    }

    if (!deps.answerCheck) {
      res.status(502).json({ error: 'Answer check is not configured' });
      return;
    }

    let result;
    try {
      result = await getOrCreateAnswerCheck(
        {
          findAnswerCheck: deps.findAnswerCheck,
          insertAnswerCheck: deps.insertAnswerCheck,
          generate: deps.answerCheck,
        },
        {
          spanishText: card.spanishText,
          englishText: card.englishText,
          direction: direction as AnswerCheckDirection,
          submittedAnswer,
        },
      );
    } catch (err) {
      console.error('Answer check failed:', err);
      res.status(502).json({ error: 'Answer check failed' });
      return;
    }

    if (result.status === 'unavailable') {
      res.status(502).json({ error: 'Answer check is not configured' });
      return;
    }

    res.json({
      answerCheck: {
        verdict: result.answerCheck.verdict,
        suggestedAnswer: result.answerCheck.suggestedAnswer,
        critiqueMarkdown: result.answerCheck.critiqueMarkdown,
        createdAt: result.answerCheck.createdAt,
      },
      source: result.source,
    });
  });

  return router;
}
