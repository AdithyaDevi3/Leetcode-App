import type { ClassInsightsResponse } from '@/lib/class-insights-api-types';

export type ClassInsightsView = ClassInsightsResponse;

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key)) && allowed.every(key => Object.hasOwn(value, key));
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const percent = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const slug = (value: unknown): value is string => typeof value === 'string' && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const text = (value: unknown, maximum: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
const slugs = (value: unknown, minimum: number, maximum: number): value is string[] => Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every(slug) && new Set(value).size === value.length;
export const focusSignature = (value: readonly string[]) => [...value].sort().join(',');

/** A malformed or unsuppressed response never becomes a verified class view. */
export function validClassInsights(value: unknown, actorId: string, classId: string, workspace: 'teach' | 'admin'): value is ClassInsightsView {
  if (!record(value) || !keys(value, ['actorId', 'report', 'suggestion']) || value.actorId !== actorId || !record(value.report) || !record(value.suggestion)) return false;
  const report = value.report;
  if (!keys(report, ['algorithmVersion', 'classroom', 'generatedAt', 'view', 'adminMinimumLearners', 'rosterCount', 'concepts'])
    || report.algorithmVersion !== 'class-insights-v1' || report.view !== (workspace === 'admin' ? 'administrator' : 'owner') || report.adminMinimumLearners !== 5
    || !integer(report.rosterCount) || typeof report.generatedAt !== 'string' || !Number.isFinite(Date.parse(report.generatedAt))
    || !record(report.classroom) || !keys(report.classroom, ['id', 'name']) || report.classroom.id !== classId || !text(report.classroom.name, 160)
    || !Array.isArray(report.concepts) || report.concepts.length > 256) return false;
  const conceptIds = new Set<string>();
  const fields = ['answeredItems', 'correctItems', 'coveredLearners', 'distinctQuestions', 'observedCorrectPercent', 'coveragePercent'];
  for (const concept of report.concepts) {
    if (!record(concept) || !keys(concept, ['conceptId', 'coverageStatus', ...fields]) || !slug(concept.conceptId) || conceptIds.has(concept.conceptId)
      || !['unknown', 'limited', 'covered', 'suppressed'].includes(String(concept.coverageStatus))) return false;
    conceptIds.add(concept.conceptId);
    if (concept.coverageStatus === 'suppressed' || (report.view === 'administrator' && concept.coverageStatus === 'unknown')) {
      if (fields.some(field => concept[field] !== null) || (report.view !== 'administrator' && concept.coverageStatus === 'suppressed')) return false;
      continue;
    }
    if (!integer(concept.answeredItems) || !integer(concept.correctItems) || !integer(concept.coveredLearners) || !integer(concept.distinctQuestions)
      || concept.correctItems > concept.answeredItems || concept.coveredLearners > report.rosterCount || concept.coveredLearners > concept.answeredItems || concept.distinctQuestions > concept.answeredItems
      || !percent(concept.coveragePercent) || (concept.answeredItems === 0 ? concept.observedCorrectPercent !== null : !percent(concept.observedCorrectPercent))) return false;
    if (report.view === 'administrator' && concept.coveredLearners < 5) return false;
    if (concept.coverageStatus === 'unknown' && (concept.answeredItems !== 0 || concept.correctItems !== 0 || concept.coveredLearners !== 0 || concept.distinctQuestions !== 0 || concept.coveragePercent !== 0)) return false;
    if (concept.coverageStatus !== 'unknown' && (concept.answeredItems === 0 || concept.coveredLearners === 0 || concept.distinctQuestions === 0)) return false;
    if (concept.observedCorrectPercent !== (concept.answeredItems ? Math.round(concept.correctItems / concept.answeredItems * 100) : null)
      || concept.coveragePercent !== (report.rosterCount ? Math.round(concept.coveredLearners / report.rosterCount * 100) : 0)) return false;
    if (concept.coverageStatus !== 'unknown' && concept.coverageStatus !== (concept.coveredLearners >= 3 && concept.distinctQuestions >= 3 ? 'covered' : 'limited')) return false;
  }
  const suggestion = value.suggestion;
  if (!keys(suggestion, ['focusConceptIds', 'questions', 'reason', 'emptyReason', 'unavailableConceptIds']) || !slugs(suggestion.focusConceptIds, 0, 3)
    || suggestion.focusConceptIds.some(id => !conceptIds.has(id)) || !text(suggestion.reason, 2_000)
    || !slugs(suggestion.unavailableConceptIds, 0, 3) || suggestion.unavailableConceptIds.some(id => !(suggestion.focusConceptIds as string[]).includes(id))
    || !Array.isArray(suggestion.questions) || suggestion.questions.length > 6
    || (suggestion.questions.length ? suggestion.emptyReason !== null : !text(suggestion.emptyReason, 2_000))) return false;
  const questions = new Set<string>();
  const coveredFocus = new Set<string>();
  for (const question of suggestion.questions) {
    if (!record(question) || !keys(question, ['questionId', 'version', 'versionId', 'kind', 'title', 'prompt', 'difficulty', 'activityIds', 'conceptIds', 'options'])
      || !slug(question.questionId) || !integer(question.version) || question.version < 1 || question.versionId !== `${question.questionId}@${question.version}` || questions.has(question.questionId)
      || question.kind !== 'multiple_choice' || !text(question.title, 160) || !text(question.prompt, 6_000) || !['foundation', 'intermediate'].includes(String(question.difficulty))
      || !slugs(question.conceptIds, 1, 8) || !slugs(question.activityIds, 1, 4) || !question.conceptIds.some(id => (suggestion.focusConceptIds as string[]).includes(id))
      || !Array.isArray(question.options) || question.options.length < 2 || question.options.length > 6) return false;
    questions.add(question.questionId);
    for (const id of question.conceptIds) if (suggestion.focusConceptIds.includes(id)) coveredFocus.add(id);
    const options = new Set<string>();
    for (const option of question.options) {
      if (!record(option) || !keys(option, ['id', 'text']) || !slug(option.id) || option.id.length > 48 || !text(option.text, 2_000) || options.has(option.id)) return false;
      options.add(option.id);
    }
  }
  const missing = suggestion.focusConceptIds.filter(id => !coveredFocus.has(id));
  return focusSignature(missing) === focusSignature(suggestion.unavailableConceptIds);
}
