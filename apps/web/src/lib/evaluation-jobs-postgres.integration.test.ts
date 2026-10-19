import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '@leetcode-app/database';
import { runMigrations } from '../../../../packages/database/src/migrations/index.js';
import { prepareSupabaseTestDatabase } from '../../../../packages/database/test/support/supabase.js';
import { createEvaluationJobStore } from './evaluation-jobs-postgres';

let container: StartedTestContainer;
let dbClient: DatabaseClient;
let store: ReturnType<typeof createEvaluationJobStore>;
let principal: { userId: string; sessionId: string };

beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'testdb' })
    .withExposedPorts(5432)
    .start();

  const config: DatabaseConfig = {
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: 'testdb',
    user: 'test',
    password: 'test',
  };
  dbClient = createDatabaseClient(config);
  await prepareSupabaseTestDatabase(dbClient);
  const migrationsDirectory = new URL('../../../../packages/database/migrations', import.meta.url).pathname;
  await runMigrations(config, 'up', migrationsDirectory);
  store = createEvaluationJobStore(dbClient);
}, 60_000);

afterEach(async () => {
  await dbClient.query('TRUNCATE evaluation_jobs, practice_sessions, content_items, users CASCADE');
});

afterAll(async () => {
  await dbClient?.close();
  await container?.stop();
});

async function createPrincipal() {
  const user = await dbClient.query<{ id: string }>(
    "INSERT INTO users (display_name, role) VALUES ('Evaluation Test Learner', 'learner') RETURNING id",
  );
  const content = await dbClient.query<{ id: string }>(
    "INSERT INTO content_items (slug, type, status, difficulty, estimated_minutes) VALUES ('evaluation-job-test', 'problem', 'published', 'beginner', 15) RETURNING id",
  );
  const session = await dbClient.query<{ id: string }>(
    'INSERT INTO practice_sessions (user_id, content_id, content_version) VALUES ($1, $2, 1) RETURNING id',
    [user.rows[0].id, content.rows[0].id],
  );
  return { userId: user.rows[0].id, sessionId: session.rows[0].id };
}

function request(revisionNumber = 1) {
  return {
    userId: principal.userId,
    sessionId: principal.sessionId,
    revisionNumber,
    evaluatorVersion: 'integration-test-v1',
    rubricVersion: 'integration-test-rubric-v1',
  };
}

describe('PostgreSQL evaluation job store', () => {
  it('persists idempotent enqueue, claim attempts, completion, owned reads, and aggregate metrics', async () => {
    const enqueued = await store.enqueue(request());
    const duplicate = await store.enqueue(request());
    expect(duplicate.id).toBe(enqueued.id);
    expect(duplicate.status).toBe('queued');

    const claimed = await store.claimNext();
    expect(claimed).toMatchObject({ id: enqueued.id, status: 'running', attempts: 1 });

    const result = { score: 0.92, findings: [{ criterion: 'edge-case' }] };
    await store.complete(enqueued.id, result);
    await expect(store.findOwned(enqueued.id, principal.userId, principal.sessionId)).resolves.toMatchObject({
      status: 'completed',
      attempts: 1,
      result,
      error: null,
    });
    await expect(store.findOwned(enqueued.id, '00000000-0000-4000-8000-000000000000', principal.sessionId)).resolves.toBeNull();
    await expect(store.metrics()).resolves.toMatchObject({ completed: 1, queued: 0, running: 0 });
  });

  it('retries transient failures, recovers stale leases, and dead-letters exhausted work', async () => {
    const enqueued = await store.enqueue(request());
    await store.claimNext();
    await store.fail(enqueued.id, 'temporary evaluator failure');
    await expect(store.findById(enqueued.id)).resolves.toMatchObject({ status: 'queued', attempts: 1, error: 'temporary evaluator failure' });

    await store.claimNext();
    await dbClient.query("UPDATE evaluation_jobs SET started_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [enqueued.id]);
    await expect(store.recoverStaleRunning(10_000)).resolves.toEqual({ retried: 1, deadLettered: 0 });
    await expect(store.findById(enqueued.id)).resolves.toMatchObject({ status: 'queued', attempts: 2, startedAt: null });

    await store.claimNext();
    await store.fail(enqueued.id, 'retry budget exhausted');
    await expect(store.findById(enqueued.id)).resolves.toMatchObject({ status: 'failed', attempts: 3, deadLetteredAt: expect.any(String) });

    const staleAtLimit = await store.enqueue(request(2));
    await store.claimNext();
    await dbClient.query(
      "UPDATE evaluation_jobs SET attempts = max_attempts, started_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [staleAtLimit.id],
    );
    await expect(store.recoverStaleRunning(10_000)).resolves.toEqual({ retried: 0, deadLettered: 1 });
    await expect(store.findById(staleAtLimit.id)).resolves.toMatchObject({ status: 'failed', deadLetteredAt: expect.any(String) });
    await expect(store.metrics()).resolves.toMatchObject({ failed: 2, deadLettered: 2, queued: 0, running: 0 });
  });

  it('cancels only the owning queued or running job and reports queue age', async () => {
    const enqueued = await store.enqueue(request());
    await dbClient.query("UPDATE evaluation_jobs SET queued_at = NOW() - INTERVAL '2 seconds' WHERE id = $1", [enqueued.id]);
    expect((await store.metrics()).oldestQueuedAgeMs).toBeGreaterThanOrEqual(1_000);
    await expect(store.cancel(enqueued.id, '00000000-0000-4000-8000-000000000000', principal.sessionId)).resolves.toBeNull();
    await expect(store.cancel(enqueued.id, principal.userId, principal.sessionId)).resolves.toMatchObject({ id: enqueued.id, status: 'canceled' });
    await expect(store.metrics()).resolves.toMatchObject({ canceled: 1, queued: 0, running: 0, oldestQueuedAgeMs: 0 });
  });
});

beforeEach(async () => {
  principal = await createPrincipal();
});
