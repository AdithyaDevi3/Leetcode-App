import { describe, expect, it } from 'vitest';
import { validRecommendationReceipt, validRecommendationRequest } from './recommendation-selection';

const owner = '11111111-1111-4111-8111-111111111111';
const request = () => ({ practiceId: 'pair-with-target-v1', expectedDecisionKey: 'a'.repeat(64), requestKey: '22222222-2222-4222-8222-222222222222' });
const response = () => ({ learnerId: owner, receipt: { practiceId: request().practiceId, decisionKey: request().expectedDecisionKey,
  requestKey: request().requestKey, selectionId: '33333333-3333-4333-8333-333333333333', selectedAt: '2026-10-29T12:00:00.000Z' } });

describe('recommendation recovery and response confirmation', () => {
  it('recovers only known, bounded activity commands without accepting redirect URLs', () => {
    expect(validRecommendationRequest(request())).toBe(true);
    expect(validRecommendationRequest({ ...request(), practiceId: 'https://example.test' })).toBe(false);
    expect(validRecommendationRequest({ ...request(), practiceId: 'nonexistent-practice-v1' })).toBe(false);
    expect(validRecommendationRequest({ ...request(), redirectUrl: '/other' })).toBe(false);
    expect(validRecommendationRequest({ ...request(), expectedDecisionKey: 'a'.repeat(63) })).toBe(false);
    expect(validRecommendationRequest({ ...request(), requestKey: 'unbounded-or-not-generated' })).toBe(false);
  });
  it('confirms only the exact owner, practice, decision and request receipt', () => {
    expect(validRecommendationReceipt(response(), request(), owner)).toBe(true);
    expect(validRecommendationReceipt({ learnerId: owner }, request(), owner)).toBe(false);
    expect(validRecommendationReceipt(response(), request(), 'other-owner')).toBe(false);
    for (const patch of [{ requestKey: 'other-key' }, { decisionKey: 'b'.repeat(64) }, { practiceId: 'max-window-sum-v1' },
      { selectionId: '' }, { selectedAt: 'not-a-date' }]) {
      expect(validRecommendationReceipt({ ...response(), receipt: { ...response().receipt, ...patch } }, request(), owner)).toBe(false);
    }
  });
});
