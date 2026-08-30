/**
 * User and Identity Domain Models
 *
 * Covers authenticated users, guest identities, and user preferences.
 */

/**
 * Authentication provider types
 */
export type AuthProvider = 'email' | 'google' | 'github';

/**
 * User account states
 */
export type UserStatus = 'active' | 'suspended' | 'deleted';

/** Roles persisted by the current PostgreSQL user table. */
export type UserRole = 'guest' | 'learner' | 'instructor' | 'admin';

/**
 * Authenticated user entity
 */
export interface User {
  /** Unique user identifier */
  id: string;

  /** Email address (unique, required for auth) */
  email: string;

  /** Display name */
  name: string;

  /**
   * Display name stored by the PostgreSQL adapter. `name` remains the
   * application-facing field while the adapter is migrated to a single name.
   */
  displayName?: string;

  /** Authorization role stored by the PostgreSQL adapter. */
  role?: UserRole;

  /** Profile picture URL (optional) */
  avatarUrl?: string;

  /** Authentication provider */
  provider: AuthProvider;

  /** External provider user ID */
  providerUserId: string;

  /** Account status */
  status: UserStatus;

  /** Email verification status */
  emailVerified: boolean;

  /** Account creation timestamp (UTC) */
  createdAt: Date;

  /** Last updated timestamp (UTC) */
  updatedAt: Date;

  /** Last login timestamp (UTC) */
  lastLoginAt?: Date;

  /** Optimistic concurrency version */
  version: number;
}

/**
 * Guest identity for anonymous users
 *
 * Guests can practice without an account. Their data is tied to a
 * browser fingerprint and can be merged when they create an account.
 */
export interface GuestIdentity {
  /** Unique guest identifier */
  id: string;

  /** Browser fingerprint or device ID */
  fingerprint: string;

  /** Legacy/persisted PostgreSQL column aliases. */
  deviceFingerprint?: string;
  sessionToken?: string;
  expiresAt?: Date;
  upgradedToUserId?: string;

  /** Creation timestamp (UTC) */
  createdAt: Date;

  /** Last activity timestamp (UTC) */
  lastActiveAt: Date;

  /** Associated user ID after upgrade (if merged) */
  userId?: string;

  /** Merge timestamp (UTC, if upgraded to user account) */
  mergedAt?: Date;
}

/**
 * Theme preferences
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * Language preferences for content and code
 */
export type ContentLanguage = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh';
export type CodeLanguage = 'typescript' | 'python' | 'java' | 'cpp' | 'javascript';

/**
 * Difficulty preference for content recommendations
 */
export type DifficultyPreference = 'beginner' | 'intermediate' | 'advanced' | 'mixed';

/**
 * User preferences for personalization
 */
export interface UserPreference {
  /** User or guest identifier */
  userId: string;

  /** UI theme preference */
  theme: Theme;

  /** Content display language */
  contentLanguage: ContentLanguage;

  /** Legacy/persisted PostgreSQL column alias. */
  language?: ContentLanguage;

  /** Preferred coding language */
  preferredCodeLanguage: CodeLanguage;

  /** Difficulty preference for recommendations */
  difficultyPreference: DifficultyPreference;

  /** Enable AI hints */
  enableAiHints: boolean;

  /** Enable AI explanations */
  enableAiExplanations: boolean;

  /** Enable email notifications */
  emailNotifications: boolean;

  /** Enable push notifications */
  pushNotifications: boolean;

  /** Show keyboard shortcuts */
  showKeyboardShortcuts: boolean;

  /** Auto-save interval in seconds */
  autoSaveInterval: number;

  /** Creation timestamp (UTC) */
  createdAt: Date;

  /** Last updated timestamp (UTC) */
  updatedAt: Date;

  /** Optimistic concurrency version */
  version: number;
}

/**
 * Helper type for creating a new user
 */
export type CreateUserInput = Omit<
  User,
  'id' | 'createdAt' | 'updatedAt' | 'lastLoginAt' | 'version'
>;

/**
 * Helper type for updating a user
 */
export type UpdateUserInput = Partial<
  Pick<User, 'name' | 'avatarUrl' | 'emailVerified' | 'lastLoginAt'>
> & {
  id: string;
  version: number;
};

/**
 * Helper type for creating a guest identity
 */
export type CreateGuestInput = Pick<GuestIdentity, 'fingerprint'>;

/**
 * Helper type for creating user preferences with defaults
 */
export type CreateUserPreferenceInput = Partial<
  Omit<UserPreference, 'userId' | 'createdAt' | 'updatedAt' | 'version'>
> & {
  userId: string;
};

/**
 * Default user preferences
 */
export const DEFAULT_USER_PREFERENCES: Omit<
  UserPreference,
  'userId' | 'createdAt' | 'updatedAt' | 'version'
> = {
  theme: 'system',
  contentLanguage: 'en',
  preferredCodeLanguage: 'typescript',
  difficultyPreference: 'mixed',
  enableAiHints: false,
  enableAiExplanations: false,
  emailNotifications: true,
  pushNotifications: false,
  showKeyboardShortcuts: true,
  autoSaveInterval: 30,
};
