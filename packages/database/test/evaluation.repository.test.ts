import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DatabaseClient, createDatabaseClient, type DatabaseConfig } from '../src/client.js';
import { PostgresUserRepository } from '../src/repositories/user.repository.js';
import { PostgresContentRepository } from '../src/repositories/content.repository.js';
import { PostgresPracticeSessionRepository } from '../src/repositories/practice-session.repository.js';
import { PostgresEvaluationRepository } from '../src/repositories/evaluation.repository.js';
import { runMigrations } from '../src/migrations/index.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer;
let dbClient: DatabaseClient;
let userRepo: PostgresUserRepository;
let contentRepo: PostgresContentRepository;
let sessionRepo: PostgresPracticeSessionRepository;
let evaluationRepo: PostgresEvaluationRepository;

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
  evaluationRepo = new PostgresEvaluationRepository(dbClient);
}, 60000);

afterAll(async () => {
  await dbClient.close();
  await container.stop();
});

afterEach(async () => {
  await dbClient.query('TRUNCATE users, content_items, practice_sessions, attempts, evaluations, evaluation_findings CASCADE');
});

describe('PostgresEvaluationRepository', () => {
  it('should create evaluation', async () => {
    const user = await userRepo.create({
      email: 'eval@example.com',
      displayName: 'Eval User',
      role: 'learner',
    });

    const content = await contentRepo.create({
      slug: 'eval-problem',
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

    const evaluation = await evaluationRepo.create({
      attemptId: attempt.id,
      rubricVersion: 1,
      status: 'completed',
      overallScore: 85.5,
      overallFeedback: 'Good work!',
      evaluatedAt: new Date(),
    });

    expect(evaluation.id).toBeDefined();
    expect(evaluation.attemptId).toBe(attempt.id);
    expect(evaluation.overallScore).toBe(85.5);
    expect(evaluation.status).toBe('completed');
  });

  it('should find evaluation by attempt', async () => {
    const user = await userRepo.create({
      email: 'find-eval@example.com',
      displayName: 'Find Eval User',
      role: 'learner',
    });

    const content = await contentRepo.create({
      slug: 'find-eval-problem',
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

    await evaluationRepo.create({
      attemptId: attempt.id,
      rubricVersion: 1,
      status: 'completed',
      overallScore: 90,
      overallFeedback: 'Excellent!',
      evaluatedAt: new Date(),
    });

    const found = await evaluationRepo.findByAttempt(attempt.id);
    expect(found).not.toBeNull();
    expect(found!.overallScore).toBe(90);
    expect(found!.overallFeedback).toBe('Excellent!');
  });

  it('should create and retrieve evaluation findings', async () => {
    const user = await userRepo.create({
      email: 'findings@example.com',
      displayName: 'Findings User',
      role: 'learner',
    });

    const content = await contentRepo.create({
      slug: 'findings-problem',
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

    const evaluation = await evaluationRepo.create({
      attemptId: attempt.id,
      rubricVersion: 1,
      status: 'completed',
      overallScore: 80,
      overallFeedback: 'Good work with minor issues',
      evaluatedAt: new Date(),
    });

    const finding = await evaluationRepo.createFinding(evaluation.id, {
      id: '',
      evaluationId: evaluation.id,
      criterionId: 'correctness',
      score: 85,
      feedback: 'Code produces correct output',
      codeSnippet: 'return 42;',
      lineRange: { start: 1, end: 1 },
    });

    expect(finding.criterionId).toBe('correctness');
    expect(finding.score).toBe(85);
    expect(finding.feedback).toBe('Code produces correct output');

    const findings = await evaluationRepo.getFindings(evaluation.id);
    expect(findings.length).toBe(1);
    expect(findings[0].criterionId).toBe('correctness');
  });

  it('should update evaluation', async () => {
    const user = await userRepo.create({
      email: 'update-eval@example.com',
      displayName: 'Update Eval User',
      role: 'learner',
    });

    const content = await contentRepo.create({
      slug: 'update-eval-problem',
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

    const evaluation = await evaluationRepo.create({
      attemptId: attempt.id,
      rubricVersion: 1,
      status: 'pending',
      overallScore: null,
      overallFeedback: null,
      evaluatedAt: null,
    });

    const updated = await evaluationRepo.update(
      evaluation.id,
      {
        status: 'completed',
        overallScore: 88,
        overallFeedback: 'Well done!',
        evaluatedAt: new Date(),
      },
      1
    );

    expect(updated.status).toBe('completed');
    expect(updated.overallScore).toBe(88);
    expect(updated.overallFeedback).toBe('Well done!');
  });
});
