export type AppealSecondPassInput = { findingId: string; originalFindingStatus: 'pass' | 'revise'; learnerContext: string; evidenceReferences: string[] };
export type AppealSecondPassResult = { decision: 'confirm' | 'reverse' | 'needs_review'; rationale: string };

export function runAppealSecondPass(input: AppealSecondPassInput): AppealSecondPassResult {
  const context = input.learnerContext.trim();
  if (!context || input.evidenceReferences.length === 0) return { decision: 'needs_review', rationale: 'The appeal needs specific context and evidence before it can be resolved.' };
  const explicitCorrection = /(?:step|line|paragraph)\s+\d+|evidence|shown|described/i.test(context);
  if (input.originalFindingStatus === 'revise' && explicitCorrection) return { decision: 'needs_review', rationale: 'The learner cited evidence that may satisfy the finding; a distinct reviewer should verify it.' };
  return { decision: 'confirm', rationale: 'The submitted context does not contradict the original evidence-linked finding.' };
}
