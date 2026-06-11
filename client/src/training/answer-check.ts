// Deterministic lenient answer matching. The goal is to check whether the
// user remembered the word/phrase, not whether they typed it perfectly:
// accents, casing, punctuation (including ¿¡), and extra spaces are forgiven
// but reported, while word order and word identity must match exactly.

export type Verdict = 'correct' | 'correctWithDifferences' | 'incorrect';

// The correct answer split into segments for rendering; highlighted segments
// are the parts the submitted answer missed or got wrong.
export interface DiffSegment {
  text: string;
  highlight: boolean;
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
    return { verdict: 'correct', correctSegments: [{ text: correct, highlight: false }] };
  }
  const normalizedSubmitted = normalizeAnswer(submitted);
  if (normalizedSubmitted !== '' && normalizedSubmitted === normalizeAnswer(correct)) {
    return {
      verdict: 'correctWithDifferences',
      correctSegments: lenientDiffSegments(submitted, correct),
    };
  }
  return { verdict: 'incorrect', correctSegments: wordDiffSegments(submitted, correct) };
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
    const base = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return /^[\p{L}\p{N}]+$/u.test(base) ? { raw, norm: base } : { raw, norm: null };
  });
}

// Character-level diff for answers that matched only after normalization.
// Both answers have the same sequence of normalized letters, so letters align
// one-to-one; a letter is highlighted when its raw form differs (wrong accent,
// wrong case). Punctuation is highlighted when the submitted answer is missing
// that character.
function lenientDiffSegments(submitted: string, correct: string): DiffSegment[] {
  const correctChars = annotateChars(correct.trim());
  const submittedChars = annotateChars(submitted.trim());
  const submittedLetters = submittedChars.filter((c) => c.norm !== null);
  const availablePunctuation = countBy(
    submittedChars.filter((c) => c.norm === null && c.raw.trim() !== '').map((c) => c.raw),
  );

  let letterIndex = 0;
  const highlights = correctChars.map((c) => {
    if (c.norm !== null) {
      return c.raw !== submittedLetters[letterIndex++]?.raw;
    }
    if (c.raw.trim() === '') {
      return false; // whitespace differences were already forgiven wholesale
    }
    const available = availablePunctuation.get(c.raw) ?? 0;
    availablePunctuation.set(c.raw, available - 1);
    return available <= 0;
  });

  return toSegments(correctChars.map((c) => c.raw), highlights);
}

// Word-level diff for incorrect answers: each word of the correct answer is
// highlighted unless the submitted answer has the matching word in the same
// position.
function wordDiffSegments(submitted: string, correct: string): DiffSegment[] {
  const submittedWords = normalizeAnswer(submitted).split(' ');
  const parts = correct.trim().split(/(\s+)/);
  let wordIndex = 0;
  const segments = parts.map((part) => {
    if (part.trim() === '') {
      return { text: part, highlight: false };
    }
    const matches = normalizeAnswer(part) === submittedWords[wordIndex];
    wordIndex += 1;
    return { text: part, highlight: !matches };
  });
  return segments.filter((segment) => segment.text !== '');
}

function countBy(items: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
}

function toSegments(chars: string[], highlights: boolean[]): DiffSegment[] {
  const segments: DiffSegment[] = [];
  chars.forEach((char, i) => {
    const highlight = highlights[i] ?? false;
    const last = segments[segments.length - 1];
    if (last && last.highlight === highlight) {
      last.text += char;
    } else {
      segments.push({ text: char, highlight });
    }
  });
  return segments;
}
