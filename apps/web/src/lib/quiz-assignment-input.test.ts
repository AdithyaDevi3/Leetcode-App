import { describe, expect, it } from 'vitest';
import {
  decodeQuizRequest, parseQuizAnswerSaveRequest, parseQuizPublicationRequest,
  parseQuizSubmissionRequest, QuizInputError,
} from './quiz-assignment-input';

const learnerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secondLearnerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const publication = () => ({
  expectedRevision: 2, expectedRosterFingerprint: 'a'.repeat(64), requestKey: 'publish-quiz-1',
  audience: { kind: 'class', learnerIds: [learnerId, secondLearnerId] },
});
const save = () => ({ expectedRevision: 0, answers: { 'fixture-map-position@1': 'prior' }, requestKey: 'save-answer-1' });
const submission = () => ({ expectedRevision: 2, requestKey: 'finalize-quiz-1' });
const raw = (body: string) => new Request('http://localhost/api/quiz', { method: 'POST', body });
const audienceIds = (count: number) => Array.from({ length: count }, (_, index) => `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`);

describe('strict quiz HTTP decoding', () => {
  it.each([
    '{"expectedRevision":0,"expectedRevision":1}',
    '{"requestKey":"first","request\\u004bey":"second"}',
    '{"answers":{"fixture-map-position@1":"prior","fixture-map-position@1":"current"}}',
    '{"audience":{"kind":"class","kind":"selected"}}',
    '{"nested":[{"id":"one","\\u0069d":"two"}]}',
  ])('rejects duplicate JSON properties before they can overwrite earlier input: %s', async source => {
    await expect(decodeQuizRequest(raw(source))).rejects.toMatchObject({ status: 400 });
  });

  it('allows repeated names in separate objects and key-like text inside strings', async () => {
    const value = { a: { id: 'one' }, b: { id: 'two' }, text: '"id":1,"id":2, brace } and escaped \\ slash', nested: [null, true, 1.5] };
    await expect(decodeQuizRequest(raw(JSON.stringify(value)))).resolves.toEqual(value);
  });

  it('measures the body limit in UTF-8 bytes and preserves text at the exact limit', async () => {
    const source = JSON.stringify({ text: 'é→🙂' });
    const bytes = new TextEncoder().encode(source).byteLength;
    await expect(decodeQuizRequest(raw(source), bytes)).resolves.toEqual({ text: 'é→🙂' });
    await expect(decodeQuizRequest(raw(source), bytes - 1)).rejects.toMatchObject({ status: 413 });
  });

  it.each(['', '{', '[1,]', '{"a":undefined}', '{"a":1} trailing', '{"a":01}'])('rejects invalid JSON: %s', async source => {
    await expect(decodeQuizRequest(raw(source))).rejects.toBeInstanceOf(QuizInputError);
  });

  it('bounds the default request size before parsing or persisting answers', async () => {
    await expect(decodeQuizRequest(raw(JSON.stringify({ text: 'x'.repeat(128_001) })))).rejects.toMatchObject({ status: 413 });
  });

  it('rejects invalid UTF-8 and excessive nesting as recoverable input errors', async () => {
    const malformedUtf8 = new Request('http://localhost', { method: 'POST', body: new Uint8Array([0x22, 0xc3, 0x28, 0x22]) });
    await expect(decodeQuizRequest(malformedUtf8)).rejects.toMatchObject({ status: 400 });
    await expect(decodeQuizRequest(raw('['.repeat(100) + 'null' + ']'.repeat(100)))).rejects.toMatchObject({ status: 400 });
  });
});

describe('quiz publication input', () => {
  it('accepts a saved revision and frozen whole-class or explicit selected audience', () => {
    expect(parseQuizPublicationRequest(publication())).toEqual(publication());
    const selected = { ...publication(), requestKey: '  selected-request  ', audience: { kind: 'selected', learnerIds: [learnerId, secondLearnerId] } };
    expect(parseQuizPublicationRequest(selected)).toEqual({ ...selected, requestKey: 'selected-request' });
  });

  it('accepts the full audience limit and rejects a larger set of distinct learners', () => {
    expect(parseQuizPublicationRequest({ ...publication(), audience: { kind: 'selected', learnerIds: audienceIds(2000) } }).audience.learnerIds).toHaveLength(2000);
    expect(() => parseQuizPublicationRequest({ ...publication(), audience: { kind: 'selected', learnerIds: audienceIds(2001) } })).toThrow(QuizInputError);
  });

  it.each([
    null, [], {}, { ...publication(), expectedRevision: 0 }, { ...publication(), expectedRevision: 1.5 },
    { ...publication(), expectedRevision: '2' }, { ...publication(), expectedRosterFingerprint: 'A'.repeat(64) },
    { ...publication(), expectedRosterFingerprint: 'a'.repeat(63) }, { ...publication(), expectedRosterFingerprint: 'z'.repeat(64) },
    { ...publication(), requestKey: '' }, { ...publication(), requestKey: 'x'.repeat(129) },
    { ...publication(), audience: { kind: 'selected', learnerIds: [] } },
    { ...publication(), audience: { kind: 'selected', learnerIds: [learnerId, learnerId] } },
    { ...publication(), audience: { kind: 'selected', learnerIds: [learnerId, learnerId.toUpperCase()] } },
    { ...publication(), audience: { kind: 'selected', learnerIds: ['not-a-user'] } },
    { ...publication(), audience: { kind: 'class', learnerIds: [] } },
    { ...publication(), audience: { kind: 'dynamic', learnerIds: [] } },
    { ...publication(), audience: { kind: 'selected', learnerIds: [learnerId], lateEnrollment: 'include' } },
    { ...publication(), audience: { kind: 'selected', learnerIds: Array(2001).fill(learnerId) } },
  ])('rejects ambiguous, stale-shaped, or malformed publication input: %j', value => {
    expect(() => parseQuizPublicationRequest(value)).toThrow(QuizInputError);
  });

  it.each([
    { ownerId: learnerId }, { expectedAuthor: learnerId }, { classId: learnerId }, { draftId: learnerId },
    { snapshot: { correctOptionId: 'prior' } }, { questions: [] }, { scoringVersion: 'client-scorer' },
    { maxUnits: 1_000_000 }, { releasePolicy: 'immediate' }, { allowRetakes: true },
  ])('rejects client-authored publication identity, private snapshot, or policy fields: %j', extra => {
    expect(() => parseQuizPublicationRequest({ ...publication(), ...extra })).toThrow(QuizInputError);
  });
});

