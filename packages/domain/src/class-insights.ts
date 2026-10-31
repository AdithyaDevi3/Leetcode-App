import type { QuestionVersion } from './question-bank.js';

export const CLASS_INSIGHTS_VERSION = 'class-insights-v1' as const;
export const CLASS_INSIGHTS_ADMIN_MINIMUM_LEARNERS = 5 as const;
export type ClassConceptCoverage = 'unknown' | 'limited' | 'covered' | 'suppressed';
export type ClassConceptInsight = {
  conceptId: string;
  coverageStatus: ClassConceptCoverage;
  answeredItems: number | null;
  correctItems: number | null;
  coveredLearners: number | null;
  distinctQuestions: number | null;
  observedCorrectPercent: number | null;
  coveragePercent: number | null;
};
export type ClassInsightsReport = {
  algorithmVersion: typeof CLASS_INSIGHTS_VERSION;
  classroom: { id: string; name: string };
  generatedAt: string;
  view: 'owner' | 'administrator';
  adminMinimumLearners: typeof CLASS_INSIGHTS_ADMIN_MINIMUM_LEARNERS;
  rosterCount: number;
  concepts: ClassConceptInsight[];
};
/** Internal class-assessment facts, never a learner/API projection. */
export type ClassInsightObservation = {
  learnerId: string; questionId: string; conceptIds: readonly string[];
  correct: boolean | null; occurredAt: string; sourceId: string;
};
export type ClassFollowUpSelection = {
  focusConceptIds: string[];
  items: { questionVersionId: string; maxUnits: 500; conceptIds: string[]; reason: 'review' | 'coverage' }[];
  unavailableConceptIds: string[];
};

const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function instant(value: string): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  const fraction = /\.(\d{1,6})Z$/.exec(value)?.[1] ?? '';
  return `${new Date(value).toISOString().slice(0, 19)}.${fraction.padEnd(6, '0')}Z`;
}

/** Counts observed class answers; never infers a proficiency level or missing-answer weakness. */
export function buildClassInsights(input: {
  classroom: { id: string; name: string }; generatedAt: string; view: ClassInsightsReport['view'];
  rosterCount: number; conceptIds: readonly string[]; observations: readonly ClassInsightObservation[];
}): ClassInsightsReport {
  if (!Number.isSafeInteger(input.rosterCount) || input.rosterCount < 0 || !instant(input.generatedAt)
    || !['owner', 'administrator'].includes(input.view)) throw new Error('Invalid class insight context.');
  const concepts = [...new Set(input.conceptIds.filter(id => typeof id === 'string' && identifier.test(id)))].sort();
  const allowed = new Set(concepts);
  const latest = new Map<string, ClassInsightObservation & { at: string }>();
  for (const observation of input.observations) {
    // Missing answers do not erase an earlier eligible answered item.
    if (typeof observation.correct !== 'boolean' || !observation.learnerId || !observation.questionId
      || !identifier.test(observation.questionId) || !Array.isArray(observation.conceptIds)) continue;
    const at = instant(observation.occurredAt);
    if (!at) continue;
    const key = JSON.stringify([observation.learnerId, observation.questionId]);
    const previous = latest.get(key);
    if (!previous || at > previous.at || (at === previous.at && observation.sourceId > previous.sourceId)) latest.set(key, { ...observation, at });
  }
  const groups = new Map<string, (ClassInsightObservation & { at: string })[]>();
  for (const item of latest.values()) for (const conceptId of new Set(item.conceptIds)) {
    if (!allowed.has(conceptId)) continue;
    const group = groups.get(conceptId) ?? [];
    group.push(item); groups.set(conceptId, group);
  }
  return {
    algorithmVersion: CLASS_INSIGHTS_VERSION,
    classroom: { id: input.classroom.id, name: input.classroom.name }, generatedAt: input.generatedAt,
    view: input.view, adminMinimumLearners: CLASS_INSIGHTS_ADMIN_MINIMUM_LEARNERS, rosterCount: input.rosterCount,
    concepts: concepts.map(conceptId => {
      const items = groups.get(conceptId) ?? [];
      const learners = new Set(items.map(item => item.learnerId)).size;
      const distinctQuestions = new Set(items.map(item => item.questionId)).size;
      const coverageStatus: ClassConceptCoverage = !items.length ? 'unknown'
        : input.view === 'administrator' && learners < CLASS_INSIGHTS_ADMIN_MINIMUM_LEARNERS ? 'suppressed'
          : learners < 3 || distinctQuestions < 3 ? 'limited' : 'covered';
      if (input.view === 'administrator' && learners < CLASS_INSIGHTS_ADMIN_MINIMUM_LEARNERS) return {
        conceptId, coverageStatus, answeredItems: null, correctItems: null, coveredLearners: null,
        distinctQuestions: null, observedCorrectPercent: null, coveragePercent: null,
      };
      const correct = items.filter(item => item.correct).length;
      return { conceptId, coverageStatus, answeredItems: items.length, correctItems: correct, coveredLearners: learners,
        distinctQuestions, observedCorrectPercent: items.length ? Math.round(correct / items.length * 100) : null,
        coveragePercent: input.rosterCount ? Math.round(learners / input.rosterCount * 100) : 0 };
    }),
  };
}

