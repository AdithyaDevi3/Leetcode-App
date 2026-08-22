/**
 * Content Domain Models
 *
 * Covers learning content, versioning, and rubrics for evaluation.
 */

/**
 * Content types
 */
export type ContentType = 'lesson' | 'problem' | 'challenge' | 'quiz';

/**
 * Difficulty levels
 */
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

/**
 * Content status in the authoring workflow
 */
export type ContentStatus = 'draft' | 'review' | 'published' | 'archived';

/**
 * Algorithm categories
 */
export type AlgorithmCategory =
  | 'array'
  | 'string'
  | 'hash-table'
  | 'linked-list'
  | 'stack'
  | 'queue'
  | 'tree'
  | 'graph'
  | 'sorting'
  | 'searching'
  | 'dynamic-programming'
  | 'greedy'
  | 'backtracking'
  | 'divide-and-conquer'
  | 'bit-manipulation'
  | 'math'
  | 'two-pointers'
  | 'sliding-window'
  | 'recursion';

/**
 * Core content item metadata
 *
 * This is the stable entity. Content text and rubrics are versioned separately.
 */
export interface ContentItem {
  /** Unique content identifier */
  id: string;

  /** URL-friendly slug */
  slug: string;

  /** Content type */
  type: ContentType;

  /** Display title */
  title: string;

  /** Short description (shown in lists) */
  description: string;

  /** Difficulty level */
  difficulty: DifficultyLevel;

  /** Algorithm categories this content covers */
  categories: AlgorithmCategory[];

  /** Supported coding languages */
  supportedLanguages: string[];

  /** Current published version ID */
  currentVersionId?: string;

  /** Publishing status */
  status: ContentStatus;

  /** Author user ID */
  authorId: string;

  /** Estimated completion time in minutes */
  estimatedMinutes: number;

  /** Creation timestamp (UTC) */
  createdAt: Date;

  /** Last updated timestamp (UTC) */
  updatedAt: Date;

  /** Publication timestamp (UTC, when first published) */
  publishedAt?: Date;

  /** Optimistic concurrency version */
  version: number;
}

/**
 * Block types for structured content
 */
export type BlockType =
  | 'text'
  | 'code'
  | 'image'
  | 'video'
  | 'hint'
  | 'example'
  | 'definition'
  | 'note'
  | 'warning';

/**
 * Content block in a version
 */
export interface ContentBlock {
  /** Block identifier within the version */
  id: string;

  /** Block type */
  type: BlockType;

  /** Block content (Markdown or structured data) */
  content: string;

  /** Optional metadata for the block */
  metadata?: Record<string, unknown>;

  /** Display order */
  order: number;
}

/**
 * Versioned content
 *
 * Each published change creates a new version. Users see stable content
 * even as authors iterate.
 */
export interface ContentVersion {
  /** Unique version identifier */
  id: string;

  /** Parent content item ID */
  contentItemId: string;

  /** Version number (incremental) */
  versionNumber: number;

  /** Content blocks */
  blocks: ContentBlock[];

  /** Associated rubric version ID */
  rubricVersionId: string;

  /** Change summary */
  changeLog?: string;

  /** Author user ID for this version */
  authorId: string;

  /** Creation timestamp (UTC) */
  createdAt: Date;
}

/**
 * Rubric rule types
 */
export type RuleType =
  | 'contains-keyword'
  | 'matches-pattern'
  | 'structure-check'
  | 'complexity-check'
  | 'completeness-check'
  | 'logical-flow'
  | 'custom';

/**
 * Severity of a rubric rule violation
 */
export type RuleSeverity = 'error' | 'warning' | 'suggestion';

/**
 * Individual rubric rule
 */
export interface RubricRule {
  /** Rule identifier */
  id: string;

  /** Rule type */
  type: RuleType;

  /** Rule description */
  description: string;

  /** Rule severity */
  severity: RuleSeverity;

  /** Rule configuration (type-specific) */
  config: Record<string, unknown>;

  /** Points deducted for violation (if applicable) */
  pointsDeduction?: number;

  /** Display order */
  order: number;
}

/**
 * Versioned rubric for evaluation
 *
 * Rubrics are versioned separately so historical evaluations remain
 * consistent even when rubrics evolve.
 */
export interface RubricVersion {
  /** Unique rubric version identifier */
  id: string;

  /** Parent content item ID */
  contentItemId: string;

  /** Version number (incremental) */
  versionNumber: number;

  /** Rubric rules */
  rules: RubricRule[];

  /** Passing score threshold (0-100) */
  passingThreshold: number;

  /** Maximum possible score */
  maxScore: number;

  /** Change summary */
  changeLog?: string;

  /** Author user ID for this version */
  authorId: string;

  /** Creation timestamp (UTC) */
  createdAt: Date;
}

/**
 * Helper type for creating content
 */
export type CreateContentItemInput = Omit<
  ContentItem,
  'id' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'version' | 'currentVersionId'
>;

/**
 * Helper type for creating a content version
 */
export type CreateContentVersionInput = Omit<
  ContentVersion,
  'id' | 'versionNumber' | 'createdAt'
>;

/**
 * Helper type for creating a rubric version
 */
export type CreateRubricVersionInput = Omit<
  RubricVersion,
  'id' | 'versionNumber' | 'createdAt'
>;
