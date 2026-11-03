import type { ClassGradebookCell, StoredGradebookPublication } from './gradebook.repository.js';

export type GradeReleaseTarget = { recipientId: string; gradeRevisionId: string; expectedPublicationSequence: number };
export type ClassResultTarget = { recipientId: string; gradeRevisionId: string; publicationId: string; attemptId: string | null };
export type GradeReleaseAssignment = {
  id: string; title: string; kind: 'problem' | 'quiz' | 'written'; instructions: string; dueOn: string | null;
  closesAt: string | null; maxUnits: number; policyVersionId: string;
};
export type GradeReleaseQuestion = { id: string; title: string; prompt: string; options: { id: string; text: string }[]; maxUnits: number | null };
export type GradeReleaseContent = { prompt: string; questions: GradeReleaseQuestion[] };
export type GradeReleaseResponse = {
  attemptId: string; sequence: number; submittedAt: string; text: string | null; language: string | null;
  answers: Record<string, string | null>;
};
export type GradeReleaseRosterRow = {
  learner: { id: string; displayName: string; email: string | null }; membership: 'included' | 'withdrawn';
  recipientId: string | null; state: ClassGradebookCell['state']; earnedUnits: number | null; maxUnits: number;
  ready: boolean; reason: string | null; releaseTarget: GradeReleaseTarget | null; shareTarget: ClassResultTarget | null;
  response: GradeReleaseResponse | null;
};
export type ClassResultsSharingReceipt = {
  id: string; sequence: number; classId: string; assignmentId: string; shared: boolean;
  recipientCount: number; createdAt: string;
};
export type AssignmentGradeReleasePreview = {
  classroom: { id: string; name: string }; assignment: GradeReleaseAssignment; archived: boolean;
  content: GradeReleaseContent; roster: GradeReleaseRosterRow[]; sharing: ClassResultsSharingReceipt | null;
};
export type AssignmentGradeReleaseReceipt = {
  id: string; classId: string; assignmentId: string; actorId: string; createdAt: string;
  publications: { recipientId: string; publication: StoredGradebookPublication }[];
};
export type GradeReleaseResponseDetail = {
  classroom: { id: string; name: string }; assignment: GradeReleaseAssignment; content: GradeReleaseContent;
  learner: { id: string; displayName: string; email: string | null }; recipientId: string;
  response: GradeReleaseResponse | null; state: ClassGradebookCell['state'];
  grade: { id: string; earnedUnits: number; maxUnits: number; criterionScores: Record<string, number>; learnerFeedback: string;
    published: boolean; publicationSequence: number } | null;
  releaseTarget: GradeReleaseTarget | null;
};
export type SharedAssignmentResults = {
  classroom: { id: string; name: string }; assignment: GradeReleaseAssignment; content: GradeReleaseContent;
  sharing: ClassResultsSharingReceipt;
  learners: { learner: { id: string; displayName: string }; recipientId: string; earnedUnits: number; maxUnits: number;
    response: GradeReleaseResponse | null }[];
};
export type SharedClassAssignments = {
  classroom: { id: string; name: string };
  assignments: { id: string; title: string; kind: GradeReleaseAssignment['kind']; maxUnits: number; sharedAt: string; recipientCount: number }[];
};
export type SharedGradeResponseDetail = {
  classroom: { id: string; name: string }; assignment: GradeReleaseAssignment; content: GradeReleaseContent;
  sharing: ClassResultsSharingReceipt;
  learner: { id: string; displayName: string }; recipientId: string; response: GradeReleaseResponse | null;
  earnedUnits: number; maxUnits: number;
};
export type PublishAssignmentGradesInput = {
  classId: string; assignmentId: string; targets: readonly GradeReleaseTarget[]; requestKey: string; reason: string;
};
export type PublishClassResultsInput = {
  classId: string; assignmentId: string; targets: readonly ClassResultTarget[]; expectedSharingSequence: number; requestKey: string; reason: string;
};
export type RevokeClassResultsInput = {
  classId: string; assignmentId: string; expectedSharingSequence: number; requestKey: string; reason: string;
};
