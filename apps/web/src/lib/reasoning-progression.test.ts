import { describe, expect, it } from 'vitest';
import { defaultPracticeItem } from './content';
import { evaluatePseudocode, type Evaluation } from './evaluator';
import { reasoningReadiness } from './reasoning-progression';

describe('reasoning navigation readiness', () => {
  it('permits a real complete plan and a close plan with a remaining check', () => {
    expect(reasoningReadiness(evaluatePseudocode(defaultPracticeItem.starterDraft))).toBe('optimal');
    const close = evaluatePseudocode(defaultPracticeItem.starterDraft.replace(/return/gi, 'report'));
    expect(close.approved).toBe(false);
    expect(reasoningReadiness(close)).toBe('close');
  });
  it('keeps explicit contradictions blocked even when keyword coverage is high', () => {
    expect(reasoningReadiness(evaluatePseudocode(`${defaultPracticeItem.starterDraft}\nSort the list.`))).toBe('revise');
    expect(reasoningReadiness(evaluatePseudocode(defaultPracticeItem.starterDraft, 'unsupported-activity'))).toBe('revise');
  });
  it('requires both 80 percent score and 80 percent passed checks', () => {
    const evaluation: Evaluation = { rubricVersion: 'test', approved: false, score: 80, summary: '',
      findings: Array.from({ length: 5 }, (_, index) => ({ id: String(index), label: '', detail: '', status: index < 4 ? 'pass' : 'revise' })) };
    expect(reasoningReadiness(evaluation)).toBe('close');
    expect(reasoningReadiness({ ...evaluation, score: 79 })).toBe('revise');
    expect(reasoningReadiness({ ...evaluation, score: 90, findings: evaluation.findings.map((finding, index) => ({ ...finding, status: index < 3 ? 'pass' : 'revise' })) })).toBe('revise');
    expect(reasoningReadiness({ ...evaluation, score: 101 })).toBe('revise');
    expect(reasoningReadiness({ ...evaluation, findings: [] })).toBe('revise');
    expect(reasoningReadiness(null)).toBe('unevaluated');
  });
});
