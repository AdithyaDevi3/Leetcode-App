import { describe, expect, it } from 'vitest';
import { measureEvaluationQuality } from './evaluation-quality';

describe('evaluation quality metrics', () => {
  it('measures false acceptance, false rejection, and expert agreement', () => {
    const metrics = measureEvaluationQuality([
      { expectedApproved: false, actualApproved: false, expertApproved: false },
      { expectedApproved: false, actualApproved: true, expertApproved: false },
      { expectedApproved: true, actualApproved: false, expertApproved: true },
      { expectedApproved: true, actualApproved: true, expertApproved: true },
    ]);
    expect(metrics).toEqual({ criticalErrorRecall: 0.5, falseAcceptanceRate: 0.5, falseRejectionRate: 0.5, expertAgreement: 0.5 });
  });
});
