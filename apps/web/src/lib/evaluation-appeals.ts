import { randomUUID } from 'node:crypto';

export type AppealStatus = 'submitted' | 'in_review' | 'resolved';
export type EvaluationAppeal = {
  id: string;
  jobId: string;
  userId: string;
  findingId: string;
  context: string;
  status: AppealStatus;
  reviewerId: string | null;
  overrideApproved: boolean | null;
  overrideReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
};
export type AuditEvent = { id: string; appealId: string; actorId: string; action: string; reason: string; createdAt: string };

const appeals = new Map<string, EvaluationAppeal>();
const auditEvents: AuditEvent[] = [];

export function submitAppeal(input: Pick<EvaluationAppeal, 'jobId' | 'userId' | 'findingId' | 'context'>) {
  const appeal: EvaluationAppeal = { id: randomUUID(), ...input, status: 'submitted', reviewerId: null, overrideApproved: null, overrideReason: null, createdAt: new Date().toISOString(), resolvedAt: null };
  appeals.set(appeal.id, appeal);
  return appeal;
}
export function getAppeal(id: string) { return appeals.get(id) ?? null; }
export function listAppeals() { return [...appeals.values()]; }
export function resolveAppeal(id: string, input: { reviewerId: string; approved: boolean; reason: string }) {
  const appeal = appeals.get(id);
  if (!appeal || appeal.status === 'resolved') return appeal ?? null;
  const reason = input.reason.trim();
  if (!reason) throw new Error('Override reason is required');
  appeal.status = 'resolved'; appeal.reviewerId = input.reviewerId; appeal.overrideApproved = input.approved; appeal.overrideReason = reason; appeal.resolvedAt = new Date().toISOString();
  auditEvents.push({ id: randomUUID(), appealId: id, actorId: input.reviewerId, action: input.approved ? 'appeal.approved' : 'appeal.rejected', reason, createdAt: new Date().toISOString() });
  return appeal;
}
export function getAppealAudit(id: string) { return auditEvents.filter((event) => event.appealId === id); }
export function resetAppealsForTests() { appeals.clear(); auditEvents.length = 0; }
