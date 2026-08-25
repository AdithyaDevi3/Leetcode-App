/**
 * Practice Session Domain Models
 *
 * Covers practice sessions, attempts, and pseudocode revisions.
 */

/**
 * Session stage in the learning flow
 */
export type SessionStage =
  | 'lesson' // Reading the lesson
  | 'pseudocode' // Writing pseudocode
  | 'evaluation' // Evaluating pseudocode
  | 'coding' // Writing actual code
  | 'completed'; // Session finished

/**
 * Session completion status
 */
export type CompletionStatus =
  | 'in-progress'
  | 'pseudocode-only' // Completed pseudocode, skipped coding
  | 'coding-unlocked' // Passed evaluation, unlocked coding
  | 'fully-completed'; // Completed coding phase

/**
 * Practice session
 *
 * A session represents a user's journey through a content item.
 * Sessions can be paused and resumed across devices.
 */
export interface PracticeSession {
  /** Unique session identifier */
  id: string;

  /** User or guest identifier */
  userId: string;

  /** Content item being practiced */
  contentItemId: string;

  /** Content version being practiced */
  contentVersionId: string;

  /** Current stage in the session */
  stage: SessionStage;

  /** Completion status */
  completionStatus: CompletionStatus;

  /** Chosen coding language for this session */
  codingLanguage: string;

  /** Session start timestamp (UTC) */
  startedAt: Date;

  /** Last activity timestamp (UTC) */
  lastActivityAt: Date;

  /** Completion timestamp (UTC) */
  completedAt?: Date;

  /** Total time spent in seconds */
  totalTimeSeconds: number;

  /** Optimistic concurrency version */
  version: number;
}

/**
 * Attempt on a practice session
 *
 * Each evaluation creates a new attempt. Attempts are immutable once created.
 */
export interface Attempt {
  /** Unique attempt identifier */
  id: string;

  /** Parent practice session ID */
  practiceSessionId: string;

  /** Attempt number within the session (1-based) */
  attemptNumber: number;

  /** Rubric version used for this attempt */
  rubricVersionId: string;

  /** Final pseudocode revision ID */
  finalRevisionId: string;

  /** Whether this attempt passed */
  passed: boolean;

  /** Score achieved (0-100) */
  score: number;

  /** Whether coding was unlocked after this attempt */
  unlockedCoding: boolean;

  /** Attempt creation timestamp (UTC) */
  createdAt: Date;
}

/**
 * Pseudocode edit mode
 */
export type EditMode = 'text' | 'blocks';

/**
 * Pseudocode revision
 *
 * Revisions are append-only. Each save creates a new revision for full history.
 */
export interface PseudocodeRevision {
  /** Unique revision identifier */
  id: string;

  /** Parent practice session ID */
  practiceSessionId: string;

  /** Revision number (1-based, incremental) */
  revisionNumber: number;

  /** Edit mode used */
  editMode: EditMode;

  /** Pseudocode content (text or JSON for blocks) */
  content: string;

  /** Idempotency key for deduplication */
  idempotencyKey: string;

  /** Whether this revision was auto-saved */
  isAutoSave: boolean;

  /** Revision creation timestamp (UTC) */
  createdAt: Date;
}

/**
 * Helper type for creating a practice session
 */
export type CreatePracticeSessionInput = Omit<
  PracticeSession,
  'id' | 'startedAt' | 'lastActivityAt' | 'completedAt' | 'totalTimeSeconds' | 'version'
> & {
  codingLanguage: string;
};

/**
 * Helper type for updating a practice session
 */
export type UpdatePracticeSessionInput = Partial<
  Pick<
    PracticeSession,
    | 'stage'
    | 'completionStatus'
    | 'lastActivityAt'
    | 'completedAt'
    | 'totalTimeSeconds'
  >
> & {
  id: string;
  version: number;
};

/**
 * Helper type for creating an attempt
 */
export type CreateAttemptInput = Omit<Attempt, 'id' | 'createdAt'>;

/**
 * Helper type for creating a pseudocode revision
 */
export type CreatePseudocodeRevisionInput = Omit<
  PseudocodeRevision,
  'id' | 'revisionNumber' | 'createdAt'
>;

/**
 * Resume state for a practice session
 *
 * Packages all data needed to restore a session on another device.
 */
export interface SessionResumeState {
  session: PracticeSession;
  latestRevision?: PseudocodeRevision;
  attempts: Attempt[];
}
