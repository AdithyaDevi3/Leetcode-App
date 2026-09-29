import type { PostgresGradebookRepository as GradebookRepository, GradebookPrincipal } from './repositories/gradebook.repository.js';
import type { DatabaseClient } from './client.js';

export type { DatabaseClient, DatabaseConfig } from './client.js';
export { createDatabaseClient, databaseConfigFromEnv } from './client.js';

export { ASSIGNMENT_VERIFIER_VERSION, GradebookAccessError, GradebookConflictError, GradebookRateLimitError } from './repositories/gradebook.repository.js';
export type { GradebookPrincipal, AssignmentResponse, StoredGradebookAttempt, StoredGradebookGrade, StoredGradebookPublication, StoredGradebookApplicability, GradebookRecipientHistory, ManualReviewStatus, ManualReviewInboxItem, ManualReviewInboxPage, ClassGradebookCell, ClassGradebookLearner, ClassGradebook, LearnerClassGradeAssignment, LearnerClassGrades } from './repositories/gradebook.repository.js';
export { PostgresGradebookVerificationRepository } from './repositories/gradebook-verification.repository.js';
export type { GradebookVerificationJob, GradebookVerificationSummary } from './repositories/gradebook-verification.repository.js';

export class PostgresGradebookRepository {
  constructor(db: DatabaseClient, principal: GradebookPrincipal);
  publishPolicy: GradebookRepository['publishPolicy'];
  submitAttempt: GradebookRepository['submitAttempt'];
  appendGrade: GradebookRepository['appendGrade'];
  publishGrade: GradebookRepository['publishGrade'];
  setRecipientApplicability: GradebookRepository['setRecipientApplicability'];
  readRecipient: GradebookRepository['readRecipient'];
  readClassGradebook: GradebookRepository['readClassGradebook'];
  readLearnerClassGrades: GradebookRepository['readLearnerClassGrades'];
  listManualReviewInbox: GradebookRepository['listManualReviewInbox'];
}

export class LastAdministratorError extends Error {}
export class AdministratorAlreadyExistsError extends Error {}
export class AdministrationUserNotFoundError extends Error {}
export class ClassCodeNotFoundError extends Error {}
export class ClassroomNotFoundError extends Error {}
export class DuplicateClassAssignmentError extends Error {}
export class InvalidClassActivityError extends Error {}

export function generateClassCode(): string;

export interface ClassroomSummary {
  id: string;
  name: string;
  description: string;
  joinCode: string;
  createdAt: string;
  learnerCount: number;
  assignmentCount: number;
}

export interface ClassAssignment {
  id: string;
  classId: string;
  title: string;
  instructions: string;
  activitySlug: string;
  dueOn: string | null;
  createdAt: string;
  completedCount: number;
}

export interface ClassLearner {
  id: string;
  displayName: string;
  email: string | null;
  joinedAt: string;
  completedCount: number;
}

export interface ClassroomDetail {
  classroom: ClassroomSummary;
  assignments: ClassAssignment[];
  learners: ClassLearner[];
}

export interface StudentClassroom {
  id: string;
  name: string;
  description: string;
  joinedAt: string;
  assignmentCount: number;
  completedCount: number;
}

export interface StudentAssignment {
  id: string;
  classId: string;
  className: string;
  title: string;
  instructions: string;
  activitySlug: string;
  dueOn: string | null;
  completed: boolean;
  recipientId: string | null;
  policyVersionId: string | null;
}

export class PostgresClassroomRepository {
  constructor(db: DatabaseClient, ownerId?: string);
  createClass(input: {
    name: string; description: string; actorId: string; reason: string; requestId?: string | null;
  }): Promise<ClassroomSummary>;
  listClasses(): Promise<ClassroomSummary[]>;
  getClassDetail(classId: string): Promise<ClassroomDetail>;
  createAssignment(input: {
    classId: string; contentId: string; title: string; instructions: string;
    dueOn: string | null; actorId: string; reason: string; requestId?: string | null; publishDefaultGradePolicy?: boolean;
  }): Promise<string>;
  joinClassByCode(input: { userId: string; code: string }): Promise<{ id: string; name: string; alreadyJoined: boolean }>;
  listStudentClasses(userId: string): Promise<StudentClassroom[]>;
  listStudentAssignments(userId: string): Promise<StudentAssignment[]>;
}

