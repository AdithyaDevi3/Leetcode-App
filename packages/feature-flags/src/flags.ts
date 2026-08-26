/**
 * Feature Flag Registry
 *
 * All feature flags should be defined here with:
 * - description: What the flag controls
 * - defaultValue: Default state (conservative: false for new features)
 * - rolloutPercentage: Optional percentage rollout (0-100)
 * - allowedUsers: Optional list of user IDs that always have access
 */
export const FEATURE_FLAGS = {
  // Phase 0-1: Foundation
  'guest-mode': {
    description: 'Allow guest users without authentication',
    defaultValue: true,
  },
  'practice-mode': {
    description: 'Practice mode with code evaluation',
    defaultValue: true,
  },

  // Phase 2: AI Features
  'ai-hints': {
    description: 'AI-powered hints during practice',
    defaultValue: false,
    rolloutPercentage: 0, // Start at 0%, increase gradually
  },
  'ai-explanations': {
    description: 'AI-generated solution explanations',
    defaultValue: false,
  },
  'ai-evaluation': {
    description: 'Enable provider-backed evaluation after deterministic checks',
    defaultValue: false,
    rolloutPercentage: 0,
  },

  // Phase 3: Gamification
  'leaderboards': {
    description: 'Global and friend leaderboards',
    defaultValue: false,
  },
  'achievements': {
    description: 'Achievement system',
    defaultValue: false,
  },

  // Phase 4: Social Features
  'friend-system': {
    description: 'Add and compete with friends',
    defaultValue: false,
  },
  'activity-feed': {
    description: 'Social activity feed',
    defaultValue: false,
  },

  // Advanced Features
  'advanced-metrics': {
    description: 'Detailed performance analytics',
    defaultValue: false,
    allowedUsers: [], // Admin only initially
  },
  'time-travel-debug': {
    description: 'Time-travel debugging for submissions',
    defaultValue: false,
    allowedUsers: [], // Internal team only
  },
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export interface FlagConfig {
  description: string;
  defaultValue: boolean;
  rolloutPercentage?: number;
  allowedUsers?: string[];
}

export interface FeatureFlagContext {
  userId?: string;
  userTier?: 'free' | 'premium';
  betaUser?: boolean;
}
