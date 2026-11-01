import type { LearnerQuestion } from '@leetcode-app/domain';

export type AssessmentCopyCommand = {
  sourceClassId: string;
  destinationClassId: string;
  expectedRevision: number;
  requestKey: string;
};
export type AssessmentCopyPreview = {
  actorId: string;
  source: {
    id: string; classId: string; className: string; title: string; instructions: string; revision: number;
    questions: { questionVersionId: string; maxUnits: number; question: LearnerQuestion | null }[];
  };
  destinations: { id: string; name: string }[];
};
export type AssessmentCopyResult = { actorId: string; draftId: string; classId: string };
