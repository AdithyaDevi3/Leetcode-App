import { describe, expect, it } from 'vitest';
import { freezeQuestionVersion, type QuestionVersion } from '@leetcode-app/domain';
import { AssessmentInputError, parseAssessmentDraftRequest } from './assessment-draft-input';

const classId = '11111111-1111-4111-8111-111111111111';
const draftId = '22222222-2222-4222-8222-222222222222';
function question(version = 1, status: QuestionVersion['status'] = 'reviewed'): QuestionVersion {
  return freezeQuestionVersion({
    questionId: 'fixture-pair-invariant', version, versionId: `fixture-pair-invariant@${version}`, kind: 'multiple_choice', status,
    title: 'Choose the map invariant', prompt: 'Which statement prevents using the same position twice?', difficulty: 'foundation',
    activityIds: ['pair-with-target-v1'], conceptIds: ['hash-map-invariant'],
    options: [{ id: 'previous', text: 'Only previous positions are in the map.', misconceptionTags: [] }, { id: 'current', text: 'Insert the current position first.', misconceptionTags: ['self-match'] }],
    correctOptionId: 'previous', explanation: 'Private fixture explanation.',
    provenance: { kind: 'original', authorId: 'fixture-author', authoredAt: '2026-10-25T00:00:00.000Z' },
    review: status === 'reviewed' || status === 'retired' ? { reviewerId: 'fixture-reviewer', reviewedAt: '2026-10-26T00:00:00.000Z', notes: 'Synthetic fixture review only.' } : null,
  });
}
const reviewed = question();
const find = (id: string) => id === reviewed.versionId ? reviewed : null;
const payload = () => ({
  draftId: null as string | null, expectedRevision: null as number | null, requestKey: 'draft-request-1',
  draft: { classId, title: '  Pair reasoning quiz  ', instructions: '  Choose one option.  ',
    questions: [{ questionVersionId: reviewed.versionId, maxUnits: 125 }],
    availableAt: '2026-10-26T09:00:00Z' as string | null,
    dueAt: '2026-10-27T09:00:00.000Z' as string | null, closesAt: '2026-10-28T09:00:00Z' as string | null,
  },
});

