import {
  ArrowLeftRight,
  BookOpen,
  HelpCircle,
  Link2,
  MessageSquareQuote,
  Puzzle,
  Repeat,
  Scale,
  SpellCheck,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { Category } from '../api.js';

export interface CategoryInfo {
  category: Category;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
}

// Order matches server/src/categorization/repository.ts's CATEGORIES, and
// descriptions summarize server/src/prompts/categorize.md's category
// definitions — keep both in sync if the prompt's categories change.
export const CATEGORY_INFO: CategoryInfo[] = [
  {
    category: 'vocabulary',
    label: 'Vocabulary',
    description: 'Wrong word or confused similar words.',
    icon: BookOpen,
  },
  {
    category: 'verb_form',
    label: 'Verb form',
    description: 'Right verb, wrong person, tense, or mood.',
    icon: Repeat,
  },
  {
    category: 'agreement',
    label: 'Agreement',
    description: 'Gender or number mismatch between words.',
    icon: Link2,
  },
  {
    category: 'grammar_words',
    label: 'Grammar words',
    description: 'Articles, prepositions, pronouns, ser/estar, por/para.',
    icon: Puzzle,
  },
  {
    category: 'word_order',
    label: 'Word order',
    description: 'Right words, wrong arrangement.',
    icon: ArrowLeftRight,
  },
  {
    category: 'missing_extra_meaning',
    label: 'Missing/extra meaning',
    description: 'Information left out, added, or changed.',
    icon: Scale,
  },
  {
    category: 'spelling_accents',
    label: 'Spelling & accents',
    description: 'Right word, wrong spelling or accent marks.',
    icon: SpellCheck,
  },
  {
    category: 'idiom',
    label: 'Idiom',
    description: 'Too literal a translation of a natural expression.',
    icon: MessageSquareQuote,
  },
  {
    category: 'recall_failure',
    label: "Didn't recall",
    description: 'Blank, unrelated, or no usable answer.',
    icon: HelpCircle,
  },
];
