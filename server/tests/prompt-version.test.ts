import { describe, expect, it } from 'vitest';
import { PROMPT_VERSION, isCacheEntryCurrent } from '../src/prompt-version.js';

const CURRENT = { model: 'gpt-5.4-mini', promptVersion: '1.2.3' };

describe('isCacheEntryCurrent', () => {
  it('is current when model and prompt version both match', () => {
    expect(isCacheEntryCurrent({ ...CURRENT }, CURRENT)).toBe(true);
  });

  it('is stale when the prompt version differs, even by a patch', () => {
    expect(isCacheEntryCurrent({ ...CURRENT, promptVersion: '1.2.2' }, CURRENT)).toBe(false);
  });

  it('is stale when the stored version is newer (e.g. after a rollback)', () => {
    expect(isCacheEntryCurrent({ ...CURRENT, promptVersion: '2.0.0' }, CURRENT)).toBe(false);
  });

  it('is stale when the model differs', () => {
    expect(isCacheEntryCurrent({ ...CURRENT, model: 'gpt-4o-mini' }, CURRENT)).toBe(false);
  });
});

describe('PROMPT_VERSION', () => {
  it('is a major.minor.patch string', () => {
    expect(PROMPT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
