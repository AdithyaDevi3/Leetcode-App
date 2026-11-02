import type { LearnerQuestion } from '@leetcode-app/domain';

export type TemplateWorkspace = 'teach' | 'admin';
export type TemplateStatus = 'active' | 'archived';
export type TemplateContent = { title: string; instructions: string; questions: { questionVersionId: string; maxUnits: number }[] };
export type TemplateSummary = {
  id: string; revision: number; status: TemplateStatus; currentVersion: number;
  title: string; questionCount: number; maxUnits: number; updatedAt: string;
};
export type TemplateView = {
  id: string; revision: number; status: TemplateStatus; currentVersion: number; version: number;
  title: string; instructions: string; maxUnits: number;
  questions: { questionVersionId: string; maxUnits: number; question: LearnerQuestion | null }[];
  createdAt: string; updatedAt: string; versionCreatedAt: string;
};
export type TemplateLibraryResponse = { actorId: string; items: TemplateSummary[]; total: number; page: number; pageSize: 20 };
export type TemplateDetailResponse = { actorId: string; template: TemplateView; destinations: { id: string; name: string }[]; catalog: readonly LearnerQuestion[] };
export type TemplateMutationResponse = { actorId: string; template: TemplateView; currentRevision: number };
export type TemplateDraftResponse = { actorId: string; draftId: string; classId: string };
export type TemplateCreateCommand = { operation: 'create_from_draft'; sourceClassId: string; sourceDraftId: string; expectedRevision: number; requestKey: string };
export type TemplateUpdateCommand = { operation: 'update'; expectedRevision: number; requestKey: string; content: TemplateContent };
export type TemplateArchiveCommand = { operation: 'set_archived'; expectedRevision: number; requestKey: string; archived: boolean };
export type TemplateUseCommand = { version: number; expectedRevision: number; destinationClassId: string; requestKey: string };
