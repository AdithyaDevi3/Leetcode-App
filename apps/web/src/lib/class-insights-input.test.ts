import { describe, expect, it } from 'vitest';
import { classInsightsFocus, classInsightsId, classInsightsQuery } from './class-insights-input';
const concepts = ['hash-maps', 'complexity-analysis', 'sliding-window', 'recurrence'];
describe('class insight navigation input', () => {
  it('canonicalizes curriculum focus and UUID case without accepting identity or grade input', () => {
    expect(classInsightsId('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA')).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(classInsightsQuery(new Request('https://example.invalid?workspace=teach&focus=hash-maps,complexity-analysis'), concepts)).toEqual({ workspace: 'teach', focus: ['complexity-analysis', 'hash-maps'] });
    expect(classInsightsFocus(undefined, concepts)).toBeUndefined();
  });
  it.each(['', 'hash-maps,hash-maps', 'hash-maps,recurrence,sliding-window,complexity-analysis', ' hash-maps', 'learner-id', 'hash-maps,', 'x'.repeat(243)])('rejects invalid focus %s', focus => {
    expect(() => classInsightsFocus(focus, concepts)).toThrow();
  });
  it.each(['workspace=teach&workspace=admin', 'workspace=teach&focus=hash-maps&focus=recurrence', 'workspace=teach&learnerId=other', 'workspace=learner', 'focus=hash-maps'])('rejects ambiguous or client-authoritative queries %s', query => {
    expect(() => classInsightsQuery(new Request(`https://example.invalid?${query}`), concepts)).toThrow();
  });
});