/** Only adequately covered, visible observations may prioritize a review. */
function needsReview(concept: ClassConceptInsight): boolean {
  return concept.coverageStatus === 'covered' && concept.observedCorrectPercent !== null && concept.observedCorrectPercent < 70;
}
export function selectClassFollowUpFocus(report: ClassInsightsReport): string[] {
  return [...report.concepts].sort((a, b) => Number(needsReview(b)) - Number(needsReview(a))
    || (needsReview(a) && needsReview(b) ? a.observedCorrectPercent! - b.observedCorrectPercent! : 0)
    || a.conceptId.localeCompare(b.conceptId)).slice(0, 3).map(item => item.conceptId);
}

/** Reviewed class items only. A previously assigned logical question is never silently repeated. */
export function buildClassFollowUp(report: ClassInsightsReport, questions: readonly QuestionVersion[], assignedQuestionIds: readonly string[], focusConceptIds?: readonly string[]): ClassFollowUpSelection {
  const focus = focusConceptIds ? [...new Set(focusConceptIds)] : selectClassFollowUpFocus(report);
  if (focus.length > 3 || focus.some(id => !report.concepts.some(concept => concept.conceptId === id))) throw new Error('Choose up to three class concepts.');
  const excluded = new Set(assignedQuestionIds);
  const fresh = new Map<string, QuestionVersion>();
  for (const question of questions) {
    if (question.status !== 'reviewed' || question.difficulty === 'advanced' || excluded.has(question.questionId)
      || !question.conceptIds.some(id => focus.includes(id))) continue;
    const previous = fresh.get(question.questionId);
    if (!previous || question.version > previous.version) fresh.set(question.questionId, question);
  }
  const candidates = [...fresh.values()];
  const items: ClassFollowUpSelection['items'] = [];
  const counts = new Map(focus.map(id => [id, 0]));
  while (items.length < 6 && candidates.length) {
    candidates.sort((a, b) => {
      const score = (question: QuestionVersion) => question.conceptIds.reduce((total, id) => total + (focus.includes(id) ? (counts.get(id) ?? 0) === 0 ? 10 : (counts.get(id) ?? 0) < 2 ? 2 : 0 : 0), 0);
      return score(b) - score(a) || Number(a.difficulty !== 'foundation') - Number(b.difficulty !== 'foundation') || a.questionId.localeCompare(b.questionId);
    });
    const chosen = candidates.shift()!;
    const matched = chosen.conceptIds.filter(id => focus.includes(id));
    if (matched.every(id => (counts.get(id) ?? 0) >= 2)) continue;
    for (const id of matched) counts.set(id, (counts.get(id) ?? 0) + 1);
    items.push({ questionVersionId: chosen.versionId, maxUnits: 500, conceptIds: [...matched],
      reason: matched.some(id => needsReview(report.concepts.find(concept => concept.conceptId === id)!)) ? 'review' : 'coverage' });
  }
  return { focusConceptIds: focus, items, unavailableConceptIds: focus.filter(id => !items.some(item => item.conceptIds.includes(id))) };
}
