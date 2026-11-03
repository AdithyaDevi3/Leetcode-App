import type { ClassResultTarget, GradeReleaseTarget } from '@leetcode-app/database';

export type ClassGradebookWorkspace = 'admin' | 'teach';
export const classGradebookTargetLimit = 500;
export const classGradebookCommandBytes = 160_000;
export class ClassGradebookInputError extends Error {
  constructor() { super('Use a valid class gradebook request.'); this.name = 'ClassGradebookInputError'; }
}
const invalid = (): never => { throw new ClassGradebookInputError(); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function classGradebookId(value: unknown): string {
  return typeof value === 'string' && uuid.test(value) ? value.toLowerCase() : invalid();
}
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some(key => !fields.includes(key))) return invalid();
  return value as Record<string, unknown>;
}
function sequence(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < 2_147_483_647 ? value as number : invalid();
}
function requestKey(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(value) ? value : invalid();
}
function targets<T extends { recipientId: string }>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > classGradebookTargetLimit) return invalid();
  const result = value.map(parse);
  if (new Set(result.map(item => item.recipientId)).size !== result.length) return invalid();
  return result;
}
export function classGradebookQuery(request: Request, learner = false): ClassGradebookWorkspace | null {
  const query = new URL(request.url).searchParams;
  if (learner) { if (query.size !== 0) return invalid(); return null; }
  if (query.size !== 1 || query.getAll('workspace').length !== 1) return invalid();
  const workspace = query.get('workspace');
  return workspace === 'admin' || workspace === 'teach' ? workspace : invalid();
}
export function classGradebookReleaseCommand(value: unknown): { targets: GradeReleaseTarget[]; requestKey: string } {
  const body = record(value, ['targets', 'requestKey']);
  return { targets: targets(body.targets, item => {
    const target = record(item, ['recipientId', 'gradeRevisionId', 'expectedPublicationSequence']);
    return { recipientId: classGradebookId(target.recipientId), gradeRevisionId: classGradebookId(target.gradeRevisionId),
      expectedPublicationSequence: sequence(target.expectedPublicationSequence) };
  }), requestKey: requestKey(body.requestKey) };
}
export type ClassGradebookSharingCommand =
  | { action: 'publish'; targets: ClassResultTarget[]; expectedSharingSequence: number; requestKey: string }
  | { action: 'revoke'; expectedSharingSequence: number; requestKey: string };
export function classGradebookSharingCommand(value: unknown): ClassGradebookSharingCommand {
  const body = record(value, ['action', 'targets', 'expectedSharingSequence', 'requestKey']);
  const common = { expectedSharingSequence: sequence(body.expectedSharingSequence), requestKey: requestKey(body.requestKey) };
  if (body.action === 'revoke') {
    if (Object.hasOwn(body, 'targets')) return invalid();
    return { action: 'revoke', ...common };
  }
  if (body.action !== 'publish') return invalid();
  return { action: 'publish', ...common, targets: targets(body.targets, item => {
    const target = record(item, ['recipientId', 'gradeRevisionId', 'publicationId', 'attemptId']);
    return { recipientId: classGradebookId(target.recipientId), gradeRevisionId: classGradebookId(target.gradeRevisionId),
      publicationId: classGradebookId(target.publicationId), attemptId: target.attemptId === null ? null : classGradebookId(target.attemptId) };
  }) };
}
export type ClassGradebookDraftCommand = {
  attemptId: string; expectedGradeRevisionId: string | null; criterionScores: Record<string, number>;
  learnerFeedback: string; privateNote: string; requestKey: string;
};
function feedback(value: unknown): string {
  if (typeof value !== 'string' || value.length > 10_000 || value.includes('\u0000')
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) return invalid();
  return value;
}
export function classGradebookDraftCommand(value: unknown): ClassGradebookDraftCommand {
  const body = record(value, ['attemptId', 'expectedGradeRevisionId', 'criterionScores', 'learnerFeedback', 'privateNote', 'requestKey']);
  const scores = record(body.criterionScores, Object.keys(body.criterionScores && typeof body.criterionScores === 'object' ? body.criterionScores : {}));
  const entries = Object.entries(scores);
  if (entries.length < 1 || entries.length > 100) return invalid();
  const criterionScores: Record<string, number> = Object.create(null);
  for (const [key, score] of entries) {
    if (!/^[a-z][a-z0-9_-]{0,79}$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)
      || !Number.isSafeInteger(score) || Number(score) < 0 || Number(score) > 1_000_000) return invalid();
    criterionScores[key] = score as number;
  }
  return { attemptId: classGradebookId(body.attemptId), expectedGradeRevisionId: body.expectedGradeRevisionId === null ? null : classGradebookId(body.expectedGradeRevisionId),
    criterionScores, learnerFeedback: feedback(body.learnerFeedback), privateNote: feedback(body.privateNote), requestKey: requestKey(body.requestKey) };
}
