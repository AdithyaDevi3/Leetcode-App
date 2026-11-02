import type { WrittenAssessmentDraft, WrittenAuthorView, LearnerWrittenAssignment, WrittenPublication, WrittenResponseDraft, WrittenSubmissionReceipt } from '@leetcode-app/database';
import type { WrittenDetailResponse, WrittenDraftResponse, WrittenLearnerResponse, WrittenListResponse, WrittenPublishResponse, WrittenSaveResponse, WrittenSubmitResponse } from '@/lib/written-assessment-api-types';

export const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const keys = (value: Record<string, unknown>, names: string[]) => Object.keys(value).every(key => names.includes(key)) && names.every(key => Object.hasOwn(value, key));
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const integer = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= 2_147_483_647;
const text = (value: unknown, maximum: number) => typeof value === 'string' && value.length <= maximum;
const time = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableTime = (value: unknown) => value === null || time(value);
export function validCriteria(value: unknown, total?: number, allowEmpty = false): value is WrittenAssessmentDraft['criteria'] {
  if (!Array.isArray(value) || value.length > 20 || (!allowEmpty && !value.length)) return false;
  const ids = new Set<string>(); let sum = 0;
  for (const criterion of value) {
    if (!record(criterion) || !keys(criterion, ['id', 'label', 'maxUnits']) || typeof criterion.id !== 'string'
      || !/^[a-z][a-z0-9_-]{0,63}$/.test(criterion.id) || ['__proto__', 'constructor', 'prototype'].includes(criterion.id)
      || ids.has(criterion.id) || !text(criterion.label, 160) || !String(criterion.label).trim() || !integer(criterion.maxUnits, 1)) return false;
    ids.add(criterion.id); sum += criterion.maxUnits;
  }
  return sum <= 1_000_000 && (total === undefined || !value.length && allowEmpty || sum === total);
}
export function validDraft(value: unknown, classId: string): value is WrittenAssessmentDraft {
  return record(value) && keys(value, ['id', 'classId', 'createdBy', 'revision', 'status', 'title', 'instructions', 'prompt', 'criteria', 'maxUnits', 'availableAt', 'dueAt', 'closesAt', 'createdAt', 'updatedAt'])
    && uuid(value.id) && value.classId === classId && (value.createdBy === null || uuid(value.createdBy)) && integer(value.revision, 1) && value.status === 'draft'
    && text(value.title, 160) && String(value.title).trim().length >= 3 && text(value.instructions, 2000) && text(value.prompt, 20_000) && Boolean(String(value.prompt).trim())
    && integer(value.maxUnits, 1) && validCriteria(value.criteria, value.maxUnits) && nullableTime(value.availableAt) && nullableTime(value.dueAt) && nullableTime(value.closesAt)
    && time(value.createdAt) && time(value.updatedAt);
}
export function validPublication(value: unknown, classId: string, draftId: string): value is WrittenPublication {
  return record(value) && keys(value, ['id', 'draftId', 'draftRevision', 'classId', 'assignmentId', 'policyVersionId', 'recipientCount', 'audienceKind', 'publishedAt'])
    && uuid(value.id) && value.draftId === draftId && value.classId === classId && integer(value.draftRevision, 1) && uuid(value.assignmentId) && uuid(value.policyVersionId)
    && integer(value.recipientCount, 1) && ['class', 'selected'].includes(String(value.audienceKind)) && time(value.publishedAt);
}
export function validAuthor(value: unknown, classId: string, draftId: string): value is WrittenAuthorView {
  if (!record(value) || !keys(value, ['draft', 'learners', 'rosterFingerprint', 'publication']) || !validDraft(value.draft, classId) || value.draft.id !== draftId
    || typeof value.rosterFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.rosterFingerprint) || !Array.isArray(value.learners) || value.learners.length > 5000) return false;
  const ids = new Set<string>();
  for (const learner of value.learners) {
    if (!record(learner) || !keys(learner, ['id', 'displayName', 'email']) || !uuid(learner.id) || ids.has(learner.id)
      || !text(learner.displayName, 1000) || !(learner.email === null || text(learner.email, 1000))) return false;
    ids.add(learner.id);
  }
  return value.publication === null || validPublication(value.publication, classId, draftId);
}
export function validResponseDraft(value: unknown): value is WrittenResponseDraft {
  return record(value) && keys(value, ['revision', 'text', 'updatedAt']) && integer(value.revision) && text(value.text, 100_000)
    && new TextEncoder().encode(String(value.text)).length <= 100_000 && (value.revision === 0 ? value.text === '' && value.updatedAt === null : time(value.updatedAt));
}
export function validSubmission(value: unknown): value is WrittenSubmissionReceipt {
  return record(value) && keys(value, ['attemptId', 'responseRevisionId', 'responseRevision', 'submittedAt', 'isLate']) && uuid(value.attemptId) && uuid(value.responseRevisionId)
    && integer(value.responseRevision, 1) && time(value.submittedAt) && typeof value.isLate === 'boolean';
}
export function validLearner(value: unknown, recipientId: string, classId: string, policyId?: string): value is LearnerWrittenAssignment {
  if (!record(value) || !keys(value, ['recipientId', 'classId', 'assignmentId', 'policyVersionId', 'title', 'instructions', 'prompt', 'criteria', 'maxUnits', 'availableAt', 'dueAt', 'closesAt', 'responseDraft', 'submission', 'releasedGrade', 'isOpen', 'isClosed', 'isExcused'])
    || value.recipientId !== recipientId || value.classId !== classId || !uuid(value.assignmentId) || !uuid(value.policyVersionId) || policyId !== undefined && value.policyVersionId !== policyId
    || !text(value.title, 160) || !text(value.instructions, 2000) || !text(value.prompt, 20_000) || !integer(value.maxUnits, 1)
    || typeof value.isOpen !== 'boolean' || typeof value.isClosed !== 'boolean' || typeof value.isExcused !== 'boolean' || !validCriteria(value.criteria, value.maxUnits, !value.isOpen || value.isExcused)
    || !nullableTime(value.availableAt) || !nullableTime(value.dueAt) || !nullableTime(value.closesAt) || !validResponseDraft(value.responseDraft)
    || !(value.submission === null || validSubmission(value.submission))) return false;
  if (value.submission && value.submission.responseRevision !== value.responseDraft.revision) return false;
  if ((!value.isOpen || value.isExcused) && (value.prompt !== '' || value.criteria.length || value.responseDraft.revision !== 0 || value.responseDraft.text !== '' || value.responseDraft.updatedAt !== null || value.submission !== null || value.releasedGrade !== null)) return false;
  const grade = value.releasedGrade;
  if (grade === null) return true;
  if (!record(grade) || !keys(grade, ['gradeRevisionId', 'earnedUnits', 'criterionScores', 'learnerFeedback', 'publishedAt']) || !uuid(grade.gradeRevisionId)
    || !integer(grade.earnedUnits) || grade.earnedUnits > value.maxUnits || !record(grade.criterionScores) || !text(grade.learnerFeedback, 10_000) || !time(grade.publishedAt)) return false;
  const scores = Object.entries(grade.criterionScores);
  const criteria = value.criteria;
  return scores.every(([id, units]) => integer(units) && criteria.some(criterion => criterion.id === id && units <= criterion.maxUnits))
    && scores.reduce((sum, [, units]) => sum + Number(units), 0) === grade.earnedUnits
    && (scores.length === value.criteria.length || scores.length === 0 && grade.earnedUnits === 0);
}
export const validList = (value: unknown, actorId: string, classId: string): value is WrittenListResponse => record(value) && keys(value, ['actorId', 'classId', 'drafts']) && value.actorId === actorId && value.classId === classId && Array.isArray(value.drafts) && value.drafts.every(draft => validDraft(draft, classId));
export const validDetail = (value: unknown, actorId: string, classId: string, draftId: string): value is WrittenDetailResponse => record(value) && keys(value, ['actorId', 'author']) && value.actorId === actorId && validAuthor(value.author, classId, draftId);
export const validDraftReceipt = (value: unknown, actorId: string, classId: string, draftId?: string): value is WrittenDraftResponse => record(value) && keys(value, ['actorId', 'draft', 'currentRevision']) && value.actorId === actorId && validDraft(value.draft, classId) && (!draftId || value.draft.id === draftId) && integer(value.currentRevision, value.draft.revision);
export const validPublishReceipt = (value: unknown, actorId: string, classId: string, draftId: string): value is WrittenPublishResponse => record(value) && keys(value, ['actorId', 'publication']) && value.actorId === actorId && validPublication(value.publication, classId, draftId);
export const validLearnerReply = (value: unknown, actorId: string, recipientId: string, classId: string, policyId?: string): value is WrittenLearnerResponse => record(value) && keys(value, ['actorId', 'assignment']) && value.actorId === actorId && validLearner(value.assignment, recipientId, classId, policyId);
export const validSaveReceipt = (value: unknown, actorId: string, recipientId: string): value is WrittenSaveResponse => record(value) && keys(value, ['actorId', 'recipientId', 'responseDraft', 'currentRevision']) && value.actorId === actorId && value.recipientId === recipientId && validResponseDraft(value.responseDraft) && integer(value.currentRevision, value.responseDraft.revision);
export const validSubmitReceipt = (value: unknown, actorId: string, recipientId: string): value is WrittenSubmitResponse => record(value) && keys(value, ['actorId', 'recipientId', 'submission']) && value.actorId === actorId && value.recipientId === recipientId && validSubmission(value.submission);
