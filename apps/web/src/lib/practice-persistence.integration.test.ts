import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '@leetcode-app/database';
import { runMigrations } from '../../../../packages/database/src/migrations/index.js';
import { prepareSupabaseTestDatabase } from '../../../../packages/database/test/support/supabase.js';
import { appendPracticeRevision, getPracticeSessionHistory, startOrResumePracticeSession } from './practice-api';
import type { PracticeSessionState } from './practice-session';

let container: StartedTestContainer;
let db: DatabaseClient;

beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'testdb' })
    .withExposedPorts(5432).start();
  const config: DatabaseConfig = {
    host: container.getHost(), port: container.getMappedPort(5432),
    database: 'testdb', user: 'test', password: 'test',
  };
  db = createDatabaseClient(config);
  await prepareSupabaseTestDatabase(db);
  await runMigrations(config, 'up', new URL('../../../../packages/database/migrations', import.meta.url).pathname);
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('POSTGRES_HOST', config.host);
  vi.stubEnv('POSTGRES_PORT', String(config.port));
  vi.stubEnv('POSTGRES_DB', config.database);
  vi.stubEnv('POSTGRES_USER', config.user);
  vi.stubEnv('POSTGRES_PASSWORD', config.password);
  vi.stubEnv('POSTGRES_SSL', 'false');
}, 60_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await db?.close();
  await container?.stop();
});

describe('durable coding-only practice', () => {
  it('restores code and received feedback through a fresh database client and denies another owner', async () => {
    const users = await db.query<{ id: string }>(
      "INSERT INTO users (display_name, role) VALUES ('Persistence Learner', 'learner'), ('Other Learner', 'learner') RETURNING id",
    );
    const owner = { kind: 'user' as const, id: users.rows[0].id };
    const { session } = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    const state: PracticeSessionState = {
      draft: '', mode: 'text', language: 'python',
      code: 'def find_pair(values, target):\n    return [0, 1]',
      codeChecked: true, completed: false, evaluation: null,
      codeGrade: {
        problemId: 'pair-with-target-v1', version: 'persistence-fixture-v1', passed: false,
        passedCount: 1, totalCount: 2,
        tests: [{ name: 'sample case', passed: true }, { name: 'edge case', passed: false }],
      },
    };

    await appendPracticeRevision({ owner, sessionId: session.id, draft: '', currentStage: 'implement', workspaceState: state });
    const resumed = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    expect(resumed.created).toBe(false);
    expect(resumed.session.id).toBe(session.id);
    expect(resumed.session.sessionMetadata.workspaceState).toEqual(state);
    expect(resumed.session.latestRevisionNumber).toBe(1);

    const history = await getPracticeSessionHistory({ owner, sessionId: session.id });
    expect(history.revisions).toHaveLength(1);
    expect(history.revisions[0].content).toBe('');
    await expect(getPracticeSessionHistory({
      owner: { kind: 'user', id: users.rows[1].id }, sessionId: session.id,
    })).rejects.toThrow('Practice session not found');
  });
});
