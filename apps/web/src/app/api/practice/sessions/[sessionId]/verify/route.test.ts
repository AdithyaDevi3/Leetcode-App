import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CODE_GRADING_MARKER, CODE_GRADING_VERSION, codeCheckLabels } from '@/lib/code-grading';

const getPracticeOwner = vi.fn();
const getPracticeSessionHistory = vi.fn();
const completePracticeSession = vi.fn();
const execute = vi.fn();

vi.mock('@/lib/auth/session', () => ({ getPracticeOwner }));
vi.mock('@/lib/practice-api', () => ({ getPracticeSessionHistory, completePracticeSession }));
vi.mock('@/lib/sandbox/runtime', () => ({ createConfiguredSandbox: () => ({ execute }) }));

describe('/api/practice/sessions/[sessionId]/verify', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.CODE_EXECUTION_ENABLED = 'true';
    getPracticeOwner.mockResolvedValue({ kind: 'guest', id: 'guest-1' });
    getPracticeSessionHistory.mockResolvedValue({
      session: { contentId: '20000000-0000-0000-0000-000000000001' },
      revisions: [],
    });
    completePracticeSession.mockResolvedValue({ session: { status: 'completed' } });
  });

  it('runs server-built tests for the session content and returns a grade', async () => {
    const tests = codeCheckLabels('pair-with-target-v1').map((name) => ({ name, passed: true }));
    const grade = {
      problemId: 'pair-with-target-v1',
      version: CODE_GRADING_VERSION,
      passed: true,
      passedCount: 4,
      totalCount: 4,
      tests,
    };
    execute.mockResolvedValue({
      status: 'completed',
      stdout: `${CODE_GRADING_MARKER}${JSON.stringify(grade)}`,
      stderr: '',
      durationMs: 20,
    });

    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ language: 'typescript', source: 'function findPair() { return [0, 1]; }' }),
    }), { params: Promise.resolve({ sessionId: 'session-1' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'completed', grade: { passed: true } });
    expect(getPracticeSessionHistory).toHaveBeenCalledWith({ owner: { kind: 'guest', id: 'guest-1' }, sessionId: 'session-1' });
    expect(completePracticeSession).toHaveBeenCalledWith({ owner: { kind: 'guest', id: 'guest-1' }, sessionId: 'session-1', completed: true, currentStage: 'evaluate' });
    expect(execute.mock.calls[0][0].source).toContain('uses distinct duplicate positions');
  });

  it('does not run when verified execution is disabled', async () => {
    process.env.CODE_EXECUTION_ENABLED = 'false';
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ sessionId: 'session-1' }),
    });
    expect(response.status).toBe(503);
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not complete a session when any hidden test fails', async () => {
    const tests = codeCheckLabels('pair-with-target-v1').map((name, index) => ({ name, passed: index !== 2 }));
    const grade = {
      problemId: 'pair-with-target-v1',
      version: CODE_GRADING_VERSION,
      passed: false,
      passedCount: 3,
      totalCount: 4,
      tests,
    };
    execute.mockResolvedValue({
      status: 'completed',
      stdout: `${CODE_GRADING_MARKER}${JSON.stringify(grade)}`,
      stderr: '',
      durationMs: 20,
    });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ language: 'typescript', source: 'function findPair() { return []; }' }),
    }), { params: Promise.resolve({ sessionId: 'session-1' }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ grade: { passed: false } });
    expect(completePracticeSession).not.toHaveBeenCalled();
  });
});
