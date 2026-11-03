import type { AssignmentGradeReleaseReceipt, ClassResultTarget, ClassResultsSharingReceipt, GradeReleaseTarget } from '@leetcode-app/database';

export type PendingGradeAction = {
  assignmentId: string;
} & ({ kind: 'release'; body: { targets: GradeReleaseTarget[]; requestKey: string } }
  | { kind: 'share'; body: { action: 'publish'; targets: ClassResultTarget[]; expectedSharingSequence: number; requestKey: string } }
  | { kind: 'revoke'; body: { action: 'revoke'; expectedSharingSequence: number; requestKey: string } });

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value)));
const sequence = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < 2_147_483_647;
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const targets = (value: unknown, valid: (target: unknown) => boolean): boolean => Array.isArray(value) && value.length >= 1 && value.length <= 500
  && value.every(valid) && new Set(value.map(item => item.recipientId)).size === value.length;

export function isPendingGradeAction(value: unknown): value is PendingGradeAction {
  if (!record(value) || !exact(value, ['assignmentId', 'kind', 'body']) || !uuid(value.assignmentId) || !record(value.body) || !uuid(value.body.requestKey)) return false;
  const body = value.body;
  if (value.kind === 'release') return exact(body, ['targets', 'requestKey']) && targets(body.targets, target => record(target)
    && exact(target, ['recipientId', 'gradeRevisionId', 'expectedPublicationSequence']) && uuid(target.recipientId) && uuid(target.gradeRevisionId) && sequence(target.expectedPublicationSequence));
  if (!sequence(body.expectedSharingSequence)) return false;
  if (value.kind === 'revoke') return exact(body, ['action', 'expectedSharingSequence', 'requestKey']) && body.action === 'revoke';
  return value.kind === 'share' && body.action === 'publish' && exact(body, ['action', 'targets', 'expectedSharingSequence', 'requestKey'])
    && targets(body.targets, target => record(target) && exact(target, ['recipientId', 'gradeRevisionId', 'publicationId', 'attemptId'])
      && uuid(target.recipientId) && uuid(target.gradeRevisionId) && uuid(target.publicationId) && (target.attemptId === null || uuid(target.attemptId)));
}

export function gradeReleaseReceiptMatches(value: unknown, pending: PendingGradeAction, classId: string, actorId: string): value is AssignmentGradeReleaseReceipt | ClassResultsSharingReceipt {
  if (!record(value) || !uuid(value.id) || value.classId !== classId || value.assignmentId !== pending.assignmentId
    || !timestamp(value.createdAt)) return false;
  if (pending.kind === 'release') {
    if (value.actorId !== actorId || !Array.isArray(value.publications) || value.publications.length !== pending.body.targets.length) return false;
    const seen = new Set<string>();
    const publicationIds = new Set<string>();
    return value.publications.every(item => {
      if (!record(item) || typeof item.recipientId !== 'string' || seen.has(item.recipientId) || !record(item.publication)) return false;
      seen.add(item.recipientId);
      const target = pending.body.targets.find(target => target.recipientId === item.recipientId);
      if (!target || !uuid(item.publication.id) || publicationIds.has(item.publication.id)) return false;
      publicationIds.add(item.publication.id);
      return item.publication.gradeRevisionId === target.gradeRevisionId
        && item.publication.sequence === target.expectedPublicationSequence + 1 && timestamp(item.publication.publishedAt);
    });
  }
  return value.shared === (pending.kind === 'share') && value.sequence === pending.body.expectedSharingSequence + 1
    && value.recipientCount === (pending.kind === 'share' ? pending.body.targets.length : 0);
}
