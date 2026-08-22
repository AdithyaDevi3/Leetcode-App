import { describe, it, expect } from 'vitest';
import {
  User,
  GuestIdentity,
  UserPreference,
  DEFAULT_USER_PREFERENCES,
  CreateUserInput,
  UpdateUserInput,
  CreateGuestInput,
  CreateUserPreferenceInput,
} from './user';

describe('User Domain Types', () => {
  describe('User', () => {
    it('should create a valid user object', () => {
      const user: User = {
        id: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
        provider: 'email',
        providerUserId: 'provider_456',
        status: 'active',
        emailVerified: true,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        version: 1,
      };

      expect(user.id).toBe('user_123');
      expect(user.email).toBe('test@example.com');
      expect(user.status).toBe('active');
    });

    it('should support optional fields', () => {
      const user: User = {
        id: 'user_123',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        provider: 'google',
        providerUserId: 'google_789',
        status: 'active',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: new Date(),
        version: 1,
      };

      expect(user.avatarUrl).toBeDefined();
      expect(user.lastLoginAt).toBeDefined();
    });
  });

  describe('GuestIdentity', () => {
    it('should create a valid guest identity', () => {
      const guest: GuestIdentity = {
        id: 'guest_123',
        fingerprint: 'fp_abc123',
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };

      expect(guest.id).toBe('guest_123');
      expect(guest.fingerprint).toBe('fp_abc123');
      expect(guest.userId).toBeUndefined();
      expect(guest.mergedAt).toBeUndefined();
    });

    it('should support merged guest state', () => {
      const guest: GuestIdentity = {
        id: 'guest_123',
        fingerprint: 'fp_abc123',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        lastActiveAt: new Date('2024-01-02T00:00:00Z'),
        userId: 'user_456',
        mergedAt: new Date('2024-01-02T12:00:00Z'),
      };

      expect(guest.userId).toBe('user_456');
      expect(guest.mergedAt).toBeDefined();
    });
  });

  describe('UserPreference', () => {
    it('should create valid user preferences', () => {
      const prefs: UserPreference = {
        userId: 'user_123',
        theme: 'dark',
        contentLanguage: 'en',
        preferredCodeLanguage: 'typescript',
        difficultyPreference: 'intermediate',
        enableAiHints: true,
        enableAiExplanations: false,
        emailNotifications: true,
        pushNotifications: false,
        showKeyboardShortcuts: true,
        autoSaveInterval: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      };

      expect(prefs.userId).toBe('user_123');
      expect(prefs.theme).toBe('dark');
      expect(prefs.enableAiHints).toBe(true);
    });

    it('should have correct default preferences', () => {
      expect(DEFAULT_USER_PREFERENCES.theme).toBe('system');
      expect(DEFAULT_USER_PREFERENCES.contentLanguage).toBe('en');
      expect(DEFAULT_USER_PREFERENCES.preferredCodeLanguage).toBe('typescript');
      expect(DEFAULT_USER_PREFERENCES.difficultyPreference).toBe('mixed');
      expect(DEFAULT_USER_PREFERENCES.enableAiHints).toBe(false);
      expect(DEFAULT_USER_PREFERENCES.enableAiExplanations).toBe(false);
      expect(DEFAULT_USER_PREFERENCES.emailNotifications).toBe(true);
      expect(DEFAULT_USER_PREFERENCES.pushNotifications).toBe(false);
      expect(DEFAULT_USER_PREFERENCES.autoSaveInterval).toBe(30);
    });
  });

  describe('Helper Types', () => {
    it('CreateUserInput should omit generated fields', () => {
      const input: CreateUserInput = {
        email: 'new@example.com',
        name: 'New User',
        provider: 'github',
        providerUserId: 'github_123',
        status: 'active',
        emailVerified: false,
      };

      expect(input.email).toBe('new@example.com');
      // @ts-expect-error - id should not be present
      expect(input.id).toBeUndefined();
    });

    it('UpdateUserInput should be partial with required id and version', () => {
      const update: UpdateUserInput = {
        id: 'user_123',
        version: 1,
        name: 'Updated Name',
      };

      expect(update.id).toBe('user_123');
      expect(update.version).toBe(1);
      expect(update.name).toBe('Updated Name');
    });

    it('CreateGuestInput should only require fingerprint', () => {
      const input: CreateGuestInput = {
        fingerprint: 'fp_xyz789',
      };

      expect(input.fingerprint).toBe('fp_xyz789');
    });

    it('CreateUserPreferenceInput should support partial preferences', () => {
      const input: CreateUserPreferenceInput = {
        userId: 'user_123',
        theme: 'light',
        enableAiHints: true,
      };

      expect(input.userId).toBe('user_123');
      expect(input.theme).toBe('light');
      expect(input.enableAiHints).toBe(true);
    });
  });
});
