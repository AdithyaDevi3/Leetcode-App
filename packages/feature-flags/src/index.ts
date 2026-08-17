import { FEATURE_FLAGS, type FeatureFlag, type FeatureFlagContext } from './flags';

let flagOverrides: Record<string, boolean> = {};
let environment: string = 'development';

/**
 * Initialize the feature flag system
 */
export function initFeatureFlags(config: {
  environment: string;
  flags?: Record<string, boolean>;
}): void {
  environment = config.environment;
  
  // Load overrides from environment variables
  const envOverrides: Record<string, boolean> = {};
  for (const flag of Object.keys(FEATURE_FLAGS)) {
    const envKey = `FEATURE_FLAG_${flag.toUpperCase().replace(/-/g, '_')}`;
    const envValue = process.env[envKey];
    if (envValue !== undefined) {
      envOverrides[flag] = envValue === 'true';
    }
  }
  
  // Merge provided flags with env overrides (env takes precedence)
  flagOverrides = {
    ...(config.flags || {}),
    ...envOverrides,
  };
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(
  flag: FeatureFlag,
  context?: FeatureFlagContext
): boolean {
  // 1. Check explicit override
  if (flag in flagOverrides) {
    return flagOverrides[flag];
  }
  
  const flagConfig = FEATURE_FLAGS[flag];
  
  // 2. Check if user is in allowed list
  if (context?.userId && flagConfig.allowedUsers?.includes(context.userId)) {
    return true;
  }
  
  // 3. Check percentage rollout (consistent hashing)
  if (context?.userId && flagConfig.rolloutPercentage !== undefined) {
    const hashValue = simpleHash(context.userId + flag);
    const userPercentile = hashValue % 100;
    if (userPercentile < flagConfig.rolloutPercentage) {
      return true;
    }
  }
  
  // 4. Fall back to default
  return flagConfig.defaultValue;
}

/**
 * Get the full configuration for a feature flag
 */
export function getFeatureFlag(flag: FeatureFlag) {
  return FEATURE_FLAGS[flag];
}

/**
 * Set a feature flag override (for testing)
 */
export function setFeatureFlag(flag: FeatureFlag, value: boolean): void {
  flagOverrides[flag] = value;
}

/**
 * Clear all feature flag overrides (for testing)
 */
export function clearFeatureFlagOverrides(): void {
  flagOverrides = {};
}

/**
 * Simple hash function for consistent user assignment
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
