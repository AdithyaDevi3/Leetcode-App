import type { AssessmentDraftSeed } from './assessment-draft-form';
import type { ClassFollowUpSuggestion } from './class-insights-api-types';

/** Learner-visible instructions contain practice goals, never class performance data. */
export function classFollowUpDraftSeed(suggestion: ClassFollowUpSuggestion, key: string): AssessmentDraftSeed {
  const focus = suggestion.focusConceptIds.map(id => id.replaceAll('-', ' ')).join(', ');
  return { key, title: 'Concept practice quiz',
    instructions: `Practice ${focus}. Choose the best answer to each question and review the reasoning behind your choices.`,
    questions: suggestion.questions.map(question => ({ questionVersionId: question.versionId, maxUnits: 500 })),
  };
}
