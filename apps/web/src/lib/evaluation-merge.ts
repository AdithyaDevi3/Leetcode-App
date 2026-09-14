import type { AiEvaluation } from './ai-gateway';
import { evaluationPolicy } from './evaluation-policy';

export type DeterministicEvidence = { approved: boolean; findings: Array<{ id: string; status: 'pass' | 'revise'; detail: string }> };
export function mergeEvaluationEvidence(deterministic: DeterministicEvidence, ai: AiEvaluation | null) {
  const deterministicContradiction = deterministic.findings.some((finding) => finding.status === 'revise');
  const actionableAi = ai?.findings.filter((finding) => finding.sourceSpan || finding.nodeId) ?? [];
  const approved = Boolean(ai && !deterministicContradiction && deterministic.approved && ai.approved && ai.confidence >= evaluationPolicy.minimumAiConfidence);
  return { approved, aiApplied: actionableAi.length > 0, confidence: ai?.confidence ?? 1, deterministic, aiFindings: actionableAi };
}
