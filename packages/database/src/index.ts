// Client
export { DatabaseClient, createDatabaseClient, databaseConfigFromEnv } from './client.js';
export type { DatabaseConfig } from './client.js';

// Base repository types
export { Repository, OptimisticConcurrencyError, EntityNotFoundError } from './repositories/base.js';

// User repositories
export {
  PostgresUserRepository,
  PostgresGuestIdentityRepository,
} from './repositories/user.repository.js';
export type {
  UserRepository,
  GuestIdentityRepository,
} from './repositories/user.repository.js';

// Content repository
export { PostgresContentRepository } from './repositories/content.repository.js';
export type { ContentRepository } from './repositories/content.repository.js';

// Practice session repository
export { PostgresPracticeSessionRepository } from './repositories/practice-session.repository.js';
export type { PracticeSessionRepository } from './repositories/practice-session.repository.js';

// Evaluation repository
export { PostgresEvaluationRepository } from './repositories/evaluation.repository.js';
export type { EvaluationRepository } from './repositories/evaluation.repository.js';
