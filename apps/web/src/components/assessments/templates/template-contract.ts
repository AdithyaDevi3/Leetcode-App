import type { LearnerQuestion } from '@leetcode-app/domain';
import type { TemplateArchiveCommand, TemplateContent, TemplateCreateCommand, TemplateDetailResponse, TemplateDraftResponse, TemplateLibraryResponse, TemplateMutationResponse, TemplateUpdateCommand, TemplateUseCommand, TemplateView } from '@/lib/assessment-template-api-types';

export const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const keys = (value: Record<string, unknown>, names: string[]) => Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 1;
const text = (value: unknown, maximum: number, minimum = 1): value is string => typeof value === 'string' && value.length <= maximum && value.trim().length >= minimum;
const timestamp = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const versionId = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]{2,79}@[1-9][0-9]{0,5}$/.test(value);
const slug = (value: unknown): value is string => text(value, 80) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const slugs = (value: unknown, maximum: number) => Array.isArray(value) && value.length > 0 && value.length <= maximum && value.every(slug) && new Set(value).size === value.length;
export function validQuestion(value: unknown): value is LearnerQuestion {
  if (!record(value) || !keys(value, ['questionId', 'version', 'versionId', 'kind', 'title', 'prompt', 'difficulty', 'activityIds', 'conceptIds', 'options'])
    || !slug(value.questionId) || !positive(value.version) || value.versionId !== `${value.questionId}@${value.version}` || !versionId(value.versionId)
    || value.kind !== 'multiple_choice' || !text(value.title, 160) || !text(value.prompt, 6_000) || !['foundation', 'intermediate', 'advanced'].includes(String(value.difficulty))
    || !slugs(value.activityIds, 4) || !slugs(value.conceptIds, 8) || !Array.isArray(value.options) || value.options.length < 2 || value.options.length > 6) return false;
  const options = new Set<string>();
  for (const item of value.options) {
    if (!record(item) || !keys(item, ['id', 'text']) || !slug(item.id) || item.id.length > 48 || !text(item.text, 2_000) || options.has(item.id)) return false;
    options.add(item.id);
  }
  return true;
}
function selections(value: unknown, withQuestion: boolean): value is TemplateView['questions'] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) return false;
  const seen = new Set<string>(); let total = 0;
  for (const item of value) {
    if (!record(item) || !keys(item, withQuestion ? ['questionVersionId', 'maxUnits', 'question'] : ['questionVersionId', 'maxUnits'])
      || !versionId(item.questionVersionId) || seen.has(item.questionVersionId.split('@')[0]) || !positive(item.maxUnits) || item.maxUnits > 1_000_000) return false;
    if (withQuestion && item.question !== null && (!validQuestion(item.question) || item.question.versionId !== item.questionVersionId)) return false;
    seen.add(item.questionVersionId.split('@')[0]); total += item.maxUnits;
  }
  return total <= 1_000_000;
}
export function validTemplate(value: unknown, templateId?: string): value is TemplateView {
  return record(value) && keys(value, ['id', 'revision', 'status', 'currentVersion', 'version', 'title', 'instructions', 'maxUnits', 'questions', 'createdAt', 'updatedAt', 'versionCreatedAt'])
    && uuid(value.id) && (templateId === undefined || value.id === templateId) && positive(value.revision) && ['active', 'archived'].includes(String(value.status))
    && positive(value.currentVersion) && positive(value.version) && value.version <= value.currentVersion && value.currentVersion <= value.revision
    && text(value.title, 160, 3) && text(value.instructions, 2_000, 0) && selections(value.questions, true)
    && value.maxUnits === value.questions.reduce((sum, item) => sum + item.maxUnits, 0)
    && timestamp(value.createdAt) && timestamp(value.updatedAt) && timestamp(value.versionCreatedAt);
}
export function validLibrary(value: unknown, actorId: string, page?: number): value is TemplateLibraryResponse {
  if (!record(value) || !keys(value, ['actorId', 'items', 'total', 'page', 'pageSize']) || value.actorId !== actorId || !positive(value.page) || (page !== undefined && value.page !== page)
    || value.pageSize !== 20 || !Number.isSafeInteger(value.total) || Number(value.total) < 0 || !Array.isArray(value.items) || value.items.length > 20 || value.items.length > Number(value.total)) return false;
  const ids = new Set<string>();
  for (const item of value.items) {
    if (!record(item) || !keys(item, ['id', 'revision', 'status', 'currentVersion', 'title', 'questionCount', 'maxUnits', 'updatedAt']) || !uuid(item.id)
      || ids.has(item.id) || !positive(item.revision) || !positive(item.currentVersion) || item.currentVersion > item.revision || !['active', 'archived'].includes(String(item.status))
      || !text(item.title, 160, 3) || !positive(item.questionCount) || item.questionCount > 30 || !positive(item.maxUnits) || item.maxUnits > 1_000_000 || !timestamp(item.updatedAt)) return false;
    ids.add(item.id);
  }
  return true;
}
export function validDetail(value: unknown, actorId: string, templateId: string): value is TemplateDetailResponse {
  if (!record(value) || !keys(value, ['actorId', 'template', 'destinations', 'catalog']) || value.actorId !== actorId || !validTemplate(value.template, templateId)
    || !Array.isArray(value.destinations) || !Array.isArray(value.catalog) || value.catalog.length > 1_000 || !value.catalog.every(validQuestion)) return false;
  const ids = new Set<string>();
  for (const item of value.destinations) {
    if (!record(item) || !keys(item, ['id', 'name']) || !uuid(item.id) || !text(item.name, 160) || ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return new Set(value.catalog.map(item => item.versionId)).size === value.catalog.length;
}
export function validMutation(value: unknown, actorId: string, templateId?: string): value is TemplateMutationResponse {
  return record(value) && keys(value, ['actorId', 'template', 'currentRevision']) && value.actorId === actorId && validTemplate(value.template, templateId)
    && positive(value.currentRevision) && value.currentRevision >= value.template.revision;
}
export function validDraftReceipt(value: unknown, actorId: string, destinationClassId?: string): value is TemplateDraftResponse {
  return record(value) && keys(value, ['actorId', 'draftId', 'classId']) && value.actorId === actorId && uuid(value.draftId) && uuid(value.classId)
    && (destinationClassId === undefined || value.classId === destinationClassId);
}
export function validContent(value: unknown): value is TemplateContent {
  return record(value) && keys(value, ['title', 'instructions', 'questions']) && text(value.title, 160, 3) && text(value.instructions, 2_000, 0) && selections(value.questions, false);
}
const commandBase = (value: Record<string, unknown>) => positive(value.expectedRevision) && text(value.requestKey, 128);
export function validCreateCommand(value: unknown, classId: string, draftId: string): value is TemplateCreateCommand {
  return record(value) && keys(value, ['operation', 'sourceClassId', 'sourceDraftId', 'expectedRevision', 'requestKey']) && value.operation === 'create_from_draft'
    && value.sourceClassId === classId && value.sourceDraftId === draftId && commandBase(value);
}
export function validEditCommand(value: unknown): value is TemplateUpdateCommand | TemplateArchiveCommand {
  return record(value) && commandBase(value) && (value.operation === 'update'
    ? keys(value, ['operation', 'expectedRevision', 'requestKey', 'content']) && validContent(value.content)
    : value.operation === 'set_archived' && keys(value, ['operation', 'expectedRevision', 'requestKey', 'archived']) && typeof value.archived === 'boolean');
}
export function validUseCommand(value: unknown): value is TemplateUseCommand {
  return record(value) && keys(value, ['version', 'expectedRevision', 'destinationClassId', 'requestKey']) && commandBase(value) && positive(value.version) && uuid(value.destinationClassId);
}
