/**
 * Evaluation Domain Models
 *
 * Covers pseudocode evaluations and findings against rubrics.
 */

import { RuleType, RuleSeverity } from './content';

/**
 * Evaluation status
 */
export type EvaluationStatus =
  | 'pending' // Evaluation queued
  | 'running' // Evaluation in progress
  | 'completed' // Evaluation finished
  | 'failed'; // Evaluation encountered an error

/**
 * Evaluation
 *
 * Represents a full evaluation of pseudocode against a rubric.
 */
export interface Evaluation {
  /** Unique evaluation identifier */
  id: string;

  /** Practice session this evaluation belongs to */
  practiceSessionId: string;

  /** Attempt this evaluation is for */
  attemptId: string;

  /** Pseudocode revision being evaluated */
  revisionId: string;

  /** Rubric version applied */
  rubricVersionId: string;

  /** Evaluation status */
  status: EvaluationStatus;

  /** Whether the pseudocode passed */
  passed: boolean;

  /** Score achieved (0-100) */
  score: number;

  /** Total points earned */
  pointsEarned: number;

  /** Maximum points possible */
  maxPoints: number;

  /** Evaluation started timestamp (UTC) */
  startedAt: Date;

  /** Evaluation completed timestamp (UTC) */
  completedAt?: Date;

  /** Evaluation duration in milliseconds */
  durationMs?: number;

  /** Error message if evaluation failed */
  errorMessage?: string;

  /** Optimistic concurrency version */
  version: number;
}

/**
 * Finding severity
 *
 * Re-exported from content for consistency.
 */
export type FindingSeverity = RuleSeverity;

/**
 * Evaluation finding
 *
 * A finding represents a specific issue (or success) detected by a rubric rule.
 */
export interface EvaluationFinding {
  /** Unique finding identifier */
  id: string;

  /** Parent evaluation ID */
  evaluationId: string;

  /** Rubric rule that generated this finding */
  ruleId: string;

  /** Rule type */
  ruleType: RuleType;

  /** Finding severity */
  severity: FindingSeverity;

  /** Whether this rule passed */
  passed: boolean;

  /** User-facing message */
  message: string;

  /** Detailed explanation (optional) */
  explanation?: string;

  /** Line number in pseudocode (if applicable) */
  lineNumber?: number;

  /** Points deducted for this finding */
  pointsDeducted: number;

  /** Creation timestamp (UTC) */
  createdAt: Date;
}

/**
 * Helper type for creating an evaluation
 */
export type CreateEvaluationInput = Omit<
  Evaluation,
  | 'id'
  | 'status'
  | 'passed'
  | 'score'
  | 'pointsEarned'
  | 'startedAt'
  | 'completedAt'
  | 'durationMs'
  | 'errorMessage'
  | 'version'
>;

/**
 * Helper type for updating an evaluation
 */
export type UpdateEvaluationInput = Partial<
  Pick<
    Evaluation,
    | 'status'
    | 'passed'
    | 'score'
    | 'pointsEarned'
    | 'completedAt'
    | 'durationMs'
    | 'errorMessage'
  >
> & {
  id: string;
  version: number;
};

/**
 * Helper type for creating a finding
 */
export type CreateEvaluationFindingInput = Omit<EvaluationFinding, 'id' | 'createdAt'>;

/**
 * Evaluation summary for display
 */
export interface EvaluationSummary {
  evaluation: Evaluation;
  findings: EvaluationFinding[];
  passedCount: number;
  failedCount: number;
  errorCount: number;
  warningCount: number;
  suggestionCount: number;
}

/**
 * Evaluation statistics for a user
 */
export interface UserEvaluationStats {
  userId: string;
  totalEvaluations: number;
  passedEvaluations: number;
  failedEvaluations: number;
  averageScore: number;
  averageDurationMs: number;
  firstEvaluationAt?: Date;
  lastEvaluationAt?: Date;
}

/**
 * Re-export severity and rule type for convenience
 */
export { RuleType, RuleSeverity };
