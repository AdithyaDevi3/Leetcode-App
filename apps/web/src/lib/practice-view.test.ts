import { describe, expect, it } from 'vitest';
import { parsePracticeStage, practiceStageUrl } from './practice-view';

describe('practice view navigation', () => {
  it('accepts only known view stages, with direct code access for assigned work', () => {
    expect(parsePracticeStage('feedback')).toBe('feedback');
    expect(parsePracticeStage('completed')).toBe('approach');
    expect(parsePracticeStage(null, true)).toBe('code');
    expect(parsePracticeStage('approach', true)).toBe('approach');
  });
  it('preserves activity and assignment scope while removing old scroll anchors', () => {
    expect(practiceStageUrl('https://example.test/practice?problem=pair&assignment=recipient#old', 'code'))
      .toBe('/practice?problem=pair&assignment=recipient&stage=code');
  });
});
