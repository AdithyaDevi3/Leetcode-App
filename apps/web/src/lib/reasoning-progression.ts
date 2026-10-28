import type { Evaluation } from './evaluator';

export type ReasoningReadiness = 'unevaluated' | 'revise' | 'close' | 'optimal';

/** Navigation readiness is separate from verified completion and academic grades. */
export function reasoningReadiness(evaluation: Evaluation | null): ReasoningReadiness {
  if (!evaluation) return 'unevaluated';
  if (!evaluation.findings.length || !Number.isFinite(evaluation.score) || evaluation.score < 0 || evaluation.score > 100
    || evaluation.findings.some(finding => finding.status !== 'pass' && finding.status !== 'revise')
    || evaluation.findings.some(finding => ['contradiction', 'unsupported'].includes(finding.id) && finding.status !== 'pass')) return 'revise';
  const passed = evaluation.findings.filter(finding => finding.status === 'pass').length;
  if (evaluation.approved && passed === evaluation.findings.length && evaluation.score === 100) return 'optimal';
  return evaluation.score >= 80 && passed / evaluation.findings.length >= 0.8 ? 'close' : 'revise';
}
