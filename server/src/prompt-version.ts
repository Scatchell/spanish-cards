// One hand-bumped version covering the prompts behind cached LLM output (semver):
//   major — a prompt file added or removed
//   minor — a meaningful change to an existing prompt
//   patch — a small wording tweak (a few words, a rephrased sentence)
// Bump ONLY when explain.md or answer-check.md changes (or a cache-feeding
// prompt is added/removed); categorize.md, practice-sentences.md and
// explain-followup.md don't feed a cache, so changing them needs no bump.
// Cached LLM output (explanations, answer_checks) records the version and
// model that produced it; a lookup that finds a row stamped differently
// regenerates it and overwrites the row in place. The code only compares for
// equality — the semver parts are for humans picking the next number.
// Bumping this does NOT regenerate stored user records (mistake
// categorizations, practice sentences); those are data, not caches.
//
// Lives outside src/prompts on purpose: the build copies that directory with
// `cp -r`, which would nest the markdown if tsc had already created it.
export const PROMPT_VERSION = '1.0.0';

export interface CacheStamp {
  model: string;
  promptVersion: string;
}

export function isCacheEntryCurrent(entry: CacheStamp, current: CacheStamp): boolean {
  return entry.model === current.model && entry.promptVersion === current.promptVersion;
}
