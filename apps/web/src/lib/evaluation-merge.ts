import type { AiEvaluation } from './ai-gateway';

export type DeterministicEvidence = { approved: boolean; findings: Array<{ id: string; status: 'pass' | 'revise'; detail: string }> };
export function mergeEvaluationEvidence(deterministic: DeterministicEvidence, ai: AiEvaluation | null) {
  const deterministicContradiction = deterministic.findings.some((finding) => finding.status === 'revise');
  const actionableAi = ai?.findings.filter((finding) => finding.sourceSpan || finding.nodeId) ?? [];
  const approved = Boolean(ai && !deterministicContradiction && deterministic.approved && ai.approved && ai.confidence >= 0.8);
  return { approved, aiApplied: actionableAi.length > 0, confidence: ai?.confidence ?? 1, deterministic, aiFindings: actionableAi };
}
