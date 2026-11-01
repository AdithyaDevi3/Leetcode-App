import type { AssessmentCopyCommand, AssessmentCopyPreview, AssessmentCopyResult } from '@/lib/assessment-copy-api-types';

export type { AssessmentCopyCommand };
export type AssessmentCopyReceipt = AssessmentCopyResult;

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const keys = (value: Record<string, unknown>, names: string[]) => Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const text = (value: unknown, maximum: number, minimum = 1): value is string => typeof value === 'string' && value.length <= maximum && value.trim().length >= minimum;
const slug = (value: unknown): value is string => text(value, 80) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const slugs = (value: unknown, maximum: number): value is string[] => Array.isArray(value) && value.length > 0 && value.length <= maximum && value.every(slug) && new Set(value).size === value.length;
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 1;
const version = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]{2,79}@[1-9][0-9]{0,5}$/.test(value);

export function validAssessmentCopyPreview(value: unknown, actorId: string, classId: string, draftId: string): value is AssessmentCopyPreview {
  if (!record(value) || !keys(value, ['actorId', 'source', 'destinations']) || value.actorId !== actorId || !record(value.source)) return false;
  const source = value.source;
  if (!keys(source, ['id', 'classId', 'className', 'title', 'instructions', 'revision', 'questions']) || source.id !== draftId || source.classId !== classId
    || !uuid(source.id) || !uuid(source.classId) || !text(source.className, 160) || !text(source.title, 160, 3) || !text(source.instructions, 2_000, 0)
    || !positive(source.revision) || !Array.isArray(source.questions) || source.questions.length < 1 || source.questions.length > 30) return false;
  const selected = new Set<string>();
  let total = 0;
  for (const item of source.questions) {
    if (!record(item) || !keys(item, ['questionVersionId', 'maxUnits', 'question']) || !version(item.questionVersionId)
      || selected.has(item.questionVersionId) || !positive(item.maxUnits) || item.maxUnits > 1_000_000) return false;
    selected.add(item.questionVersionId); total += item.maxUnits;
    if (total > 1_000_000) return false;
    if (item.question === null) continue;
    const question = item.question;
    if (!record(question) || !keys(question, ['questionId', 'version', 'versionId', 'kind', 'title', 'prompt', 'difficulty', 'activityIds', 'conceptIds', 'options'])
      || !slug(question.questionId) || !positive(question.version) || question.versionId !== `${question.questionId}@${question.version}` || question.versionId !== item.questionVersionId
      || question.kind !== 'multiple_choice' || !text(question.title, 160) || !text(question.prompt, 6_000) || !['foundation', 'intermediate', 'advanced'].includes(String(question.difficulty))
      || !slugs(question.activityIds, 4) || !slugs(question.conceptIds, 8) || !Array.isArray(question.options) || question.options.length < 2 || question.options.length > 6) return false;
    const options = new Set<string>();
    for (const option of question.options) {
      if (!record(option) || !keys(option, ['id', 'text']) || !slug(option.id) || option.id.length > 48 || options.has(option.id) || !text(option.text, 2_000)) return false;
      options.add(option.id);
    }
  }
  if (!Array.isArray(value.destinations) || !value.destinations.length) return false;
  const destinations = new Set<string>();
  for (const destination of value.destinations) {
    if (!record(destination) || !keys(destination, ['id', 'name']) || !uuid(destination.id) || !text(destination.name, 160) || destinations.has(destination.id)) return false;
    destinations.add(destination.id);
  }
  return destinations.has(classId);
}

export function validAssessmentCopyCommand(value: unknown, classId: string): value is AssessmentCopyCommand {
  return record(value) && keys(value, ['sourceClassId', 'destinationClassId', 'expectedRevision', 'requestKey']) && value.sourceClassId === classId
    && uuid(value.destinationClassId) && positive(value.expectedRevision) && text(value.requestKey, 128);
}

export function validAssessmentCopyReceipt(value: unknown, actorId: string, sourceDraftId: string, destinationClassId?: string): value is AssessmentCopyReceipt {
  return record(value) && keys(value, ['actorId', 'draftId', 'classId']) && value.actorId === actorId && uuid(value.draftId)
    && value.draftId !== sourceDraftId && uuid(value.classId) && (destinationClassId === undefined || value.classId === destinationClassId);
}
