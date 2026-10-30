import { describe, expect, it, vi } from 'vitest';
import { decodeLearningRecommendationRequest, parseLearningRecommendationRequest } from './learning-recommendation-input';
import { LearningInputError } from './learning-input';

const input = () => ({ practiceId: 'pair-with-target-v1', expectedDecisionKey: 'a'.repeat(64), requestKey: 'selection_retry-1' });
const request = (body: string, headers?: Record<string, string>) => new Request('http://localhost', { method: 'POST', body, headers });

describe('learning recommendation selection input', () => {
  it('accepts a bounded opaque decision and practice identifier', () => {
    expect(parseLearningRecommendationRequest(input())).toEqual(input());
    expect(parseLearningRecommendationRequest(Object.assign(Object.create(null), input()))).toEqual(input());
  });
  it.each([
    null, [], {}, 'practice', Object.assign(Object.create({ inherited: true }), input()),
    ...Object.keys(input()).map(field => Object.fromEntries(Object.entries(input()).filter(([key]) => key !== field))),
    ...['learnerId', 'sourceId', 'score', 'decision', 'snapshot', 'selectedAt', 'redirectUrl'].map(field => ({ ...input(), [field]: 'untrusted' })),
    ...['', '../practice', 'practice/1', 'a b', 'A', 'x'.repeat(129), null, 5].map(practiceId => ({ ...input(), practiceId })),
    ...['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), null, 5].map(expectedDecisionKey => ({ ...input(), expectedDecisionKey })),
    ...['', '../key', 'a b', 'x'.repeat(129), null, 5].map(requestKey => ({ ...input(), requestKey })),
  ])('rejects malformed or client-authoritative fields (%j)', value => {
    expect(() => parseLearningRecommendationRequest(value)).toThrow(LearningInputError);
  });
  it('rejects duplicate keys, malformed JSON and duplicate escaped keys', async () => {
    for (const body of ['{', '{"practiceId":"a","practiceId":"b"}', '{"requestKey":"a","requestK\\u0065y":"b"}']) {
      await expect(decodeLearningRecommendationRequest(request(body))).rejects.toMatchObject({ status: 400 });
    }
  });
  it('rejects oversized advertised and actual streamed bodies', async () => {
    const advertised = request(JSON.stringify(input()), { 'content-length': '4001' });
    const reader = vi.spyOn(advertised.body!, 'getReader');
    await expect(decodeLearningRecommendationRequest(advertised)).rejects.toMatchObject({ status: 413 });
    expect(reader).not.toHaveBeenCalled();
    await expect(decodeLearningRecommendationRequest(request(JSON.stringify({ ...input(), padding: 'é'.repeat(2_000) }), { 'content-length': '1' })))
      .rejects.toMatchObject({ status: 413 });
  });
});
