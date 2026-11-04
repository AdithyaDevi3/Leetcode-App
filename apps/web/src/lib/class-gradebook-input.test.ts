import { describe, expect, it } from 'vitest';
import {
  ClassGradebookInputError, classGradebookId, classGradebookQuery, classGradebookReleaseCommand,
  classGradebookSharingCommand, classGradebookTargetLimit, classGradebookDraftCommand,
} from './class-gradebook-input';

const recipientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const gradeRevisionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const publicationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const target = () => ({ recipientId, gradeRevisionId, expectedPublicationSequence: 0 });
const shareTarget = () => ({ recipientId, gradeRevisionId, publicationId, attemptId: null });
const release = () => ({ targets: [target()], requestKey: 'release-reviewed-1' });
const share = () => ({ action: 'publish', targets: [shareTarget()], expectedSharingSequence: 0, requestKey: 'share-reviewed-1' });

describe('class gradebook input', () => {
  it('canonicalizes UUID identities while retaining the exact command identity', () => {
    expect(classGradebookId(recipientId.toUpperCase())).toBe(recipientId);
    const command = classGradebookReleaseCommand({ ...release(), targets: [{ ...target(), recipientId: recipientId.toUpperCase() }] });
    expect(command).toEqual(release());
  });
  it.each(['admin', 'teach'])('requires one explicit authorized workspace selector: %s', workspace => {
    expect(classGradebookQuery(new Request(`http://local/grades?workspace=${workspace}`))).toBe(workspace);
  });
  it.each(['', '?workspace=student', '?workspace=teach&workspace=admin', '?workspace=teach&classId=extra', '?workspace=teach&owner=other'])('rejects ambiguous or foreign workspace query %s', query => {
    expect(() => classGradebookQuery(new Request(`http://local/grades${query}`))).toThrow(ClassGradebookInputError);
  });
  it('keeps the learner read route independent of privileged workspaces', () => {
    expect(classGradebookQuery(new Request('http://local/grades'), true)).toBeNull();
    expect(() => classGradebookQuery(new Request('http://local/grades?workspace=admin'), true)).toThrow(ClassGradebookInputError);
  });
  const badRelease = [
    null, [], {}, { ...release(), actorId: recipientId }, { ...release(), reason: 'client changes release scope' },
    { ...release(), targets: [] }, { ...release(), targets: [target(), target()] },
    { ...release(), targets: [{ ...target(), recipientId: 'invalid' }] },
    { ...release(), targets: [{ ...target(), gradeRevisionId: 'invalid' }] },
    { ...release(), targets: [{ ...target(), expectedPublicationSequence: -1 }] },
    { ...release(), targets: [{ ...target(), expectedPublicationSequence: 0.5 }] },
    { ...release(), targets: [{ ...target(), expectedPublicationSequence: '0' }] },
    { ...release(), targets: [{ ...target(), expectedPublicationSequence: 2_147_483_647 }] },
    { ...release(), targets: [{ ...target(), earnedUnits: 100 }] },
    { ...release(), targets: [{ ...target(), publicationId }] },
    ...['', ' ', 'contains space', 'x'.repeat(129), 'é', '__proto__', 'key\u0000'].map(requestKey => ({ ...release(), requestKey })),
  ];
  it.each(badRelease)('rejects invalid or injected release commands (%j)', value => {
    expect(() => classGradebookReleaseCommand(value)).toThrow(ClassGradebookInputError);
  });
  it('rejects duplicate recipients even when their UUID letter casing differs', () => {
    expect(() => classGradebookReleaseCommand({ ...release(), targets: [target(), { ...target(), recipientId: recipientId.toUpperCase() }] })).toThrow(ClassGradebookInputError);
  });
  it('caps the reviewed target set instead of silently truncating a class', () => {
    const targets = Array.from({ length: classGradebookTargetLimit }, (_, index) => ({ ...target(), recipientId: `${index.toString(16).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa` }));
    expect(classGradebookReleaseCommand({ ...release(), targets }).targets).toHaveLength(classGradebookTargetLimit);
    expect(() => classGradebookReleaseCommand({ ...release(), targets: [...targets, target()] })).toThrow(ClassGradebookInputError);
  });
  it('publishes only exact already-released versions and permits a deliberate no-attempt zero grade', () => {
    expect(classGradebookSharingCommand(share())).toEqual(share());
    expect(classGradebookSharingCommand({ ...share(), targets: [{ ...shareTarget(), attemptId: recipientId }] })).toMatchObject({ targets: [{ attemptId: recipientId }] });
  });
  it('revocation has no hidden target selection or client audit reason', () => {
    const command = { action: 'revoke', expectedSharingSequence: 2, requestKey: 'revoke-reviewed-2' };
    expect(classGradebookSharingCommand(command)).toEqual(command);
    expect(() => classGradebookSharingCommand({ ...command, targets: [] })).toThrow(ClassGradebookInputError);
  });
  const badSharing = [
    { ...share(), action: 'release' }, { ...share(), action: ['publish'] }, { ...share(), targets: [] },
    { ...share(), targets: [shareTarget(), shareTarget()] }, { ...share(), expectedSharingSequence: null },
    { ...share(), targets: [{ ...shareTarget(), publicationId: 'invalid' }] },
    { ...share(), targets: [{ ...shareTarget(), attemptId: undefined }] },
    { ...share(), targets: [{ ...shareTarget(), learnerId: recipientId }] },
    { ...share(), targets: [{ ...shareTarget(), answers: {} }] }, { ...share(), includePrivateNotes: true },
  ];
  it.each(badSharing)('rejects invalid sharing commands (%j)', value => {
    expect(() => classGradebookSharingCommand(value)).toThrow(ClassGradebookInputError);
  });
  const draft = () => ({ attemptId: recipientId, expectedGradeRevisionId: null, criterionScores: { reasoning: 800 },
    learnerFeedback: '  Preserve exact feedback\n', privateNote: 'Synthetic staff note.', requestKey: 'save-reviewed-grade-1' });
  it('retains exact rubric feedback and never accepts client ownership or grading kind', () => {
    expect(classGradebookDraftCommand(draft())).toEqual(draft());
    expect(() => classGradebookDraftCommand({ ...draft(), learnerId: recipientId })).toThrow(ClassGradebookInputError);
    expect(() => classGradebookDraftCommand({ ...draft(), kind: 'missing_zero' })).toThrow(ClassGradebookInputError);
  });
  const badDrafts = [
    { ...draft(), attemptId: null }, { ...draft(), expectedGradeRevisionId: undefined }, { ...draft(), criterionScores: null },
    { ...draft(), criterionScores: {} }, { ...draft(), criterionScores: { reasoning: -1 } }, { ...draft(), criterionScores: { reasoning: 1.2 } },
    { ...draft(), criterionScores: { reasoning: 1_000_001 } }, { ...draft(), criterionScores: { constructor: 1 } },
    { ...draft(), learnerFeedback: 'x'.repeat(10001) }, { ...draft(), privateNote: null },
    ...['\u0000', '\ud800', '\udc00'].map(value => ({ ...draft(), learnerFeedback: value })),
  ];
  it.each(badDrafts)('rejects invalid manual grade content (%j)', value => {
    expect(() => classGradebookDraftCommand(value)).toThrow(ClassGradebookInputError);
  });
});
