import type { Evaluation } from './evaluator';

export type ReasoningReadiness = 'unevaluated' | 'revise' | 'optimal';

/** Navigation readiness is separate from verified completion and academic grades. */
export function reasoningReadiness(evaluation: Evaluation | null): ReasoningReadiness {
  if (!evaluation) return 'unevaluated';
  if (!evaluation.findings.length || !Number.isFinite(evaluation.score) || evaluation.score < 0 || evaluation.score > 100
    || evaluation.findings.some(finding => finding.status !== 'pass' && finding.status !== 'revise')
    || evaluation.findings.some(finding => ['contradiction', 'unsupported'].includes(finding.id) && finding.status !== 'pass')) return 'revise';
  const passed = evaluation.findings.filter(finding => finding.status === 'pass').length;
  return evaluation.approved && passed === evaluation.findings.length && evaluation.score === 100 ? 'optimal' : 'revise';
}
