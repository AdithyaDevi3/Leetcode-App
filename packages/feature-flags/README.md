# @leetcode-app/feature-flags

Feature flag management package for Leetcode App.

## Features

- **Simple API:** Check feature flags with minimal code
- **Type-safe:** TypeScript definitions for all flags
- **User Targeting:** Enable features for specific users or groups
- **Percentage Rollouts:** Gradual feature rollouts
- **Environment Support:** Different flags per environment
- **Local Override:** Override flags in development

## Installation

This package is part of the monorepo workspace:

```bash
npm install
```

## Usage

### Initialize Feature Flags

```typescript
import { initFeatureFlags, isFeatureEnabled } from '@leetcode-app/feature-flags';

// Initialize at app startup
initFeatureFlags({
  environment: 'production',
  // Optional: Provide custom config or fetch from remote service
  flags: {
    'ai-hints': true,
    'guest-mode': true,
    'advanced-metrics': false,
  },
});
```

### Check Feature Flags

```typescript
import { isFeatureEnabled } from '@leetcode-app/feature-flags';

// Simple boolean check
if (isFeatureEnabled('ai-hints')) {
  // Show AI-powered hints
}

// With user context
if (isFeatureEnabled('advanced-metrics', { userId: '123' })) {
  // Show advanced metrics for this user
}
```

### Feature Flag Registry

All feature flags are defined in a central registry:

```typescript
export const FEATURE_FLAGS = {
  // Phase 1: Core Features
  'guest-mode': {
    description: 'Allow guest users without authentication',
    defaultValue: true,
  },
  'practice-mode': {
    description: 'Practice mode with evaluator',
    defaultValue: true,
  },
  
  // Phase 2: AI Features
  'ai-hints': {
    description: 'AI-powered hints during practice',
    defaultValue: false,
    rolloutPercentage: 10, // 10% of users
  },
  'ai-explanations': {
    description: 'AI-generated solution explanations',
    defaultValue: false,
  },
  
  // Phase 3: Social Features
  'leaderboards': {
    description: 'Global and friend leaderboards',
    defaultValue: false,
  },
  
  // Phase 4: Advanced Features
  'advanced-metrics': {
    description: 'Detailed performance analytics',
    defaultValue: false,
    allowedUsers: ['admin-123'],  // Admin-only initially
  },
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
```

### User Targeting

Enable features for specific users or cohorts:

```typescript
import { isFeatureEnabled } from '@leetcode-app/feature-flags';

// Check with user context
const canUseFeature = isFeatureEnabled('ai-hints', {
  userId: user.id,
  userTier: user.tier,  // e.g., 'free', 'premium'
  betaUser: user.betaOptIn,
});
```

### Percentage Rollouts

Gradually roll out features to a percentage of users:

```typescript
// In feature flag config
{
  'ai-hints': {
    rolloutPercentage: 25,  // 25% of users
  }
}

// The SDK uses consistent hashing (userId + flag name) to assign users
// Same user always gets same result for same flag
```

### Environment Overrides

Different defaults per environment:

```typescript
initFeatureFlags({
  environment: 'development',
  flags: {
    'ai-hints': true,          // Always on in dev
    'leaderboards': true,      // Always on in dev
    'advanced-metrics': true,  // Always on in dev
  },
});
```

### Local Development Override

Override flags locally via environment variables:

```bash
# .env.local
FEATURE_FLAG_AI_HINTS=true
FEATURE_FLAG_LEADERBOARDS=true
```

```typescript
// Automatically loaded from env vars
const aiHintsEnabled = process.env.FEATURE_FLAG_AI_HINTS === 'true' || 
                       isFeatureEnabled('ai-hints');
```

## Architecture

### Storage Options

1. **Static Config (Phase 0-2):** Flags defined in code
2. **Database (Phase 3+):** Flags stored in PostgreSQL
3. **Remote Service (Future):** LaunchDarkly, Split.io, etc.

### Decision Flow

```
1. Check environment variable override
2. Check user-specific overrides
3. Check percentage rollout (hash-based)
4. Fall back to default value
```

## Best Practices

### Naming Conventions

- Use kebab-case: `ai-hints`, `guest-mode`
- Be descriptive: `advanced-metrics` not `new-feature`
- Prefix by category: `ai-hints`, `ai-explanations`

### Cleanup

- Remove flags after full rollout (don't accumulate technical debt)
- Document when each flag was added and target removal date
- Use TODO comments: `// TODO: Remove after Phase 3`

### Testing

```typescript
import { vi } from 'vitest';
import { setFeatureFlag } from '@leetcode-app/feature-flags';

it('shows AI hints when flag enabled', () => {
  setFeatureFlag('ai-hints', true);
  
  const result = renderComponent();
  
  expect(result.getByText('AI Hint')).toBeInTheDocument();
});
```

## Migration Path

### Phase 0-1: Static Config

```typescript
// Hardcoded in code
const FLAGS = {
  'guest-mode': true,
};
```

### Phase 2: Environment-based

```typescript
// Load from environment variables
const FLAGS = {
  'guest-mode': process.env.GUEST_MODE_ENABLED === 'true',
};
```

### Phase 3: Database-backed

```typescript
// Fetch from PostgreSQL on app startup
const flags = await fetchFlagsFromDatabase();
```

### Phase 4+: Remote Service

```typescript
// Integrate with LaunchDarkly or similar
import { LDClient } from 'launchdarkly-node-server-sdk';
```

## API Reference

### `initFeatureFlags(config)`

Initialize the feature flag system.

```typescript
initFeatureFlags({
  environment: 'production',
  flags: Record<string, boolean | FlagConfig>,
});
```

### `isFeatureEnabled(flag, context?)`

Check if a feature is enabled.

```typescript
isFeatureEnabled(flag: FeatureFlag, context?: {
  userId?: string;
  userTier?: string;
  betaUser?: boolean;
}): boolean
```

### `getFeatureFlag(flag)`

Get the full configuration for a feature flag.

```typescript
getFeatureFlag(flag: FeatureFlag): FlagConfig
```

### `setFeatureFlag(flag, value)` (Test Only)

Override a feature flag (test helper).

```typescript
setFeatureFlag(flag: FeatureFlag, value: boolean): void
```

## Resources

- [ADR-005: AI Integration](../../docs/adr/005-ai-integration.md) (feature flag strategy)
- [Feature Flag Best Practices](https://martinfowler.com/articles/feature-toggles.html)
- [LaunchDarkly](https://launchdarkly.com/)
- [Split.io](https://www.split.io/)
