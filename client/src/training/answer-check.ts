// Deterministic lenient answer matching. The goal is to check whether the
// user remembered the word/phrase, not whether they typed it perfectly:
// accents, casing, punctuation (including ¿¡), and extra spaces are forgiven
// but reported, while word order and word identity must match exactly.

import { diffArrays } from 'diff';

export type Verdict = 'correct' | 'correctWithDifferences' | 'incorrect';
export type SegmentKind = 'unchanged' | 'missing' | 'extra';

// The correct answer split into segments for rendering. 'missing' = correct
// content the user omitted or got wrong (yellow highlight). 'extra' = words
// the user typed that don't belong (yellow + strikethrough). 'unchanged' =
// plain text.
export interface DiffSegment {
  text: string;
  kind: SegmentKind;
}

export interface AnswerCheckResult {
  verdict: Verdict;
  correctSegments: DiffSegment[];
}

interface AnnotatedChar {
  raw: string;
  // Normalized form (base letter, lowercased), or null for characters that
  // normalization ignores (punctuation and other stray characters).
  norm: string | null;
}

export function checkAnswer(submitted: string, correctAnswer: string): AnswerCheckResult {
  const correct = correctAnswer.trim();
  if (submitted.trim() === correct) {
    return { verdict: 'correct', correctSegments: [{ text: correct, kind: 'unchanged' }] };
  }
  const normalizedSubmitted = normalizeAnswer(submitted);
  const verdict: Verdict =
    normalizedSubmitted !== '' && normalizedSubmitted === normalizeAnswer(correct)
      ? 'correctWithDifferences'
      : 'incorrect';
  return { verdict, correctSegments: diffSegments(submitted, correct) };
}

// Lowercased, diacritics stripped, punctuation removed, whitespace collapsed.
export function normalizeAnswer(text: string): string {
  const words: string[] = [];
  for (const rawWord of text.split(/\s+/)) {
    const word = annotateChars(rawWord)
      .map((c) => c.norm ?? '')
      .join('');
    if (word !== '') {
      words.push(word);
    }
  }
  return words.join(' ');
}

function annotateChars(text: string): AnnotatedChar[] {
  return [...text].map((raw) => {
    const base = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return /^[\p{L}\p{N}]+$/u.test(base) ? { raw, norm: base } : { raw, norm: null };
  });
}

function normalizeWord(word: string): string {
  return annotateChars(word)
    .map((c) => c.norm ?? '')
    .join('');
}

function coalesce(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const seg of segments) {
    if (seg.text === '') continue;
    const last = out[out.length - 1];
    if (last && last.kind === seg.kind) last.text += seg.text;
    else out.push({ ...seg });
  }
  return out;
}

// Char-level diff for a single aligned word pair. Because the diffArrays
// comparator guarantees equal normalized letters, letters align one-to-one.
function inWordSegments(submitted: string, correct: string): DiffSegment[] {
  const correctChars = annotateChars(correct);
  const submittedChars = annotateChars(submitted);
  const submittedLetters = submittedChars.filter((c) => c.norm !== null);

  let letterIndex = 0;
  return coalesce(
    correctChars.map((c) => {
      if (c.norm !== null) {
        const changed = c.raw.toLowerCase() !== submittedLetters[letterIndex++]?.raw.toLowerCase();
        return { text: c.raw, kind: changed ? 'missing' : 'unchanged' };
      }
      return { text: c.raw, kind: 'unchanged' };
    }),
  );
}

// Unified token-level diff using diffArrays with a normalization-aware
// comparator. Common word pairs run through inWordSegments for char-level
// accent/case highlighting. Submitted-only words become 'extra' (strikethrough)
// and correct-only words become 'missing'.
function diffSegments(submitted: string, correct: string): DiffSegment[] {
  const submittedWords = submitted.trim().split(/\s+/).filter((w) => w !== '');
  const correctWords = correct.trim().split(/\s+/).filter((w) => w !== '');

  const parts = diffArrays(submittedWords, correctWords, {
    comparator: (a, b) => normalizeWord(a) === normalizeWord(b),
  });

  const segments: DiffSegment[] = [];
  let si = 0;
  let ci = 0;
  let needsSpace = false;

  const pushWord = (wordSegments: DiffSegment[]) => {
    if (needsSpace) segments.push({ text: ' ', kind: 'unchanged' });
    segments.push(...wordSegments);
    needsSpace = true;
  };

  for (const part of parts) {
    if (part.removed) {
      part.value.forEach((word) => pushWord([{ text: word, kind: 'extra' }]));
      si += part.value.length;
    } else if (part.added) {
      part.value.forEach((word) => pushWord([{ text: word, kind: 'missing' }]));
      ci += part.value.length;
    } else {
      part.value.forEach((_, k) => {
        pushWord(inWordSegments(submittedWords[si + k]!, correctWords[ci + k]!));
      });
      si += part.value.length;
      ci += part.value.length;
    }
  }

  return coalesce(segments);
}
