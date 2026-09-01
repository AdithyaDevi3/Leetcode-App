import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DatabaseClient, createDatabaseClient, type DatabaseConfig } from '../src/client.js';
import { PostgresUserRepository, PostgresGuestIdentityRepository } from '../src/repositories/user.repository.js';
import { OptimisticConcurrencyError } from '../src/repositories/base.js';
import { runMigrations } from '../src/migrations/index.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer;
let dbClient: DatabaseClient;
let userRepo: PostgresUserRepository;
let guestRepo: PostgresGuestIdentityRepository;

beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'testdb',
    })
    .withExposedPorts(5432)
    .start();

  const dbConfig: DatabaseConfig = {
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: 'testdb',
    user: 'test',
    password: 'test',
  };

  dbClient = createDatabaseClient(dbConfig);
  await prepareSupabaseTestDatabase(dbClient);
  await runMigrations(dbConfig, 'up');

  userRepo = new PostgresUserRepository(dbClient);
  guestRepo = new PostgresGuestIdentityRepository(dbClient);
}, 60000);

afterAll(async () => {
  await dbClient.close();
  await container.stop();
});

afterEach(async () => {
  await dbClient.query('TRUNCATE users, guest_identities, user_preferences CASCADE');
});

describe('PostgresUserRepository', () => {
  it('should create a new user', async () => {
    const user = await userRepo.create({
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'learner',
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.displayName).toBe('Test User');
    expect(user.role).toBe('learner');
    expect(user.revision).toBe(1);
  });

  it('should find user by id', async () => {
    const created = await userRepo.create({
      email: 'find@example.com',
      displayName: 'Find User',
      role: 'learner',
    });

    const found = await userRepo.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.email).toBe('find@example.com');
  });

  it('should find user by email', async () => {
    await userRepo.create({
      email: 'email@example.com',
      displayName: 'Email User',
      role: 'learner',
    });

    const found = await userRepo.findByEmail('email@example.com');
    expect(found).not.toBeNull();
    expect(found!.displayName).toBe('Email User');
  });

  it('should update user with optimistic locking', async () => {
    const user = await userRepo.create({
      email: 'update@example.com',
      displayName: 'Original Name',
      role: 'learner',
    });

    const updated = await userRepo.update(
      user.id,
      { displayName: 'Updated Name' },
      user.revision
    );

    expect(updated.displayName).toBe('Updated Name');
    expect(updated.revision).toBe(2);
  });

  it('should throw error on concurrent update', async () => {
    const user = await userRepo.create({
      email: 'concurrent@example.com',
      displayName: 'Original',
      role: 'learner',
    });

    // First update succeeds
    await userRepo.update(user.id, { displayName: 'First Update' }, user.revision);

    // Second update with stale revision should fail
    await expect(
      userRepo.update(user.id, { displayName: 'Second Update' }, user.revision)
    ).rejects.toThrow(OptimisticConcurrencyError);
  });

  it('should create and update user preferences', async () => {
    const user = await userRepo.create({
      email: 'prefs@example.com',
      displayName: 'Prefs User',
      role: 'learner',
    });

    const prefs = await userRepo.updatePreferences(user.id, {
      theme: 'dark',
      language: 'es',
      emailNotifications: false,
    });

    expect(prefs.theme).toBe('dark');
    expect(prefs.language).toBe('es');
    expect(prefs.emailNotifications).toBe(false);

    // Update partial preferences
    const updated = await userRepo.updatePreferences(user.id, {
      theme: 'light',
    });

    expect(updated.theme).toBe('light');
    expect(updated.language).toBe('es'); // Should remain unchanged
  });
});

describe('PostgresGuestIdentityRepository', () => {
  it('should create a new guest identity', async () => {
    const expiresAt = new Date(Date.now() + 86400000); // 24 hours
    const guest = await guestRepo.create({
      deviceFingerprint: 'fingerprint123',
      sessionToken: 'token123',
      expiresAt,
    });

    expect(guest.id).toBeDefined();
    expect(guest.deviceFingerprint).toBe('fingerprint123');
    expect(guest.sessionToken).toBe('token123');
  });

  it('should find guest by session token', async () => {
    const expiresAt = new Date(Date.now() + 86400000);
    await guestRepo.create({
      deviceFingerprint: 'fingerprint456',
      sessionToken: 'token456',
      expiresAt,
    });

    const found = await guestRepo.findBySessionToken('token456');
    expect(found).not.toBeNull();
    expect(found!.deviceFingerprint).toBe('fingerprint456');
  });

  it('should upgrade guest to user', async () => {
    const user = await userRepo.create({
      email: 'upgrade@example.com',
      displayName: 'Upgraded User',
      role: 'learner',
    });

    const expiresAt = new Date(Date.now() + 86400000);
    const guest = await guestRepo.create({
      deviceFingerprint: 'fingerprint789',
      sessionToken: 'token789',
      expiresAt,
    });

    await guestRepo.upgradeToUser(guest.id, user.id);

    const updated = await guestRepo.findById(guest.id);
    expect(updated!.upgradedToUserId).toBe(user.id);
  });
});
