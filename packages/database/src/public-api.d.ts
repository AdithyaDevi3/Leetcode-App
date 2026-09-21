import type { Pool, PoolClient } from 'pg';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

export class DatabaseClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
  transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  getPool(): Pool;
}

export function createDatabaseClient(config: DatabaseConfig): DatabaseClient;
export function databaseConfigFromEnv(env?: NodeJS.ProcessEnv): DatabaseConfig;

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
}

export class PostgresClassroomRepository {
  constructor(db: DatabaseClient);
  createClass(input: {
    name: string; description: string; actorId: string; reason: string; requestId?: string | null;
  }): Promise<ClassroomSummary>;
  listClasses(): Promise<ClassroomSummary[]>;
  getClassDetail(classId: string): Promise<ClassroomDetail>;
  createAssignment(input: {
    classId: string; contentId: string; title: string; instructions: string;
    dueOn: string | null; actorId: string; reason: string; requestId?: string | null;
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
