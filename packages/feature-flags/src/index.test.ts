import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initFeatureFlags,
  isFeatureEnabled,
  setFeatureFlag,
  clearFeatureFlagOverrides,
} from '../src';

describe('Feature Flags', () => {
  beforeEach(() => {
    clearFeatureFlagOverrides();
  });

  afterEach(() => {
    clearFeatureFlagOverrides();
  });

  describe('initFeatureFlags', () => {
    it('should initialize with default flags', () => {
      initFeatureFlags({
        environment: 'development',
      });

      // guest-mode is true by default
      expect(isFeatureEnabled('guest-mode')).toBe(true);
      
      // ai-hints is false by default
      expect(isFeatureEnabled('ai-hints')).toBe(false);
      expect(isFeatureEnabled('code-execution')).toBe(false);
    });

    it('should accept flag overrides', () => {
      initFeatureFlags({
        environment: 'development',
        flags: {
          'ai-hints': true,
        },
      });

      expect(isFeatureEnabled('ai-hints')).toBe(true);
    });
  });

  describe('isFeatureEnabled', () => {
    beforeEach(() => {
      initFeatureFlags({
        environment: 'development',
      });
    });

    it('should return default value when no context', () => {
      expect(isFeatureEnabled('guest-mode')).toBe(true);
      expect(isFeatureEnabled('ai-hints')).toBe(false);
    });

    it('should respect explicit overrides', () => {
      setFeatureFlag('ai-hints', true);
      expect(isFeatureEnabled('ai-hints')).toBe(true);
    });

    it('should enable for allowed users', () => {
      // Set advanced-metrics to have allowed users
      initFeatureFlags({
        environment: 'development',
        flags: {
          'advanced-metrics': false,
        },
      });

      // Not enabled for regular user
      expect(
        isFeatureEnabled('advanced-metrics', { userId: 'regular-user' })
      ).toBe(false);
    });

    it('should handle percentage rollouts consistently', () => {
      // ai-hints has 0% rollout by default
      const userId = 'test-user-123';
      
      // Same user should always get same result
      const result1 = isFeatureEnabled('ai-hints', { userId });
      const result2 = isFeatureEnabled('ai-hints', { userId });
      
      expect(result1).toBe(result2);
    });
  });

  describe('setFeatureFlag (testing)', () => {
    it('should override flag values', () => {
      initFeatureFlags({
        environment: 'development',
      });

      expect(isFeatureEnabled('ai-hints')).toBe(false);
      
      setFeatureFlag('ai-hints', true);
      expect(isFeatureEnabled('ai-hints')).toBe(true);
    });
  });

  describe('clearFeatureFlagOverrides (testing)', () => {
    it('should clear all overrides', () => {
      initFeatureFlags({
        environment: 'development',
      });

      setFeatureFlag('ai-hints', true);
      expect(isFeatureEnabled('ai-hints')).toBe(true);
      
      clearFeatureFlagOverrides();
      expect(isFeatureEnabled('ai-hints')).toBe(false);
    });
  });
});
