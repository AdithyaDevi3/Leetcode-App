import { freezeQuizQuestionSelection, type MultipleChoiceQuizSnapshot, type QuestionVersion } from './question-bank.js';

export const DIAGNOSTIC_SELECTION_VERSION = 'balanced-ten-v1';

/** A frozen baseline, drawn only from the separate, reviewed practice pool. */
export function buildDiagnosticSnapshot(questions: readonly QuestionVersion[], activityIds: readonly string[]): MultipleChoiceQuizSnapshot {
  if (activityIds.length !== 10 || new Set(activityIds).size !== 10) throw new Error('The diagnostic requires ten distinct activities.');
  const selected = activityIds.map(activityId => {
    const matches = questions.filter(question => question.status === 'reviewed' && question.activityIds.length === 1
      && question.activityIds[0] === activityId && question.difficulty !== 'advanced');
    if (matches.length !== 1) throw new Error('Each diagnostic activity requires exactly one reviewed baseline question.');
    return { question: matches[0], maxUnits: 100 };
  });
  return freezeQuizQuestionSelection(selected);
}
