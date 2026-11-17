export type SharedCodingRole = 'owner' | 'editor' | 'viewer' | 'interviewee';
export type SharedCodingLanguage = 'python' | 'cpp' | 'typescript' | 'java';
export type SharedCodingRoomMode = 'collaboration' | 'interview';
export type InterviewStage = 'lobby' | 'prompt' | 'workspace' | 'review';

export type SharedCodingRoomMember = {
  userId: string;
  displayName: string;
  role: SharedCodingRole;
};

export type SharedCodingRoom = {
  id: string;
  classId: string;
  title: string;
  language: SharedCodingLanguage;
  mode: SharedCodingRoomMode;
  interviewStage: InterviewStage;
  interviewPrompt: string | null;
  controlRevision: number;
  status: 'open' | 'closed';
  revision: number;
  source: string;
  members: SharedCodingRoomMember[];
};

export type SharedCodingRoomSummary = Pick<SharedCodingRoom, 'id' | 'classId' | 'title' | 'language' | 'mode' | 'status' | 'revision'>;

/** A bounded polling response. A false value never exposes room content. */
export type SharedCodingRoomUpdate = { changed: false; revision: number; controlRevision: number } | { changed: true; room: SharedCodingRoom };

export type CreateSharedCodingRoomInput = {
  roomId: string;
  classId: string;
  title: string;
  language: SharedCodingLanguage;
  source: string;
  mode?: SharedCodingRoomMode;
  interviewPrompt?: string;
};

export type SetInterviewStageInput = { roomId: string; expectedControlRevision: number; stage: InterviewStage; prompt?: string };
export type CloseSharedCodingRoomInput = { roomId: string; expectedControlRevision: number };
export type OpenSharedCodingRoomInput = { roomId: string; expectedControlRevision: number };

export type InviteSharedCodingRoomMemberInput = {
  roomId: string;
  userId: string;
  role: Exclude<SharedCodingRole, 'owner'>;
};

export type SaveSharedCodingRoomSnapshotInput = {
  roomId: string;
  expectedRevision: number;
  language: SharedCodingLanguage;
  source: string;
};
