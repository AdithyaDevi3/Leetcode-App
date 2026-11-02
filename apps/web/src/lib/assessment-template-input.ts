import type { TemplateArchiveCommand, TemplateContent, TemplateCreateCommand, TemplateUpdateCommand, TemplateUseCommand, TemplateWorkspace } from './assessment-template-api-types';
import { assessmentUuid } from './assessment-draft-input';

export class AssessmentTemplateInputError extends Error {}
const invalid = (): never => { throw new AssessmentTemplateInputError('Choose valid template content, a saved version and an authorized class.'); };
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) return invalid();
  return value as Record<string, unknown>;
}
export function templateId(value: unknown): string {
  if (typeof value !== 'string' || !assessmentUuid.test(value)) return invalid();
  return value.toLowerCase();
}
function positive(value: unknown, maximum = 2_147_483_647): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) return invalid();
  return value as number;
}
function requestKey(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) return invalid();
  return value.trim();
}
function query(request: Request, fields: readonly string[]) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => !fields.includes(key) || params.getAll(key).length !== 1)) return invalid();
  const workspace = params.get('workspace');
  if (workspace !== 'teach' && workspace !== 'admin') return invalid();
  return { params, workspace: workspace as TemplateWorkspace };
}
function queryInteger(value: string | null, maximum?: number) {
  if (value === null || !/^[1-9][0-9]{0,9}$/.test(value)) return invalid();
  return positive(Number(value), maximum);
}
export function templateWorkspace(request: Request): TemplateWorkspace { return query(request, ['workspace']).workspace; }
export function templateLibraryQuery(request: Request) {
  const { params, workspace } = query(request, ['workspace', 'search', 'status', 'page']);
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? 'active';
  if (search.length > 160 || !['active', 'archived', 'all'].includes(status)) return invalid();
  return { workspace, search: search.trim(), status: status as 'active' | 'archived' | 'all', page: params.has('page') ? queryInteger(params.get('page'), 1_000_000) : 1 };
}
export function templateDetailQuery(request: Request) {
  const { params, workspace } = query(request, ['workspace', 'version']);
  return { workspace, version: params.has('version') ? queryInteger(params.get('version')) : undefined };
}
export function templateContent(value: unknown): TemplateContent {
  const input = record(value, ['title', 'instructions', 'questions']);
  if (typeof input.title !== 'string' || input.title.trim().length < 3 || input.title.trim().length > 160
    || typeof input.instructions !== 'string' || input.instructions.length > 2_000
    || !Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 30) return invalid();
  let total = 0;
  const seen = new Set<string>();
  const questions = input.questions.map(value => {
    const item = record(value, ['questionVersionId', 'maxUnits']);
    if (typeof item.questionVersionId !== 'string' || !/^[a-z][a-z0-9-]{2,79}@[1-9][0-9]{0,5}$/.test(item.questionVersionId)
      || seen.has(item.questionVersionId.split('@')[0])) return invalid();
    seen.add(item.questionVersionId.split('@')[0]);
    const maxUnits = positive(item.maxUnits, 1_000_000); total += maxUnits;
    if (total > 1_000_000) return invalid();
    return { questionVersionId: item.questionVersionId, maxUnits };
  });
  return { title: input.title.trim(), instructions: input.instructions.trim(), questions };
}
export function templateCreateCommand(value: unknown): TemplateCreateCommand {
  const input = record(value, ['operation', 'sourceClassId', 'sourceDraftId', 'expectedRevision', 'requestKey']);
  if (input.operation !== 'create_from_draft') return invalid();
  return { operation: 'create_from_draft', sourceClassId: templateId(input.sourceClassId), sourceDraftId: templateId(input.sourceDraftId),
    expectedRevision: positive(input.expectedRevision), requestKey: requestKey(input.requestKey) };
}
export function templateMutationCommand(value: unknown): TemplateUpdateCommand | TemplateArchiveCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const operation = (value as Record<string, unknown>).operation;
  if (operation === 'update') {
    const input = record(value, ['operation', 'expectedRevision', 'requestKey', 'content']);
    return { operation, expectedRevision: positive(input.expectedRevision), requestKey: requestKey(input.requestKey), content: templateContent(input.content) };
  }
  if (operation === 'set_archived') {
    const input = record(value, ['operation', 'expectedRevision', 'requestKey', 'archived']);
    if (typeof input.archived !== 'boolean') return invalid();
    return { operation, expectedRevision: positive(input.expectedRevision), requestKey: requestKey(input.requestKey), archived: input.archived };
  }
  return invalid();
}
export function templateUseCommand(value: unknown): TemplateUseCommand {
  const input = record(value, ['version', 'expectedRevision', 'destinationClassId', 'requestKey']);
  return { version: positive(input.version), expectedRevision: positive(input.expectedRevision), destinationClassId: templateId(input.destinationClassId), requestKey: requestKey(input.requestKey) };
}
