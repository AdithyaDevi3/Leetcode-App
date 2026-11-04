import { describe, expect, it } from 'vitest';
import { announcementReceiptMatches, announcementTextValid, isAnnouncementList, isAnnouncementView, isPendingAnnouncementAction, type PendingAnnouncementAction } from './class-portal-client';

const actorId = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-2222-4222-8222-222222222222';
const announcementId = '33333333-3333-4333-8333-333333333333';
const revisionId = '44444444-4444-4444-8444-444444444444';
const id = '55555555-5555-4555-8555-555555555555';
const stamp = '2026-11-04T14:00:00.000Z';
const classroom = { id: classId, name: 'Synthetic algorithms', description: '', instructorName: 'Instructor', learnerCount: 2 };
const content = { revisionId, revisionNumber: 1, title: 'Review session', body: 'Bring an invariant explanation.', createdAt: stamp, authorName: 'Instructor' };
const save: PendingAnnouncementAction = { announcementId, kind: 'save', body: { requestKey: id, expectedSequence: 0, title: content.title, body: content.body } };
const publish: PendingAnnouncementAction = { announcementId, kind: 'publish', body: { requestKey: id, expectedSequence: 1, revisionId } };
const archive: PendingAnnouncementAction = { announcementId, kind: 'archive', body: { requestKey: id, expectedSequence: 2 } };
const read: PendingAnnouncementAction = { announcementId, kind: 'read', revisionId, body: { requestKey: id, publicationSequence: 2 } };
const receipt = { id, actorId, classId, announcementId, action: 'save', sequence: 1, revisionId, publicationSequence: null, createdAt: stamp };

describe('announcement command recovery', () => {
  it('accepts all bounded original command identities and pinned read revisions', () => {
    for (const action of [save, publish, archive, read]) expect(isPendingAnnouncementAction(JSON.parse(JSON.stringify(action)))).toBe(true);
  });
  it('rejects malformed browser metadata rather than issuing a replacement command', () => {
    for (const value of [null, [], { ...save, announcementId: '__proto__' }, { ...save, extra: true },
      { ...save, body: { ...save.body, requestKey: 'retry' } }, { ...save, body: { ...save.body, expectedSequence: -1 } },
      { ...save, body: { ...save.body, title: ' heading ' } }, { ...save, body: { ...save.body, body: 'x'.repeat(20_001) } },
      { ...publish, body: { ...publish.body, revisionId: 'wrong' } }, { ...read, revisionId: null },
      { ...read, body: { ...read.body, publicationSequence: 0 } }]) expect(isPendingAnnouncementAction(value)).toBe(false);
  });
  it('preserves plain text and refuses null bytes, broken Unicode and oversized content', () => {
    expect(announcementTextValid('<script>plain title</script>', '  Preserve spacing\n<img src=x onerror=alert(1)>')).toBe(true);
    for (const body of ['', '  ', '\u0000', '\ud800', '\udc00', 'x'.repeat(20_001)]) expect(announcementTextValid('Title', body)).toBe(false);
    expect(announcementTextValid('Title', '😀'.repeat(10_000))).toBe(true);
  });
});

describe('announcement durable receipt trust', () => {
  it('confirms exact original save, publish, archive and read commands', () => {
    expect(announcementReceiptMatches(receipt, save, classId, actorId)).toBe(true);
    expect(announcementReceiptMatches({ ...receipt, action: 'publish', sequence: 2, publicationSequence: 2 }, publish, classId, actorId)).toBe(true);
    expect(announcementReceiptMatches({ ...receipt, action: 'archive', sequence: 3, revisionId: null }, archive, classId, actorId)).toBe(true);
    expect(announcementReceiptMatches({ ...receipt, action: 'read', sequence: 2, publicationSequence: 2 }, read, classId, actorId)).toBe(true);
  });
  it('does not confirm another actor, class, announcement, action or sequence', () => {
    for (const change of [{ id: null }, { actorId: id }, { classId: id }, { announcementId: id }, { action: 'publish' },
      { sequence: 2 }, { revisionId: null }, { publicationSequence: 1 }, { createdAt: 'yesterday' }]) {
      expect(announcementReceiptMatches({ ...receipt, ...change }, save, classId, actorId)).toBe(false);
    }
  });
  it('rejects an incorrect revision or newer publication in an original read receipt', () => {
    const confirmed = { ...receipt, action: 'read', sequence: 2, publicationSequence: 2 };
    expect(announcementReceiptMatches({ ...confirmed, revisionId: id }, read, classId, actorId)).toBe(false);
    expect(announcementReceiptMatches({ ...confirmed, sequence: 3, publicationSequence: 3 }, read, classId, actorId)).toBe(false);
  });
});

describe('announcement response boundaries', () => {
  const summary = { id: announcementId, title: content.title, excerpt: content.body, publishedAt: stamp, publicationSequence: 2, unread: true };
  const view = { classroom, announcement: { id: announcementId, sequence: 2, status: 'published', draft: null, published: { id, sequence: 2, content, publishedAt: stamp }, unread: true } };
  it('allows published learner projections and refuses author metadata or a mismatched class', () => {
    expect(isAnnouncementList({ classroom, items: [summary], nextCursor: null }, classId, 'learner')).toBe(true);
    expect(isAnnouncementList({ classroom, items: [{ ...summary, authorState: { sequence: 3, revisionNumber: 2, status: 'published', hasUnpublishedChanges: true } }], nextCursor: null }, classId, 'learner')).toBe(false);
    expect(isAnnouncementList({ classroom, items: [summary], nextCursor: null }, id, 'learner')).toBe(false);
    expect(isAnnouncementList({ classroom, items: [summary, summary], nextCursor: null }, classId, 'learner')).toBe(false);
  });
  it('never accepts private drafts, unpublished identities or a draft-edit sequence in a learner detail', () => {
    expect(isAnnouncementView(view, classId, announcementId, 'learner')).toBe(true);
    expect(isAnnouncementView({ ...view, announcement: { ...view.announcement, draft: content } }, classId, announcementId, 'learner')).toBe(false);
    expect(isAnnouncementView({ ...view, announcement: { ...view.announcement, sequence: 3 } }, classId, announcementId, 'learner')).toBe(false);
    expect(isAnnouncementView({ ...view, announcement: { ...view.announcement, status: 'archived' } }, classId, announcementId, 'learner')).toBe(false);
    expect(isAnnouncementView(view, classId, id, 'learner')).toBe(false);
  });
});
