import { describe, expect, it } from 'vitest';
import type { StoredAssessmentDraft } from '@leetcode-app/database';
import type { ClassFollowUpSuggestion } from './class-insights-api-types';
import { classFollowUpDraftSeed } from './class-follow-up-seed';
import { assessmentDraftForm, assessmentFormInput } from './assessment-draft-form';

describe('class suggestions become ordinary editable quiz work', () => {
  it('carries only focus goals and selected versions into learner-visible authoring', () => {
    const suggestion = { focusConceptIds: ['hash-maps', 'complexity-analysis'], questions: [{ versionId: 'sample-second@1' }, { versionId: 'sample-first@2' }],
      reason: 'PRIVATE class performance', emptyReason: null, unavailableConceptIds: [],
      learnerIds: ['PRIVATE learner'], observedCorrectPercent: 18, privateNote: 'PRIVATE note' } as unknown as ClassFollowUpSuggestion;
    const seed = classFollowUpDraftSeed(suggestion, 'focus:complexity-analysis:hash-maps');
    expect(JSON.stringify(seed)).not.toContain('PRIVATE');
    expect(seed.instructions).toContain('hash maps, complexity analysis');
    const input = assessmentFormInput('11111111-1111-4111-8111-111111111111', assessmentDraftForm(null, seed));
    expect(input).toMatchObject({ questions: [{ questionVersionId: 'sample-second@1', maxUnits: 500 }, { questionVersionId: 'sample-first@2', maxUnits: 500 }], availableAt: null, dueAt: null, closesAt: null });
    expect(input).not.toHaveProperty('key');
    expect(input).not.toHaveProperty('learnerIds');
  });
  it('never replaces a saved draft with a new suggestion or its point values', () => {
    const saved = { id: 'saved', classId: 'class', title: 'Existing author work', instructions: 'Existing instructions', questions: [{ questionVersionId: 'saved-question@1', maxUnits: 275 }], availableAt: null, dueAt: null, closesAt: null,
      revision: 2, status: 'draft', maxUnits: 275, createdBy: null, createdAt: '', updatedAt: '' } as StoredAssessmentDraft;
    const seed = { key: 'focus:hash-maps', title: 'Fresh suggestion', instructions: 'Fresh instructions', questions: [{ questionVersionId: 'new-question@1', maxUnits: 500 }] };
    expect(assessmentDraftForm(saved, seed)).toMatchObject({ title: 'Existing author work', instructions: 'Existing instructions', questions: [{ questionVersionId: 'saved-question@1', points: '2.75' }] });
  });
});
