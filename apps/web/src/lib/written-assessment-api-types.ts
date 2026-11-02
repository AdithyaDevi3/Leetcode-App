import type {
  WrittenAssessmentDraft, WrittenAssessmentDraftInput, WrittenAuthorView, WrittenPublication,
  LearnerWrittenAssignment, WrittenResponseDraft, WrittenSubmissionReceipt,
} from '@leetcode-app/database';

export type WrittenWorkspace = 'teach' | 'admin';
export type WrittenDraftCommand = { draftId: string | null; expectedRevision: number | null; requestKey: string; draft: WrittenAssessmentDraftInput };
export type WrittenPublishCommand = { expectedRevision: number; expectedRosterFingerprint: string; audience: { kind: 'class' | 'selected'; learnerIds: string[] }; requestKey: string };
export type WrittenSaveCommand = { expectedRevision: number; text: string; requestKey: string };
export type WrittenSubmitCommand = { expectedRevision: number; requestKey: string };
export type WrittenListResponse = { actorId: string; classId: string; drafts: WrittenAssessmentDraft[] };
export type WrittenDetailResponse = { actorId: string; author: WrittenAuthorView };
export type WrittenDraftResponse = { actorId: string; draft: WrittenAssessmentDraft; currentRevision: number };
export type WrittenPublishResponse = { actorId: string; publication: WrittenPublication };
export type WrittenLearnerResponse = { actorId: string; assignment: LearnerWrittenAssignment };
export type WrittenSaveResponse = { actorId: string; recipientId: string; responseDraft: WrittenResponseDraft; currentRevision: number };
export type WrittenSubmitResponse = { actorId: string; recipientId: string; submission: WrittenSubmissionReceipt };
