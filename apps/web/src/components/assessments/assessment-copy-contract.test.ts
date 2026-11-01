import { describe, expect, it } from 'vitest';
import type { AssessmentCopyPreview } from '@/lib/assessment-copy-api-types';
import { validAssessmentCopyCommand, validAssessmentCopyPreview, validAssessmentCopyReceipt } from './assessment-copy-contract';

const actorId = '11111111-1111-4111-8111-111111111111';
const classId = '33333333-3333-4333-8333-333333333333';
const draftId = '55555555-5555-4555-8555-555555555555';
const copyId = '77777777-7777-4777-8777-777777777777';
const preview = (): AssessmentCopyPreview => ({ actorId, source: { id: draftId, classId, className: 'Synthetic class', title: 'Synthetic saved quiz', instructions: '', revision: 2,
  questions: [{ questionVersionId: 'synthetic-copy-item@1', maxUnits: 125, question: { questionId: 'synthetic-copy-item', version: 1, versionId: 'synthetic-copy-item@1', kind: 'multiple_choice', title: 'Synthetic question', prompt: 'Choose the synthetic invariant.', difficulty: 'advanced', activityIds: ['synthetic-activity'], conceptIds: ['hash-maps'], options: [{ id: 'a', text: 'One synthetic statement.' }, { id: 'b', text: 'Another synthetic statement.' }] } }] }, destinations: [{ id: classId, name: 'Synthetic class' }] });
const valid = (value: unknown) => validAssessmentCopyPreview(value, actorId, classId, draftId);

describe('quiz copy response and recovery boundaries', () => {
  it('accepts safe reviewed previews and explicit unavailable placeholders', () => {
    expect(valid(preview())).toBe(true);
    const unavailable = preview(); unavailable.source.questions[0].question = null;
    expect(valid(unavailable)).toBe(true);
  });
  it('rejects extra private data at every nested projection boundary', () => {
    const changes = [
      (value: AssessmentCopyPreview) => Object.assign(value, { learners: [] }),
      (value: AssessmentCopyPreview) => Object.assign(value.source, { privateNote: 'Synthetic forbidden note' }),
      (value: AssessmentCopyPreview) => Object.assign(value.source.questions[0], { response: 'Synthetic forbidden answer' }),
      (value: AssessmentCopyPreview) => Object.assign(value.source.questions[0].question!, { correctOptionId: 'a' }),
      (value: AssessmentCopyPreview) => Object.assign(value.source.questions[0].question!.options[0], { misconceptionTags: ['synthetic-error'] }),
      (value: AssessmentCopyPreview) => Object.assign(value.destinations[0], { joinCode: 'SYNTHETIC' }),
    ];
    for (const change of changes) { const value = preview(); change(value); expect(valid(value)).toBe(false); }
  });
  it('binds the actor, source identity and source class and requires an accessible source destination', () => {
    const value = preview();
    expect(validAssessmentCopyPreview(value, copyId, classId, draftId)).toBe(false);
    expect(validAssessmentCopyPreview(value, actorId, copyId, draftId)).toBe(false);
    expect(validAssessmentCopyPreview(value, actorId, classId, copyId)).toBe(false);
    value.destinations[0].id = copyId; expect(valid(value)).toBe(false);
  });
  it('rejects mismatched question identities, duplicate selections/options/classes and invalid exact points', () => {
    const variants = [
      (value: AssessmentCopyPreview) => { value.source.questions[0].questionVersionId = 'different-item@1'; },
      (value: AssessmentCopyPreview) => { value.source.questions.push(structuredClone(value.source.questions[0])); },
      (value: AssessmentCopyPreview) => { value.source.questions[0].maxUnits = 1.25; },
      (value: AssessmentCopyPreview) => { value.source.questions[0].maxUnits = 1_000_001; },
      (value: AssessmentCopyPreview) => { value.destinations.push(structuredClone(value.destinations[0])); },
      (value: AssessmentCopyPreview) => { Object.assign(value.source.questions[0].question!, { options: [{ id: 'a', text: 'One' }, { id: 'a', text: 'Two' }] }); },
    ];
    for (const change of variants) { const value = preview(); change(value); expect(valid(value)).toBe(false); }
  });
  it('validates cached pending commands without treating new preview revision as their identity', () => {
    const command = { sourceClassId: classId, destinationClassId: copyId, expectedRevision: 1, requestKey: 'synthetic-copy-request' };
    expect(validAssessmentCopyCommand(command, classId)).toBe(true);
    expect(validAssessmentCopyCommand({ ...command, expectedRevision: 0 }, classId)).toBe(false);
    expect(validAssessmentCopyCommand({ ...command, sourceClassId: copyId }, classId)).toBe(false);
    expect(validAssessmentCopyCommand({ ...command, audience: [] }, classId)).toBe(false);
  });
  it('only admits an exact owner/destination receipt for a fresh draft identity', () => {
    const receipt = { actorId, draftId: copyId, classId };
    expect(validAssessmentCopyReceipt(receipt, actorId, draftId, classId)).toBe(true);
    expect(validAssessmentCopyReceipt(receipt, actorId, copyId, classId)).toBe(false);
    expect(validAssessmentCopyReceipt(receipt, copyId, draftId, classId)).toBe(false);
    expect(validAssessmentCopyReceipt(receipt, actorId, draftId, copyId)).toBe(false);
    expect(validAssessmentCopyReceipt({ ...receipt, grade: 100 }, actorId, draftId)).toBe(false);
  });
});
