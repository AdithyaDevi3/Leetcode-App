import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '@leetcode-app/database';
import { runMigrations } from '../../../../packages/database/src/migrations/index.js';
import { prepareSupabaseTestDatabase } from '../../../../packages/database/test/support/supabase.js';
import { appendPracticeRevision, getPracticeSessionHistory, startOrResumePracticeSession } from './practice-api';
import type { PracticeSessionState } from './practice-session';
import { beginPracticeVerification, finishPracticeVerification } from './practice-verification';
import { CODE_GRADING_VERSION, codeCheckLabels } from './code-grading';
import { PracticeRevisionConflict } from './practice-sync-contract';

vi.mock('server-only', () => ({}));

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
  it('opens only one session when two devices start the same activity together', async () => {
    const { owner } = await createVerificationSession();
    const results = await Promise.all(Array.from({ length: 4 }, () => startOrResumePracticeSession({ owner, contentId: 'balanced-brackets-v1' })));
    expect(new Set(results.map(result => result.session.id)).size).toBe(1);
    expect(results.filter(result => result.created)).toHaveLength(1);
  });

  it('accepts one simultaneous conditional save and retains the winner without overwriting it', async () => {
    const { owner, sessionId } = await createVerificationSession();
    const results = await Promise.allSettled(['first device', 'second device'].map((draft, index) => appendPracticeRevision({
      owner, sessionId, draft, workspaceState: { ...workspace(source), draft }, expectedRevisionNumber: 0, requestKey: `device-${index}`,
    })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(PracticeRevisionConflict);
    const winner = results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof appendPracticeRevision>>>;
    const history = await getPracticeSessionHistory({ owner, sessionId });
    expect(history.revisions).toHaveLength(1);
    expect(history.session.sessionMetadata.draft).toBe(winner.value.revision.draft);
  });

  it('serializes legacy concurrent appends without duplicate revision numbers', async () => {
    const { owner, sessionId } = await createVerificationSession();
    const results = await Promise.all(Array.from({ length: 5 }, (_, index) => appendPracticeRevision({ owner, sessionId, draft: `legacy-${index}` })));
    expect(results.map(result => result.revision.revisionNumber).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns the original save receipt after later edits and rejects a changed retry payload', async () => {
    const { owner, sessionId } = await createVerificationSession();
    const input = { owner, sessionId, draft: 'First edit.', expectedRevisionNumber: 0, requestKey: 'lost-response' };
    const first = await appendPracticeRevision(input);
    await appendPracticeRevision({ owner, sessionId, draft: 'Later edit.', expectedRevisionNumber: 1, requestKey: 'later-edit' });
    await expect(appendPracticeRevision(input)).resolves.toEqual(first);
    await expect(appendPracticeRevision({ ...input, draft: 'Changed under same key.' })).rejects.toMatchObject({ code: 'request_reused' });
    const history = await getPracticeSessionHistory({ owner, sessionId });
    expect(history.revisions).toHaveLength(2);
    expect(history.session.sessionMetadata.draft).toBe('Later edit.');
  });

  it('uses the draft revision independently of verification changes and protects the report', async () => {
    const { owner, sessionId } = await createVerificationSession();
    const request = await beginPracticeVerification({ owner, sessionId, language: 'python', source });
    await finishPracticeVerification({ owner, sessionId, requestId: request.requestId, grade: verificationGrade(true) });
    const saved = await appendPracticeRevision({ owner, sessionId, draft: 'Reasoning after verification.', workspaceState: workspace(source), expectedRevisionNumber: 0, requestKey: 'post-verification' });
    expect(saved.revision).toMatchObject({ revisionNumber: 1, sessionRevision: 4 });
    const resumed = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    expect(resumed.session.sessionMetadata.verification).toMatchObject({ requestId: request.requestId, grade: { passed: true } });
  });
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

  it('persists a passing report and source without any browser save, and schedules review once', async () => {
    const { owner, sessionId } = await createVerificationSession();
    const request = await beginPracticeVerification({ owner, sessionId, language: 'python', source });
    const grade = verificationGrade(true);
    await expect(finishPracticeVerification({ owner, sessionId, requestId: request.requestId, grade })).resolves.toBe(true);
    const resumed = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    expect(resumed.session.status).toBe('completed');
    expect(resumed.session.sessionMetadata.workspaceState).toMatchObject({ code: source, language: 'python', codeGrade: grade, codeChecked: true, completed: true });
    expect(resumed.session.sessionMetadata.verification).toMatchObject({ source, grade, requestId: request.requestId });
    const before = await db.query('SELECT id, repetitions FROM scheduled_reviews WHERE user_id = $1 ORDER BY id', [owner.id]);
    expect(before.rows.length).toBeGreaterThan(0);
    await expect(finishPracticeVerification({ owner, sessionId, requestId: request.requestId, grade })).resolves.toBe(true);
    const after = await db.query('SELECT id, repetitions FROM scheduled_reviews WHERE user_id = $1 ORDER BY id', [owner.id]);
    expect(after.rows).toEqual(before.rows);
  });

  it('round-trips all language drafts through account revisions and source-bound verification', async () => {
    const { owner, sessionId } = await createVerificationSession();
    const codeByLanguage = { python: source, cpp: 'int answer() { return 7; }', typescript: 'const answer = () => 7;' };
    const state: PracticeSessionState = { ...workspace(source), codeDraftVersion: 1, codeByLanguage };
    await appendPracticeRevision({ owner, sessionId, draft: '', workspaceState: state });
    const request = await beginPracticeVerification({ owner, sessionId, language: 'python', source });
    await finishPracticeVerification({ owner, sessionId, requestId: request.requestId, grade: verificationGrade(true) });
    const resumed = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    expect(resumed.session.sessionMetadata.workspaceState).toMatchObject({
      code: source, language: 'python', codeDraftVersion: 1, codeByLanguage, codeChecked: true, completed: true,
    });
    const switched = { ...state, code: codeByLanguage.cpp, language: 'cpp' as const };
    await appendPracticeRevision({ owner, sessionId, draft: '', workspaceState: switched });
    const next = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    expect(next.session.sessionMetadata.workspaceState).toMatchObject({
      ...switched, codeGrade: null, codeChecked: false, completed: false,
    });
    expect(next.session.sessionMetadata.verification).toMatchObject({ source, language: 'python', grade: verificationGrade(true) });
  });

  it('preserves other languages from older clients and accepts an explicit versioned reset', async () => {
    const { owner, sessionId } = await createVerificationSession();
    const cpp = 'int answer() { return 7; }';
    await appendPracticeRevision({ owner, sessionId, draft: '', workspaceState: {
      ...workspace(source), codeDraftVersion: 1, codeByLanguage: { python: source, cpp },
    } });
    const edited = 'def find_pair(values, target):\n    return []';
    const legacyInput = { owner, sessionId, draft: '', workspaceState: workspace(edited), expectedRevisionNumber: 1, requestKey: 'legacy-tab-save' };
    const receipt = await appendPracticeRevision(legacyInput);
    const resumed = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    expect(resumed.session.sessionMetadata.workspaceState).toMatchObject({ code: edited,
      codeDraftVersion: 1, codeByLanguage: { python: edited, cpp } });
    const reset = { ...workspace('def find_pair(values, target):\n    pass'), codeDraftVersion: 1 as const, codeByLanguage: { python: 'def find_pair(values, target):\n    pass' } };
    await appendPracticeRevision({ owner, sessionId, draft: '', workspaceState: reset, expectedRevisionNumber: 2 });
    await expect(appendPracticeRevision(legacyInput)).resolves.toEqual(receipt);
    const after = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    expect(after.session.sessionMetadata.workspaceState).toMatchObject(reset);
    expect((after.session.sessionMetadata.workspaceState as PracticeSessionState).codeByLanguage).not.toHaveProperty('cpp');
  });

  it('persists partial-test feedback without completing practice or scheduling reviews', async () => {
    const { owner, sessionId } = await createVerificationSession();
    const request = await beginPracticeVerification({ owner, sessionId, language: 'python', source });
    const grade = verificationGrade(false);
    await finishPracticeVerification({ owner, sessionId, requestId: request.requestId, grade });
    const resumed = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    expect(resumed.session.status).toBe('in_progress');
    expect(resumed.session.sessionMetadata.workspaceState).toMatchObject({ codeGrade: grade, codeChecked: true, completed: false });
    expect((await db.query('SELECT id FROM scheduled_reviews WHERE user_id = $1', [owner.id])).rows).toHaveLength(0);
  });

  it('keeps the server report when a delayed autosave omits its grade', async () => {
    const { owner, sessionId } = await createVerificationSession();
    const request = await beginPracticeVerification({ owner, sessionId, language: 'python', source });
    const grade = verificationGrade(true);
    await finishPracticeVerification({ owner, sessionId, requestId: request.requestId, grade });
    await appendPracticeRevision({ owner, sessionId, draft: '', workspaceState: workspace(source) });
    const resumed = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    expect(resumed.session.sessionMetadata.workspaceState).toMatchObject({ codeGrade: grade, codeChecked: true, completed: true });
    expect(resumed.session.sessionMetadata.verification).toMatchObject({ grade, source });
  });

  it('preserves code edited during a run and does not assign the earlier report to it', async () => {
    const { owner, sessionId } = await createVerificationSession();
    await appendPracticeRevision({ owner, sessionId, draft: '', workspaceState: workspace('original code') });
    const request = await beginPracticeVerification({ owner, sessionId, language: 'python', source });
    const edited = workspace('newer code that has not been tested');
    await appendPracticeRevision({ owner, sessionId, draft: '', workspaceState: edited });
    const grade = verificationGrade(true);
    await finishPracticeVerification({ owner, sessionId, requestId: request.requestId, grade });
    const resumed = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    expect(resumed.session.sessionMetadata.workspaceState).toEqual(edited);
    expect(resumed.session.sessionMetadata.verification).toMatchObject({ source, grade });
  });

  it('prevents an older run from replacing a newer report or granting completion', async () => {
    const { owner, sessionId } = await createVerificationSession();
    const first = await beginPracticeVerification({ owner, sessionId, language: 'python', source: 'first source' });
    const second = await beginPracticeVerification({ owner, sessionId, language: 'python', source: 'second source' });
    const grade = verificationGrade(false);
    await finishPracticeVerification({ owner, sessionId, requestId: second.requestId, grade });
    await expect(finishPracticeVerification({ owner, sessionId, requestId: first.requestId, grade: verificationGrade(true) })).resolves.toBe(false);
    const resumed = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    expect(resumed.session.status).toBe('in_progress');
    expect(resumed.session.sessionMetadata.verification).toMatchObject({ requestId: second.requestId, source: 'second source', grade });
  });

  it('denies another owner and rejects forged grading versions without persisting results', async () => {
    const first = await createVerificationSession();
    const second = await createVerificationSession();
    const request = await beginPracticeVerification({ ...first, language: 'python', source });
    await expect(beginPracticeVerification({ owner: second.owner, sessionId: first.sessionId, language: 'python', source }))
      .rejects.toThrow('Practice session not found');
    await expect(finishPracticeVerification({ owner: second.owner, sessionId: first.sessionId, requestId: request.requestId, grade: verificationGrade(true) }))
      .rejects.toThrow('Practice session not found');
    await expect(finishPracticeVerification({ ...first, requestId: request.requestId, grade: { ...verificationGrade(true), version: 'forged' } }))
      .rejects.toThrow('Invalid verification report');
    const resumed = await startOrResumePracticeSession({ owner: first.owner, contentId: 'pair-with-target-v1' });
    expect(resumed.session.sessionMetadata.verification).toBeUndefined();
    expect(resumed.session.status).not.toBe('completed');
  });

  it('persists and restores a guest-owned verification independently of signed-in users', async () => {
    const guest = await db.query<{ id: string }>(
      "INSERT INTO guest_identities (device_fingerprint, session_token, expires_at) VALUES ('verification-test', gen_random_uuid()::text, NOW() + INTERVAL '1 day') RETURNING id",
    );
    const owner = { kind: 'guest' as const, id: guest.rows[0].id };
    const { session } = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    const request = await beginPracticeVerification({ owner, sessionId: session.id, language: 'python', source });
    const grade = verificationGrade(true);
    await finishPracticeVerification({ owner, sessionId: session.id, requestId: request.requestId, grade });
    const resumed = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
    expect(resumed.session.sessionMetadata.workspaceState).toMatchObject({ code: source, codeGrade: grade, completed: true });
  });
});

const source = 'def find_pair(values, target): return [0, 1]';
function workspace(code: string): PracticeSessionState {
  return { draft: '', mode: 'text', language: 'python', code, codeChecked: false, completed: false, evaluation: null, codeGrade: null };
}
function verificationGrade(passed: boolean) {
  const tests = codeCheckLabels('pair-with-target-v1').map((name, index) => ({ name, passed: passed || index !== 0 }));
  return { problemId: 'pair-with-target-v1', version: CODE_GRADING_VERSION, passed,
    passedCount: tests.filter(test => test.passed).length, totalCount: tests.length, tests };
}
async function createVerificationSession() {
  const users = await db.query<{ id: string }>("INSERT INTO users (display_name, role) VALUES ('Verification Learner', 'learner') RETURNING id");
  const owner = { kind: 'user' as const, id: users.rows[0].id };
  const { session } = await startOrResumePracticeSession({ owner, contentId: 'pair-with-target-v1' });
  return { owner, sessionId: session.id };
}
