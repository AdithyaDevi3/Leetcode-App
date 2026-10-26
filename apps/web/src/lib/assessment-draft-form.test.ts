import { describe, expect, it } from 'vitest';
import { assessmentDraftForm, assessmentFormInput } from './assessment-draft-form';
const classId = '11111111-1111-4111-8111-111111111111';
const form = { title: 'Week one', instructions: '', availableAt: '', dueAt: '', closesAt: '', questions: [{ questionVersionId: 'sample-question@1', points: '0.29' }] };
describe('quiz draft form', () => {
  it('converts decimal points exactly and retains question ordering', () => {
    expect(assessmentFormInput(classId, { ...form, questions: [...form.questions, { questionVersionId: 'other-question@1', points: '5.12' }] }))
      .toMatchObject({ questions: [{ questionVersionId: 'sample-question@1', maxUnits: 29 }, { questionVersionId: 'other-question@1', maxUnits: 512 }] });
  });
  it('rejects empty selections, duplicate versions, fractions beyond hundredths and nonpositive points', () => {
    for (const questions of [[], [...form.questions, ...form.questions], [{ ...form.questions[0], points: '1.001' }], [{ ...form.questions[0], points: '0' }]]) {
      expect(() => assessmentFormInput(classId, { ...form, questions })).toThrow();
    }
  });
  it('rejects impossible and inverted local dates rather than silently changing them', () => {
    expect(() => assessmentFormInput(classId, { ...form, dueAt: '2026-02-31T10:00' })).toThrow();
    expect(() => assessmentFormInput(classId, { ...form, availableAt: '2026-11-04T12:00', dueAt: '2026-11-03T12:00' })).toThrow();
  });
  it('round-trips saved times and precise points for editing in the current time zone', () => {
    const stored = { ...assessmentFormInput(classId, { ...form, dueAt: '2026-11-04T12:00' }), id: 'draft-id', revision: 1, status: 'draft' as const, maxUnits: 29, createdBy: null, createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z' };
    expect(assessmentFormInput(classId, assessmentDraftForm(stored))).toEqual(assessmentFormInput(classId, { ...form, dueAt: '2026-11-04T12:00' }));
  });
});