describe('assessment draft input boundary', () => {
  it('normalizes a creation and emits only ordered version references and exact point units', () => {
    const parsed = parseAssessmentDraftRequest(payload(), find);
    expect(parsed).toEqual({ draftId: null, expectedRevision: null, requestKey: 'draft-request-1', draft: {
      classId, title: 'Pair reasoning quiz', instructions: 'Choose one option.',
      questions: [{ questionVersionId: reviewed.versionId, maxUnits: 125 }],
      availableAt: '2026-10-26T09:00:00.000Z', dueAt: '2026-10-27T09:00:00.000Z', closesAt: '2026-10-28T09:00:00.000Z',
    } });
    for (const secret of ['correctOptionId', 'Private fixture explanation', 'provenance', 'fixture-reviewer', 'misconceptionTags']) expect(JSON.stringify(parsed)).not.toContain(secret);
  });

  it('requires an expected revision only when editing a saved draft', () => {
    const edit = { ...payload(), draftId, expectedRevision: 3 };
    expect(parseAssessmentDraftRequest(edit, find)).toMatchObject({ draftId, expectedRevision: 3 });
    for (const body of [
      { ...payload(), expectedRevision: 1 }, { ...payload(), draftId }, { ...payload(), draftId, expectedRevision: 0 },
      { ...payload(), draftId, expectedRevision: 1.5 }, { ...payload(), draftId, expectedRevision: '1' },
      { ...payload(), draftId: 'not-a-draft', expectedRevision: 1 },
    ]) expect(() => parseAssessmentDraftRequest(body, find)).toThrow(AssessmentInputError);
  });

  it('rejects unknown, stale, unreviewed, and retired versions', () => {
    const versions = [null, question(1, 'draft'), question(1, 'in_review'), question(1, 'retired')];
    for (const result of versions) expect(() => parseAssessmentDraftRequest(payload(), () => result)).toThrow(AssessmentInputError);
    const stale = payload(); stale.draft.questions[0].questionVersionId = 'fixture-pair-invariant@999';
    expect(() => parseAssessmentDraftRequest(stale, find)).toThrow(AssessmentInputError);
  });

  it('rejects caller-supplied answers and scoring metadata at every level', () => {
    const body = payload();
    for (const changed of [
      { ...body, correctOptionId: 'previous' }, { ...body, maxUnits: 125 },
      { ...body, draft: { ...body.draft, answerKey: 'previous' } },
      { ...body, draft: { ...body.draft, status: 'published' } },
      { ...body, draft: { ...body.draft, questions: [{ ...body.draft.questions[0], correctOptionId: 'previous' }] } },
      { ...body, draft: { ...body.draft, questions: [{ ...body.draft.questions[0], question: reviewed }] } },
    ]) expect(() => parseAssessmentDraftRequest(changed, find)).toThrow(AssessmentInputError);
  });

  it('rejects duplicate questions, including different versions of the same question', () => {
    const body = payload();
    for (const questions of [[...body.draft.questions, ...body.draft.questions], [body.draft.questions[0], { questionVersionId: 'fixture-pair-invariant@2', maxUnits: 100 }]]) {
      expect(() => parseAssessmentDraftRequest({ ...body, draft: { ...body.draft, questions } }, id => id === reviewed.versionId ? reviewed : question(2))).toThrow(AssessmentInputError);
    }
  });

  it('bounds positive exact integer points and rejects strings, fractions, overflow, or empty sets', () => {
    const body = payload();
    for (const maxUnits of [0, -1, 0.5, '125', Number.MAX_SAFE_INTEGER, 1_000_001]) {
      expect(() => parseAssessmentDraftRequest({ ...body, draft: { ...body.draft, questions: [{ questionVersionId: reviewed.versionId, maxUnits }] } }, find)).toThrow(AssessmentInputError);
    }
    expect(parseAssessmentDraftRequest({ ...body, draft: { ...body.draft, questions: [{ questionVersionId: reviewed.versionId, maxUnits: 1_000_000 }] } }, find).draft.questions[0].maxUnits).toBe(1_000_000);
    for (const questions of [[], Array(31).fill(body.draft.questions[0])]) expect(() => parseAssessmentDraftRequest({ ...body, draft: { ...body.draft, questions } }, find)).toThrow(AssessmentInputError);
  });

  it('requires valid UTC calendar dates and rejects reversed optional boundaries', () => {
    const body = payload();
    for (const changed of [
      { availableAt: '2026-02-30T09:00:00Z' }, { availableAt: '2026-10-26T25:00:00Z' },
      { availableAt: '2026-10-26T09:00:00-04:00' }, { availableAt: '2026-10-26' },
      { dueAt: '2026-10-29T09:00:00Z' }, { dueAt: null, closesAt: '2026-10-25T09:00:00Z' },
    ]) expect(() => parseAssessmentDraftRequest({ ...body, draft: { ...body.draft, ...changed } }, find)).toThrow(AssessmentInputError);
    expect(parseAssessmentDraftRequest({ ...body, draft: { ...body.draft, availableAt: null, dueAt: null, closesAt: null } }, find).draft).toMatchObject({ availableAt: null, dueAt: null, closesAt: null });
  });

  it('rejects malformed envelopes and bounded authoring fields', () => {
    for (const body of [null, [], {}, { ...payload(), requestKey: '' }, { ...payload(), requestKey: 'x'.repeat(129) },
      { ...payload(), draft: { ...payload().draft, classId: 'invalid' } },
      { ...payload(), draft: { ...payload().draft, title: 'ab' } },
      { ...payload(), draft: { ...payload().draft, instructions: 'x'.repeat(2001) } },
    ]) expect(() => parseAssessmentDraftRequest(body, find)).toThrow(AssessmentInputError);
  });
});
