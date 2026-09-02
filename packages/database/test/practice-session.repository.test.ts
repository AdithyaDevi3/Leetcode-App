import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DatabaseClient, createDatabaseClient, type DatabaseConfig } from '../src/client.js';
import { PostgresUserRepository } from '../src/repositories/user.repository.js';
import { PostgresContentRepository } from '../src/repositories/content.repository.js';
import { PostgresPracticeSessionRepository } from '../src/repositories/practice-session.repository.js';
import { OptimisticConcurrencyError } from '../src/repositories/base.js';
import { runMigrations } from '../src/migrations/index.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer;
let dbClient: DatabaseClient;
let userRepo: PostgresUserRepository;
let contentRepo: PostgresContentRepository;
let sessionRepo: PostgresPracticeSessionRepository;

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
  contentRepo = new PostgresContentRepository(dbClient);
  sessionRepo = new PostgresPracticeSessionRepository(dbClient);
}, 60000);

afterAll(async () => {
  await dbClient.close();
  await container.stop();
});

afterEach(async () => {
  await dbClient.query('TRUNCATE users, content_items, practice_sessions, attempts, pseudocode_revisions CASCADE');
});

describe('PostgresPracticeSessionRepository', () => {
  it('should create practice session', async () => {
    const user = await userRepo.create({
      email: 'session@example.com',
      displayName: 'Session User',
      role: 'learner',
    });

    const content = await contentRepo.create({
      slug: 'session-problem',
      type: 'problem',
      status: 'published',
      difficulty: 'beginner',
      estimatedMinutes: 30,
      tags: [],
    });

    const session = await sessionRepo.create({
      userId: user.id,
      guestId: null,
      contentId: content.id,
      contentVersion: 1,
      status: 'active',
      completedAt: null,
      totalTimeSeconds: 0,
    });

    expect(session.id).toBeDefined();
    expect(session.userId).toBe(user.id);
    expect(session.contentId).toBe(content.id);
    expect(session.status).toBe('active');
    expect(session.revision).toBe(1);
  });

  it('should find sessions by user', async () => {
    const user = await userRepo.create({
      email: 'find@example.com',
      displayName: 'Find User',
      role: 'learner',
    });

    const content = await contentRepo.create({
      slug: 'find-problem',
      type: 'problem',
      status: 'published',
      difficulty: 'beginner',
      estimatedMinutes: 30,
      tags: [],
    });

    await sessionRepo.create({
      userId: user.id,
      guestId: null,
      contentId: content.id,
      contentVersion: 1,
      status: 'active',
      completedAt: null,
      totalTimeSeconds: 0,
    });

    const sessions = await sessionRepo.findByUser(user.id);
    expect(sessions.length).toBe(1);
    expect(sessions[0].userId).toBe(user.id);
  });

  it('should update session with optimistic locking', async () => {
    const user = await userRepo.create({
      email: 'update@example.com',
      displayName: 'Update User',
      role: 'learner',
    });

    const content = await contentRepo.create({
      slug: 'update-problem',
      type: 'problem',
      status: 'published',
      difficulty: 'beginner',
      estimatedMinutes: 30,
      tags: [],
    });

    const session = await sessionRepo.create({
      userId: user.id,
      guestId: null,
      contentId: content.id,
      contentVersion: 1,
      status: 'active',
      completedAt: null,
      totalTimeSeconds: 0,
    });

    const updated = await sessionRepo.update(
      session.id,
      { status: 'completed', completedAt: new Date(), totalTimeSeconds: 300 },
      session.revision
    );

    expect(updated.status).toBe('completed');
    expect(updated.totalTimeSeconds).toBe(300);
    expect(updated.revision).toBe(2);
  });

  it('should throw error on concurrent session update', async () => {
    const user = await userRepo.create({
      email: 'concurrent@example.com',
      displayName: 'Concurrent User',
      role: 'learner',
    });

    const content = await contentRepo.create({
      slug: 'concurrent-problem',
      type: 'problem',
      status: 'published',
      difficulty: 'beginner',
      estimatedMinutes: 30,
      tags: [],
    });

    const session = await sessionRepo.create({
      userId: user.id,
      guestId: null,
      contentId: content.id,
      contentVersion: 1,
      status: 'active',
      completedAt: null,
      totalTimeSeconds: 0,
    });

    await sessionRepo.update(session.id, { totalTimeSeconds: 100 }, session.revision);

    await expect(
      sessionRepo.update(session.id, { totalTimeSeconds: 200 }, session.revision)
    ).rejects.toThrow(OptimisticConcurrencyError);
  });

  it('should create and retrieve attempts', async () => {
    const user = await userRepo.create({
      email: 'attempt@example.com',
      displayName: 'Attempt User',
      role: 'learner',
    });

    const content = await contentRepo.create({
      slug: 'attempt-problem',
      type: 'problem',
      status: 'published',
      difficulty: 'beginner',
      estimatedMinutes: 30,
      tags: [],
    });

    const session = await sessionRepo.create({
      userId: user.id,
      guestId: null,
      contentId: content.id,
      contentVersion: 1,
      status: 'active',
      completedAt: null,
      totalTimeSeconds: 0,
    });

    const attempt = await sessionRepo.createAttempt(session.id, {
      id: '',
      sessionId: session.id,
      attemptNumber: 1,
      submittedCode: 'function test() { return 42; }',
      submittedPseudocode: '1. Return 42',
      submittedAt: new Date(),
    });

    expect(attempt.attemptNumber).toBe(1);
    expect(attempt.submittedCode).toBe('function test() { return 42; }');

    const attempts = await sessionRepo.getAttempts(session.id);
    expect(attempts.length).toBe(1);
    expect(attempts[0].attemptNumber).toBe(1);
  });

  it('should create and retrieve pseudocode revisions', async () => {
    const user = await userRepo.create({
      email: 'pseudo@example.com',
      displayName: 'Pseudo User',
      role: 'learner',
    });

    const content = await contentRepo.create({
      slug: 'pseudo-problem',
      type: 'problem',
      status: 'published',
      difficulty: 'beginner',
      estimatedMinutes: 30,
      tags: [],
    });

    const session = await sessionRepo.create({
      userId: user.id,
      guestId: null,
      contentId: content.id,
      contentVersion: 1,
      status: 'active',
      completedAt: null,
      totalTimeSeconds: 0,
    });

    const revision = await sessionRepo.createPseudocodeRevision(session.id, {
      id: '',
      sessionId: session.id,
      revisionNumber: 1,
      content: '1. Initialize counter\n2. Loop through array',
      createdAt: new Date(),
    });

    expect(revision.revisionNumber).toBe(1);
    expect(revision.content).toContain('Initialize counter');

    const revisions = await sessionRepo.getPseudocodeRevisions(session.id);
    expect(revisions.length).toBe(1);
    expect(revisions[0].revisionNumber).toBe(1);
  });
});
