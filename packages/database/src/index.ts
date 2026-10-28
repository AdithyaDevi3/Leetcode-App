// Client
export { DatabaseClient, createDatabaseClient, databaseConfigFromEnv } from './client.js';
export { PostgresLearningEvidenceRepository, LearningEvidenceAccessError, LearningEvidenceConflictError, LearningEvidenceValidationError } from './repositories/learning-evidence.repository.js';
export type { LearningReviewReceipt } from './repositories/learning-evidence.repository.js';
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

// Administration repository
export {
  AdministrationUserNotFoundError,
  AdministratorAlreadyExistsError,
  LastAdministratorError,
  PostgresAdministrationRepository,
} from './repositories/administration.repository.js';
export type {
  AdministrationAppeal,
  AdministrationAuditEvent,
  AdministrationContentItem,
  AdministrationFeedback,
  AdministrationOperations,
  AdministrationOverview,
  AdministrationPrivacyRequest,
  AdministrationUser,
} from './repositories/administration.repository.js';

// Gradebook persistence
export { ASSIGNMENT_VERIFIER_VERSION, PostgresGradebookRepository, GradebookAccessError, GradebookConflictError, GradebookRateLimitError } from './repositories/gradebook.repository.js';
export type { GradebookPrincipal, AssignmentResponse, StoredGradebookAttempt, StoredGradebookGrade, StoredGradebookPublication, StoredGradebookApplicability, GradebookDisputeStatus, StoredGradebookDisputeEvent, GradebookRecipientHistory, ManualReviewStatus, ManualReviewInboxItem, ManualReviewInboxPage, GradeDisputeInboxItem, ClassGradebookCell, ClassGradebookLearner, ClassGradebook, LearnerClassGradeAssignment, LearnerClassGrades } from './repositories/gradebook.repository.js';
export { PostgresGradebookVerificationRepository } from './repositories/gradebook-verification.repository.js';
export type { GradebookVerificationJob, GradebookVerificationQueueMetrics, GradebookVerificationSummary } from './repositories/gradebook-verification.repository.js';
export { PostgresQuizAssignmentRepository, QuizAssignmentAccessError, QuizAssignmentConflictError, QuizAssignmentValidationError } from './repositories/quiz-assignment.repository.js';
export type { QuizAnswers, QuizAssignmentPrincipal, QuizAudience, StoredQuizPublication, QuizAuthorDraft, QuizAnswerDraft, QuizAnswerSave, QuizSubmissionReceipt, LearnerQuizAssignment, InstructorQuizAssignment } from './repositories/quiz-assignment.repository.js';

// Classroom repository
export { PostgresAssessmentDraftRepository, AssessmentDraftAccessError, AssessmentDraftConflictError, AssessmentDraftValidationError } from './repositories/assessment-draft.repository.js';
export type { AssessmentDraftPrincipal, AssessmentDraftQuestion, AssessmentDraftInput, StoredAssessmentDraft } from './repositories/assessment-draft.repository.js';

export {
  ClassCodeNotFoundError,
  ClassroomNotFoundError,
  DuplicateClassAssignmentError,
  InvalidClassActivityError,
  PostgresClassroomRepository,
  generateClassCode,
} from './repositories/classroom.repository.js';
export type {
  ClassAssignment,
  ClassLearner,
  ClassroomDetail,
  ClassroomSummary,
  StudentAssignment,
  StudentClassroom,
} from './repositories/classroom.repository.js';
