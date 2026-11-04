import { describe, expect, it } from 'vitest';
import { gradeReleaseReceiptMatches, isPendingGradeAction, type PendingGradeAction } from './grade-release-client';

const classId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const assignmentId = '33333333-3333-4333-8333-333333333333';
const recipientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherRecipientId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const gradeRevisionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const otherGradeRevisionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const publicationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const otherPublicationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const attemptId = '44444444-4444-4444-8444-444444444444';
const requestKey = '55555555-5555-4555-8555-555555555555';
const receiptId = '66666666-6666-4666-8666-666666666666';
const date = '2026-11-02T16:00:00.000Z';
const targets = () => [{ recipientId, gradeRevisionId, expectedPublicationSequence: 2 }, { recipientId: otherRecipientId, gradeRevisionId: otherGradeRevisionId, expectedPublicationSequence: 0 }];
const shareTargets = () => [{ recipientId, gradeRevisionId, publicationId, attemptId }];
const release = (): PendingGradeAction => ({ assignmentId, kind: 'release', body: { targets: targets(), requestKey } });
const share = (): PendingGradeAction => ({ assignmentId, kind: 'share', body: { action: 'publish', targets: shareTargets(), expectedSharingSequence: 3, requestKey } });
const revoke = (): PendingGradeAction => ({ assignmentId, kind: 'revoke', body: { action: 'revoke', expectedSharingSequence: 4, requestKey } });
const releaseReceipt = () => ({ id: receiptId, classId, assignmentId, actorId, createdAt: date, publications: targets().map((target, index) => ({
  recipientId: target.recipientId, publication: { id: index === 0 ? publicationId : otherPublicationId,
    gradeRevisionId: target.gradeRevisionId, sequence: target.expectedPublicationSequence + 1, publishedAt: date },
})) });
const shareReceipt = () => ({ id: receiptId, classId, assignmentId, sequence: 4, shared: true, recipientCount: 1, createdAt: date });
const revokeReceipt = () => ({ ...shareReceipt(), sequence: 5, shared: false, recipientCount: 0 });

describe('owner-scoped grade action recovery metadata', () => {
  it.each([release, share, revoke])('round trips a reviewed command without adding names, answers or scores', make => {
    const pending = JSON.parse(JSON.stringify(make())) as unknown;
    expect(isPendingGradeAction(pending)).toBe(true);
    expect(pending).toEqual(make());
    expect(JSON.stringify(pending)).not.toMatch(/displayName|email|earnedUnits|privateNote|learnerFeedback|"answers"|"text"/);
  });
  it('accepts a deliberately reviewed released zero with no submitted attempt', () => {
    const pending = share();
    if (pending.kind !== 'share') throw new Error('Unexpected command');
    pending.body.targets[0].attemptId = null;
    expect(isPendingGradeAction(pending)).toBe(true);
  });
  const invalidRecords = [
    null, [], true, 'saved', {}, { ...release(), assignmentId: 'invalid' }, { ...release(), actorId },
    { ...release(), kind: 'publish' }, { ...release(), body: null }, { ...release(), body: [] },
    { ...release(), body: { ...release().body, learnerName: 'Private learner' } },
    { ...release(), body: { ...release().body, requestKey: 'invalid' } },
    { ...release(), body: { ...release().body, targets: [] } },
    { ...release(), body: { ...release().body, targets: [targets()[0], targets()[0]] } },
    { ...release(), body: { ...release().body, targets: [{ ...targets()[0], earnedUnits: 800 }] } },
    { ...release(), body: { ...release().body, targets: [{ ...targets()[0], expectedPublicationSequence: -1 }] } },
    { ...release(), body: { ...release().body, targets: [{ ...targets()[0], expectedPublicationSequence: 0.5 }] } },
    { ...release(), body: { ...release().body, targets: [{ ...targets()[0], expectedPublicationSequence: '2' }] } },
    { ...release(), body: { ...release().body, targets: [{ ...targets()[0], expectedPublicationSequence: 2_147_483_647 }] } },
    { ...share(), body: { ...share().body, action: 'revoke' } },
    { ...share(), body: { ...share().body, expectedSharingSequence: Number.MAX_SAFE_INTEGER } },
    { ...share(), body: { ...share().body, expectedSharingSequence: -1 } },
    { ...share(), body: { ...share().body, targets: [{ ...shareTargets()[0], attemptId: undefined }] } },
    { ...share(), body: { ...share().body, targets: [{ ...shareTargets()[0], publicationId: 'invalid' }] } },
    { ...share(), body: { ...share().body, targets: [{ ...shareTargets()[0], answers: {} }] } },
    { ...revoke(), body: { ...revoke().body, targets: [] } },
    Object.create(release()),
  ];
  it.each(invalidRecords)('rejects damaged, expanded or ambiguous stored metadata (%j)', value => {
    expect(isPendingGradeAction(value)).toBe(false);
  });
  it('rejects UUID casing aliases instead of recovering duplicate recipients', () => {
    expect(isPendingGradeAction({ ...release(), body: { ...release().body, targets: [targets()[0], { ...targets()[0], recipientId: recipientId.toUpperCase() }] } })).toBe(false);
    expect(isPendingGradeAction({ ...release(), assignmentId: assignmentId.toUpperCase().replace('3333', 'ABCD') })).toBe(false);
  });
  it('rejects more than the atomic command limit and preserves every accepted target', () => {
    const selected = Array.from({ length: 500 }, (_, index) => ({ ...targets()[0], recipientId: `${index.toString(16).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa` }));
    const pending = { ...release(), body: { ...release().body, targets: selected } };
    expect(isPendingGradeAction(pending)).toBe(true);
    expect(isPendingGradeAction({ ...pending, body: { ...pending.body, targets: [...selected, targets()[0]] } })).toBe(false);
  });
});

