import { describe, expect, it } from 'vitest';
import { clampTzOffset } from '../../src/progress/tz.js';

describe('clampTzOffset', () => {
  it('passes through sane offsets and defaults invalid input to UTC', () => {
    expect(clampTzOffset('120')).toBe(120);
    expect(clampTzOffset('-300')).toBe(-300);
    expect(clampTzOffset(undefined)).toBe(0);
    expect(clampTzOffset('not-a-number')).toBe(0);
    expect(clampTzOffset('1.5')).toBe(0);
  });

  it('clamps offsets beyond UTC±14', () => {
    expect(clampTzOffset('100000')).toBe(840);
    expect(clampTzOffset('-100000')).toBe(-840);
  });
});