export interface AdministrationOverview {
  users: number;
  usersThisWeek: number;
  activePracticeSessions: number;
  openFeedback: number;
  pendingAppeals: number;
  queuedEvaluations: number;
  queuedExecutions: number;
  pendingPrivacyRequests: number;
}

export interface AdministrationUser {
  id: string;
  email: string | null;
  displayName: string;
  createdAt: string;
  roles: import('@leetcode-app/domain').AdministrationRole[];
}

export interface AdministrationFeedback {
  id: string;
  type: 'question' | 'feature';
  title: string;
  status: 'submitted' | 'triaged' | 'accepted' | 'rejected' | 'completed';
  submittedBy: string;
  createdAt: string;
}

export interface AdministrationAppeal {
  id: string;
  findingId: string;
  status: 'submitted' | 'in_review' | 'resolved';
  submittedBy: string;
  createdAt: string;
}

export interface AdministrationContentItem {
  id: string;
  slug: string;
  type: 'lesson' | 'problem' | 'module';
  status: 'draft' | 'published' | 'archived';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  title: string;
  version: number | null;
  updatedAt: string;
}

export interface AdministrationPrivacyRequest {
  id: string;
  type: 'export' | 'deletion';
  status: 'requested' | 'processing' | 'completed' | 'rejected';
  submittedBy: string;
  requestedAt: string;
}

export interface AdministrationAuditEvent {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  requestId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdministrationOperations {
  evaluations: Record<string, number>;
  executions: Record<string, number>;
  oldestEvaluationQueuedAt: string | null;
  oldestExecutionQueuedAt: string | null;
}

export class PostgresAdministrationRepository {
  constructor(db: DatabaseClient);
  listActiveRoles(userId: string, queryable?: unknown): Promise<import('@leetcode-app/domain').AdministrationRole[]>;
  getOverview(queryable?: unknown): Promise<AdministrationOverview>;
  listUsers(limit?: number, queryable?: unknown): Promise<AdministrationUser[]>;
  listFeedback(limit?: number, queryable?: unknown): Promise<AdministrationFeedback[]>;
  listAppeals(limit?: number, queryable?: unknown): Promise<AdministrationAppeal[]>;
  listContent(limit?: number, queryable?: unknown): Promise<AdministrationContentItem[]>;
  listPrivacyRequests(limit?: number, queryable?: unknown): Promise<AdministrationPrivacyRequest[]>;
  getOperations(queryable?: unknown): Promise<AdministrationOperations>;
  listAuditEvents(limit?: number, queryable?: unknown): Promise<AdministrationAuditEvent[]>;
  replaceRoles(input: {
    actorId: string;
    targetUserId: string;
    roles: import('@leetcode-app/domain').AdministrationRole[];
    reason: string;
    requestId?: string | null;
  }): Promise<import('@leetcode-app/domain').AdministrationRole[]>;
  bootstrapFirstAdministrator(input: { email: string; reason: string }): Promise<{ userId: string }>;
}

export class PostgresUserRepository {
  constructor(db: DatabaseClient);
  findById(id: string): Promise<any | null>;
  findByEmail(email: string): Promise<any | null>;
  create(user: any): Promise<any>;
  update(...args: any[]): Promise<any>;
  delete(...args: any[]): Promise<void>;
  upgradeGuestToUser(guestId: string, userId: string): Promise<void>;
}

export class PostgresGuestIdentityRepository {
  constructor(db: DatabaseClient);
  findById(id: string): Promise<any | null>;
  findBySessionToken(token: string): Promise<any | null>;
  create(guest: any): Promise<any>;
  upgradeToUser(guestId: string, userId: string): Promise<void>;
}