describe('reviewed grade release receipt validation', () => {
  it('accepts the exact original receipt after a lost response and independent target ordering', () => {
    expect(gradeReleaseReceiptMatches(releaseReceipt(), release(), classId, actorId)).toBe(true);
    expect(gradeReleaseReceiptMatches({ ...releaseReceipt(), publications: [...releaseReceipt().publications].reverse() }, release(), classId, actorId)).toBe(true);
    expect(gradeReleaseReceiptMatches(JSON.parse(JSON.stringify(releaseReceipt())), release(), classId, actorId)).toBe(true);
  });
  const damaged = [
    null, [], {}, { ...releaseReceipt(), id: 'invalid' }, { ...releaseReceipt(), classId: actorId },
    { ...releaseReceipt(), actorId: classId }, { ...releaseReceipt(), assignmentId: classId },
    { ...releaseReceipt(), createdAt: 'invalid' }, { ...releaseReceipt(), createdAt: '2026-11-02' },
    { ...releaseReceipt(), publications: [] }, { ...releaseReceipt(), publications: [releaseReceipt().publications[0]] },
    { ...releaseReceipt(), publications: [releaseReceipt().publications[0], releaseReceipt().publications[0]] },
    { ...releaseReceipt(), publications: [{ ...releaseReceipt().publications[0], recipientId: actorId }, releaseReceipt().publications[1]] },
    { ...releaseReceipt(), publications: [{ recipientId, publication: { ...releaseReceipt().publications[0].publication, gradeRevisionId: otherGradeRevisionId } }, releaseReceipt().publications[1]] },
    { ...releaseReceipt(), publications: [{ recipientId, publication: { ...releaseReceipt().publications[0].publication, sequence: 4 } }, releaseReceipt().publications[1]] },
    { ...releaseReceipt(), publications: [{ recipientId, publication: { ...releaseReceipt().publications[0].publication, sequence: 2 } }, releaseReceipt().publications[1]] },
    { ...releaseReceipt(), publications: [{ recipientId, publication: { ...releaseReceipt().publications[0].publication, sequence: '3' } }, releaseReceipt().publications[1]] },
    { ...releaseReceipt(), publications: [{ recipientId, publication: { ...releaseReceipt().publications[0].publication, publishedAt: 'invalid' } }, releaseReceipt().publications[1]] },
    { ...releaseReceipt(), publications: [{ recipientId, publication: { ...releaseReceipt().publications[0].publication, publishedAt: '2026-11-02' } }, releaseReceipt().publications[1]] },
    { ...releaseReceipt(), publications: [releaseReceipt().publications[0], { ...releaseReceipt().publications[1], publication: { ...releaseReceipt().publications[1].publication, id: publicationId } }] },
  ];
  it.each(damaged)('rejects a receipt outside the exact reviewed actor/class/grade set (%j)', value => {
    expect(gradeReleaseReceiptMatches(value, release(), classId, actorId)).toBe(false);
  });
  it('binds a valid receipt to the intended current account and class', () => {
    expect(gradeReleaseReceiptMatches(releaseReceipt(), release(), actorId, actorId)).toBe(false);
    expect(gradeReleaseReceiptMatches(releaseReceipt(), release(), classId, classId)).toBe(false);
  });
});

describe('independent class sharing receipt validation', () => {
  it('accepts only the reviewed sharing version and selected recipient count', () => {
    expect(gradeReleaseReceiptMatches(shareReceipt(), share(), classId, actorId)).toBe(true);
    expect(gradeReleaseReceiptMatches(revokeReceipt(), revoke(), classId, actorId)).toBe(true);
    expect(gradeReleaseReceiptMatches(shareReceipt(), release(), classId, actorId)).toBe(false);
    expect(gradeReleaseReceiptMatches(releaseReceipt(), share(), classId, actorId)).toBe(false);
  });
  it.each([
    { ...shareReceipt(), sequence: 5 }, { ...shareReceipt(), recipientCount: 2 }, { ...shareReceipt(), recipientCount: 0 },
    { ...shareReceipt(), shared: false }, { ...shareReceipt(), shared: 'true' }, { ...shareReceipt(), classId: actorId },
    { ...shareReceipt(), assignmentId: actorId }, { ...shareReceipt(), sequence: '4' },
  ])('rejects an unexpected sharing version or audience (%j)', value => {
    expect(gradeReleaseReceiptMatches(value, share(), classId, actorId)).toBe(false);
  });
  it.each([{ ...revokeReceipt(), shared: true }, { ...revokeReceipt(), recipientCount: 1 }, { ...revokeReceipt(), sequence: 4 }])('requires an empty revoked audience (%j)', value => {
    expect(gradeReleaseReceiptMatches(value, revoke(), classId, actorId)).toBe(false);
  });
});