describe('quiz answer save input', () => {
  it('preserves selections, explicit unanswered values, and the expected answer revision', () => {
    const body = { ...save(), expectedRevision: 3, answers: { ...save().answers, 'fixture-window-boundary@2': null }, requestKey: '  stable-save  ' };
    expect(parseQuizAnswerSaveRequest(body)).toEqual({ ...body, requestKey: 'stable-save' });
    expect(parseQuizAnswerSaveRequest({ ...save(), answers: {} }).answers).toEqual({});
  });

  it('accepts thirty answers but rejects a thirty-first question key', () => {
    const answers = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`fixture-question-${index}@1`, 'option-a']));
    expect(Object.keys(parseQuizAnswerSaveRequest({ ...save(), answers }).answers)).toHaveLength(30);
    expect(() => parseQuizAnswerSaveRequest({ ...save(), answers: { ...answers, 'fixture-question-30@1': 'option-a' } })).toThrow(QuizInputError);
  });

  it.each([
    null, [], {}, { ...save(), expectedRevision: -1 }, { ...save(), expectedRevision: 0.5 },
    { ...save(), expectedRevision: '0' }, { ...save(), expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...save(), answers: [] }, { ...save(), answers: null }, { ...save(), answers: { 'invalid-id': 'prior' } },
    { ...save(), answers: { 'fixture-map-position@0': 'prior' } },
    { ...save(), answers: { 'fixture-map-position@1': 1 } },
    { ...save(), answers: { 'fixture-map-position@1': ['prior', 'current'] } },
    { ...save(), answers: { 'fixture-map-position@1': { optionId: 'prior' } } },
    { ...save(), answers: { 'fixture-map-position@1': '' } },
    { ...save(), answers: { 'fixture-map-position@1': 'a'.repeat(49) } },
    { ...save(), requestKey: ' ' }, { ...save(), requestKey: 'a'.repeat(129) },
  ])('rejects malformed revisions, selections, and receipt keys: %j', value => {
    expect(() => parseQuizAnswerSaveRequest(value)).toThrow(QuizInputError);
  });

  it.each([
    { learnerId }, { recipientId: learnerId }, { policyVersionId: learnerId }, { questionVersions: [] },
    { earnedUnits: 100 }, { score: 100 }, { correctOptionId: 'prior' }, { criterionScores: {} },
    { evaluatorVersionId: 'client-scorer' }, { answerKey: { 'fixture-map-position@1': 'prior' } },
  ])('rejects forged learner, grade, key, and scorer metadata: %j', extra => {
    expect(() => parseQuizAnswerSaveRequest({ ...save(), ...extra })).toThrow(QuizInputError);
  });

  it('rejects a prototype-named question key instead of using it as an answer', () => {
    const value = JSON.parse('{"expectedRevision":0,"requestKey":"save","answers":{"__proto__":"prior"}}');
    expect(() => parseQuizAnswerSaveRequest(value)).toThrow(QuizInputError);
  });
});

describe('quiz finalization input', () => {
  it('finalizes only the acknowledged answer revision and stable receipt key', () => {
    expect(parseQuizSubmissionRequest(submission())).toEqual(submission());
    expect(parseQuizSubmissionRequest({ ...submission(), expectedRevision: 0, requestKey: '  final-request  ' })).toEqual({ expectedRevision: 0, requestKey: 'final-request' });
  });

  it.each([
    null, [], {}, { ...submission(), expectedRevision: -1 }, { ...submission(), expectedRevision: '2' },
    { ...submission(), expectedRevision: 1.5 }, { ...submission(), requestKey: '' }, { ...submission(), requestKey: 'x'.repeat(129) },
    { ...submission(), answers: save().answers }, { ...submission(), score: 100 }, { ...submission(), earnedUnits: 100 },
    { ...submission(), learnerId }, { ...submission(), responseRevisionId: learnerId },
    { ...submission(), correctOptionId: 'prior' }, { ...submission(), evaluatorVersionId: 'client-scorer' },
  ])('rejects malformed, unacknowledged, or client-scored finalization: %j', value => {
    expect(() => parseQuizSubmissionRequest(value)).toThrow(QuizInputError);
  });
});
