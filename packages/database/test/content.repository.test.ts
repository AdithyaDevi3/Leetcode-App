import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DatabaseClient, createDatabaseClient, type DatabaseConfig } from '../src/client.js';
import { PostgresContentRepository } from '../src/repositories/content.repository.js';
import { OptimisticConcurrencyError } from '../src/repositories/base.js';
import { runMigrations } from '../src/migrations/index.js';

let container: StartedTestContainer;
let dbClient: DatabaseClient;
let contentRepo: PostgresContentRepository;

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
  await runMigrations(dbConfig, 'up');
  contentRepo = new PostgresContentRepository(dbClient);
}, 60000);

afterAll(async () => {
  await dbClient.close();
  await container.stop();
});

afterEach(async () => {
  await dbClient.query('TRUNCATE content_items, content_versions, rubric_versions CASCADE');
});

describe('PostgresContentRepository', () => {
  it('should create content item', async () => {
    const content = await contentRepo.create({
      slug: 'test-problem',
      type: 'problem',
      status: 'draft',
      difficulty: 'beginner',
      estimatedMinutes: 30,
      tags: ['arrays', 'hash-map'],
    });

    expect(content.id).toBeDefined();
    expect(content.slug).toBe('test-problem');
    expect(content.type).toBe('problem');
    expect(content.revision).toBe(1);
  });

  it('should find content by slug', async () => {
    await contentRepo.create({
      slug: 'find-by-slug',
      type: 'lesson',
      status: 'published',
      difficulty: 'intermediate',
      estimatedMinutes: 45,
      tags: ['sorting'],
    });

    const found = await contentRepo.findBySlug('find-by-slug');
    expect(found).not.toBeNull();
    expect(found!.type).toBe('lesson');
  });

  it('should update content with optimistic locking', async () => {
    const content = await contentRepo.create({
      slug: 'update-content',
      type: 'problem',
      status: 'draft',
      difficulty: 'beginner',
      estimatedMinutes: 30,
      tags: [],
    });

    const updated = await contentRepo.update(
      content.id,
      { status: 'published' },
      content.revision
    );

    expect(updated.status).toBe('published');
    expect(updated.revision).toBe(2);
  });

  it('should throw error on concurrent content update', async () => {
    const content = await contentRepo.create({
      slug: 'concurrent-content',
      type: 'problem',
      status: 'draft',
      difficulty: 'beginner',
      estimatedMinutes: 30,
      tags: [],
    });

    await contentRepo.update(content.id, { status: 'published' }, content.revision);

    await expect(
      contentRepo.update(content.id, { status: 'archived' }, content.revision)
    ).rejects.toThrow(OptimisticConcurrencyError);
  });

  it('should create and retrieve content versions', async () => {
    const content = await contentRepo.create({
      slug: 'versioned-content',
      type: 'problem',
      status: 'draft',
      difficulty: 'beginner',
      estimatedMinutes: 30,
      tags: [],
    });

    const version = await contentRepo.createVersion(content.id, {
      id: '',
      contentId: content.id,
      version: 1,
      title: 'Test Problem',
      description: 'A test problem',
      markdownContent: '# Test\n\nContent here',
      starterCode: 'function test() {}',
      solutionCode: 'function test() { return 42; }',
      testCases: [{ input: '1', expected: '1', description: 'Test case 1' }],
      createdAt: new Date(),
    });

    expect(version.version).toBe(1);
    expect(version.title).toBe('Test Problem');

    const retrieved = await contentRepo.getVersion(content.id, 1);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe('Test Problem');

    const latest = await contentRepo.getLatestVersion(content.id);
    expect(latest).not.toBeNull();
    expect(latest!.version).toBe(1);
  });

  it('should create and retrieve rubric versions', async () => {
    const content = await contentRepo.create({
      slug: 'rubric-content',
      type: 'problem',
      status: 'draft',
      difficulty: 'beginner',
      estimatedMinutes: 30,
      tags: [],
    });

    const rubric = await contentRepo.createRubric(content.id, {
      id: '',
      contentId: content.id,
      version: 1,
      criteria: {
        correctness: { weight: 50, description: 'Code works' },
        efficiency: { weight: 30, description: 'Code is efficient' },
        style: { weight: 20, description: 'Code is clean' },
      },
      createdAt: new Date(),
    });

    expect(rubric.version).toBe(1);
    expect(rubric.criteria.correctness.weight).toBe(50);

    const retrieved = await contentRepo.getRubric(content.id, 1);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.criteria.correctness.description).toBe('Code works');

    const latest = await contentRepo.getLatestRubric(content.id);
    expect(latest).not.toBeNull();
    expect(latest!.version).toBe(1);
  });
});
