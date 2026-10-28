import { describe, expect, it, vi } from 'vitest';
import { decodeLearningReviewRequest, LearningInputError, parseLearningReviewRequest } from './learning-input';

const input = () => ({ conceptId: 'hashing', expectedRevision: 4, days: 3, requestKey: 'review_123-retry' });
const request = (text: string, headers?: Record<string, string>) => new Request('http://localhost/api/learner/learning/reviews', {
  method: 'POST', body: text, headers,
});

describe('account learning review input boundary', () => {
  it.each([1, 3, 7])('accepts supported %s-day snoozes without accepting source data', days => {
    expect(parseLearningReviewRequest({ ...input(), days })).toEqual({ ...input(), days });
  });

  it.each([
    null, [], 'hashing', {},
    ...['conceptId', 'expectedRevision', 'days', 'requestKey'].map(field => Object.fromEntries(Object.entries(input()).filter(([key]) => key !== field))),
    ...['userId', 'learnerId', 'sourceId', 'score', 'confidence', 'gradeRevisionId', 'correctOptionId', 'dueAt'].map(field => ({ ...input(), [field]: 'untrusted' })),
    ...['', 'Hashing', '../hashing', 'hashing/other', 'hashing ', 'é', 'x'.repeat(129)].map(conceptId => ({ ...input(), conceptId })),
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '4', null].map(expectedRevision => ({ ...input(), expectedRevision })),
    ...[0, 2, 30, '3', null, true].map(days => ({ ...input(), days })),
    ...['', ' retry', 'retry key', '../key', 'x'.repeat(129), 1, null].map(requestKey => ({ ...input(), requestKey })),
  ])('rejects malformed, client-authoritative, or unbounded fields (%j)', value => {
    expect(() => parseLearningReviewRequest(value)).toThrow(LearningInputError);
  });

  it('accepts the decoder plain-object representation but rejects custom prototypes', () => {
    expect(parseLearningReviewRequest(Object.assign(Object.create(null), input()))).toEqual(input());
    expect(() => parseLearningReviewRequest(Object.assign(Object.create({ owner: 'another-account' }), input()))).toThrow(LearningInputError);
  });

  it.each([
    '{"conceptId":"hashing","conceptId":"graphs","expectedRevision":4,"days":3,"requestKey":"key"}',
    '{"conceptId":"hashing","expectedRevision":4,"days":3,"d\\u0061ys":7,"requestKey":"key"}',
    '{"conceptId":"hashing","expectedRevision":4,"days":3,"requestKey":"key","metadata":{"score":0,"score":100}}',
    '{', `${JSON.stringify(input())} true`, '{"__proto__":{"polluted":true}}',
  ])('rejects ambiguous JSON before a review can be scheduled', async text => {
    await expect(decodeLearningReviewRequest(request(text))).rejects.toMatchObject({ status: 400 });
  });

  it('rejects advertised oversized bodies without opening their reader', async () => {
    const oversized = request(JSON.stringify(input()), { 'content-length': '4001' });
    const getReader = vi.spyOn(oversized.body!, 'getReader');
    await expect(decodeLearningReviewRequest(oversized)).rejects.toMatchObject({ status: 413 });
    expect(getReader).not.toHaveBeenCalled();
  });

  it('bounds actual UTF-8 bytes even without a trustworthy content length', async () => {
    await expect(decodeLearningReviewRequest(request(JSON.stringify({ ...input(), padding: 'é'.repeat(2_000) }), { 'content-length': '1' })))
      .rejects.toMatchObject({ status: 413 });
  });

  it('rejects invalid UTF-8, missing bodies, and excessive JSON nesting', async () => {
    const invalidUtf8 = new Request('http://localhost', { method: 'POST', body: new Uint8Array([0xc3, 0x28]) });
    for (const invalid of [invalidUtf8, new Request('http://localhost', { method: 'POST' }), request('['.repeat(35) + '0' + ']'.repeat(35))]) {
      await expect(decodeLearningReviewRequest(invalid)).rejects.toMatchObject({ status: 400 });
    }
  });
});
