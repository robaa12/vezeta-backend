import { describe, it, expect } from '@jest/globals';
import {
  REQUIRED_NAME_WORDS,
  countNameWords,
  hasRequiredWordCount,
  normalizeSignupName,
} from './name-normalization.js';

describe('normalizeSignupName', () => {
  it('trims, collapses inner whitespace and lowercases', () => {
    expect(normalizeSignupName('  Ahmed   ALI  Hassan Omar ')).toBe(
      'ahmed ali hassan omar',
    );
  });

  it('treats tabs and newlines as whitespace', () => {
    expect(normalizeSignupName('Ahmed\tAli\nHassan  Omar')).toBe(
      'ahmed ali hassan omar',
    );
  });

  it('leaves Arabic text unchanged apart from spacing', () => {
    expect(normalizeSignupName('  أحمد   علي حسن عمر ')).toBe(
      'أحمد علي حسن عمر',
    );
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeSignupName('   ')).toBe('');
  });
});

describe('countNameWords', () => {
  it('counts words after collapsing whitespace', () => {
    expect(countNameWords('  Ahmed   Ali  Hassan Omar ')).toBe(4);
  });

  it('counts an empty or whitespace-only name as zero', () => {
    expect(countNameWords('')).toBe(0);
    expect(countNameWords('   ')).toBe(0);
  });
});

describe('hasRequiredWordCount', () => {
  it(`accepts exactly ${REQUIRED_NAME_WORDS} words`, () => {
    expect(hasRequiredWordCount('Ahmed Ali Hassan Omar')).toBe(true);
  });

  it('rejects too few and too many words', () => {
    expect(hasRequiredWordCount('Ahmed Ali Hassan')).toBe(false);
    expect(hasRequiredWordCount('Ahmed Ali Hassan Omar Farouk')).toBe(false);
  });
});
