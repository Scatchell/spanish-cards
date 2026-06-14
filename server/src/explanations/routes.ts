import { Router } from 'express';
import type { DbPool } from '../db.js';
import { getCard } from '../cards/repository.js';
import { findExplanation, insertExplanation } from './repository.js';
import type { Explanation, NewExplanation } from './repository.js';
import { getOrCreateExplanation } from './service.js';
import type { ExplanationGenerator, FollowUpGenerator } from './llm.js';

const MAX_QUESTION_CHARS = 500;
const MAX_CONTEXT_CHARS = 4000;

export interface ExplanationRouteDeps {
  getCard: (id: number) => Promise<import('../cards/repository.js').Card | null>;
  findExplanation: (spanish: string, english: string) => Promise<Explanation | null>;
  insertExplanation: (input: NewExplanation) => Promise<Explanation>;
  followUp?: FollowUpGenerator | null;
}

export function explanationRoutes(
  pool: DbPool,
  generator: ExplanationGenerator | null,
  followUp: FollowUpGenerator | null,
  overrides?: Partial<ExplanationRouteDeps>,
): Router {
  const router = Router();

  const deps: ExplanationRouteDeps = {
    getCard: overrides?.getCard ?? ((cardId) => getCard(pool, cardId)),
    findExplanation:
      overrides?.findExplanation ?? ((spanish, english) => findExplanation(pool, spanish, english)),
    insertExplanation:
      overrides?.insertExplanation ?? ((input) => insertExplanation(pool, input)),
    followUp: overrides?.followUp !== undefined ? overrides.followUp : followUp,
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

  return router;
}
