import { describe, expect, it } from 'vitest';
import type { WrittenAssessmentDraft } from '@leetcode-app/database';
import { formInput, writtenForm } from './written-form';
import { validDraftReceipt, validLearnerReply } from './written-contract';

const actorId = '11111111-1111-4111-8111-111111111111', classId = '33333333-3333-4333-8333-333333333333';
const draftId = '55555555-5555-4555-8555-555555555555', recipientId = '77777777-7777-4777-8777-777777777777', policyId = '88888888-8888-4888-8888-888888888888';
const stamp = '2026-11-02T12:00:00.000Z';
function saved(): WrittenAssessmentDraft {
  return { id: draftId, classId, createdBy: actorId, revision: 4, status: 'draft', title: 'Synthetic saved prompt', instructions: '', prompt: 'Explain a synthetic invariant.', criteria: [{ id: 'reasoning', label: 'Reasoning', maxUnits: 125 }], maxUnits: 125,
    availableAt: '2026-11-02T12:00:12.123Z', dueAt: '2026-11-02T13:00:34.567Z', closesAt: '2026-11-02T14:00:56.789Z', createdAt: stamp, updatedAt: stamp };
}
function learner() {
  return { actorId, assignment: { recipientId, classId, assignmentId: draftId, policyVersionId: policyId, title: 'Synthetic written task', instructions: '', prompt: 'Explain a synthetic invariant.', criteria: [{ id: 'reasoning', label: 'Reasoning', maxUnits: 125 }], maxUnits: 125,
    availableAt: null, dueAt: null, closesAt: null, responseDraft: { revision: 1, text: 'A synthetic response.', updatedAt: stamp }, submission: null, releasedGrade: null, isOpen: true, isClosed: false, isExcused: false } };
}
describe('written recovery boundaries', () => {
  it('editing a title preserves saved UTC seconds and milliseconds exactly', () => {
    const draft = saved(), form = writtenForm(draft); form.title = 'A revised synthetic title';
    const input = formInput(classId, form);
    expect([input.availableAt, input.dueAt, input.closesAt]).toEqual([draft.availableAt, draft.dueAt, draft.closesAt]);
    expect(input.criteria).toEqual(draft.criteria);
  });
  it('keeps an old accepted draft receipt distinguishable from the current head', () => {
    expect(validDraftReceipt({ actorId, draft: saved(), currentRevision: 7 }, actorId, classId, draftId)).toBe(true);
    expect(validDraftReceipt({ actorId, draft: saved(), currentRevision: 3 }, actorId, classId, draftId)).toBe(false);
    expect(validDraftReceipt({ actorId, draft: saved(), currentRevision: 7 }, actorId, recipientId, draftId)).toBe(false);
  });
  it('rejects learner private extras, mismatched policy and hidden content in an excused shell', () => {
    const reply = learner();
    expect(validLearnerReply(reply, actorId, recipientId, classId, policyId)).toBe(true);
    expect(validLearnerReply({ ...reply, assignment: { ...reply.assignment, privateNote: 'Synthetic withheld note.' } }, actorId, recipientId, classId, policyId)).toBe(false);
    expect(validLearnerReply(reply, actorId, recipientId, classId, draftId)).toBe(false);
    expect(validLearnerReply({ ...reply, assignment: { ...reply.assignment, isExcused: true } }, actorId, recipientId, classId, policyId)).toBe(false);
  });
  it('rejects partial published rubric scores instead of inventing zeros for omitted criteria', () => {
    const reply = learner();
    const grade = { gradeRevisionId: draftId, earnedUnits: 25, criterionScores: { reasoning: 25 }, learnerFeedback: '', publishedAt: stamp };
    expect(validLearnerReply({ ...reply, assignment: { ...reply.assignment, releasedGrade: grade } }, actorId, recipientId, classId, policyId)).toBe(true);
    expect(validLearnerReply({ ...reply, assignment: { ...reply.assignment, releasedGrade: { ...grade, criterionScores: {} } } }, actorId, recipientId, classId, policyId)).toBe(false);
    expect(validLearnerReply({ ...reply, assignment: { ...reply.assignment, releasedGrade: { ...grade, earnedUnits: 0, criterionScores: {} } } }, actorId, recipientId, classId, policyId)).toBe(true);
  });
});
