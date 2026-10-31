import type { ClassInsightsReport, LearnerQuestion } from '@leetcode-app/domain';

export type ClassInsightsWorkspace = 'teach' | 'admin';
export type ClassFollowUpSuggestion = {
  focusConceptIds: string[];
  questions: readonly LearnerQuestion[];
  reason: string;
  emptyReason: string | null;
  unavailableConceptIds: string[];
};
export type ClassInsightsResponse = { actorId: string; report: ClassInsightsReport; suggestion: ClassFollowUpSuggestion };
