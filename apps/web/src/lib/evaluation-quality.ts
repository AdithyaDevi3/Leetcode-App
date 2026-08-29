export type LabeledEvaluation = { expectedApproved: boolean; actualApproved: boolean; expertApproved?: boolean };
export type EvaluationQualityMetrics = { criticalErrorRecall: number; falseAcceptanceRate: number; falseRejectionRate: number; expertAgreement: number | null };

const ratio = (numerator: number, denominator: number) => denominator === 0 ? 1 : numerator / denominator;
export function measureEvaluationQuality(samples: LabeledEvaluation[]): EvaluationQualityMetrics {
  const expectedReject = samples.filter((sample) => !sample.expectedApproved);
  const expectedApprove = samples.filter((sample) => sample.expectedApproved);
  const expert = samples.filter((sample) => sample.expertApproved !== undefined);
  return {
    criticalErrorRecall: ratio(expectedReject.filter((sample) => !sample.actualApproved).length, expectedReject.length),
    falseAcceptanceRate: ratio(expectedReject.filter((sample) => sample.actualApproved).length, expectedReject.length),
    falseRejectionRate: ratio(expectedApprove.filter((sample) => !sample.actualApproved).length, expectedApprove.length),
    expertAgreement: expert.length ? ratio(expert.filter((sample) => sample.actualApproved === sample.expertApproved).length, expert.length) : null,
  };
}
