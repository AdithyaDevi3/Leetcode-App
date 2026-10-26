import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CODE_GRADING_MARKER, CODE_GRADING_VERSION, codeCheckLabels } from '@/lib/code-grading';

const getPracticeOwner = vi.fn();
const getPracticeSessionHistory = vi.fn();
const beginPracticeVerification = vi.fn();
const finishPracticeVerification = vi.fn();
const execute = vi.fn();
const takeRateLimit = vi.fn();

vi.mock('@/lib/auth/session', () => ({ getPracticeOwner }));
vi.mock('@/lib/practice-api', () => ({ getPracticeSessionHistory }));
vi.mock('@/lib/practice-verification', () => ({ beginPracticeVerification, finishPracticeVerification }));
vi.mock('@/lib/sandbox/runtime', () => ({ createConfiguredSandbox: () => ({ execute }) }));
vi.mock('@/lib/rate-limit', () => ({ takeRateLimit }));

describe('/api/practice/sessions/[sessionId]/verify', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.CODE_EXECUTION_ENABLED = 'true';
    getPracticeOwner.mockResolvedValue({ kind: 'guest', id: 'guest-1' });
    getPracticeSessionHistory.mockResolvedValue({
      session: { contentId: '20000000-0000-0000-0000-000000000001' },
      revisions: [],
    });
    beginPracticeVerification.mockResolvedValue({ requestId: 'verification-1' });
    finishPracticeVerification.mockResolvedValue(true);
    takeRateLimit.mockResolvedValue({ allowed: true });
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
    expect(beginPracticeVerification).toHaveBeenCalledWith({
      owner: { kind: 'guest', id: 'guest-1' }, sessionId: 'session-1',
      language: 'typescript', source: 'function findPair() { return [0, 1]; }',
    });
    expect(finishPracticeVerification).toHaveBeenCalledWith({
      owner: { kind: 'guest', id: 'guest-1' }, sessionId: 'session-1', requestId: 'verification-1', grade,
    });
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

  it('persists a partial-test report without replacing it with a completion flag', async () => {
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
    expect(finishPracticeVerification).toHaveBeenCalledWith(expect.objectContaining({ grade: expect.objectContaining({ passed: false }) }));
  });

  it('accepts C++ and builds the server-owned C++20 harness', async () => {
    execute.mockResolvedValue({ status: 'failed', stdout: '', stderr: 'compile failed', durationMs: 20 });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ language: 'cpp', source: 'vector<int> findPair(vector<int>, int) { return {}; }' }),
    }), { params: Promise.resolve({ sessionId: 'session-1' }) });

    expect(response.status).toBe(200);
    expect(execute.mock.calls[0][0]).toMatchObject({ language: 'cpp' });
    expect(execute.mock.calls[0][0].source).toContain('#include <iostream>');
    expect(execute.mock.calls[0][0].source).toContain('int main()');
    expect(finishPracticeVerification).not.toHaveBeenCalled();
  });

  it('does not return a grade until its database write completes', async () => {
    const grade = passingGrade();
    execute.mockResolvedValue({ status: 'completed', stdout: `${CODE_GRADING_MARKER}${JSON.stringify(grade)}`, stderr: '', durationMs: 20 });
    let release!: (value: boolean) => void;
    finishPracticeVerification.mockImplementation(() => new Promise<boolean>(resolve => { release = resolve; }));
    const { POST } = await import('./route');
    let responded = false;
    const response = POST(verificationRequest(), { params: Promise.resolve({ sessionId: 'session-1' }) })
      .then(value => { responded = true; return value; });
    await vi.waitFor(() => expect(finishPracticeVerification).toHaveBeenCalled());
    expect(responded).toBe(false);
    release(true);
    expect((await response).status).toBe(200);
  });

  it('does not run the sandbox if request reservation cannot be persisted', async () => {
    beginPracticeVerification.mockRejectedValue(new Error('database unavailable'));
    const { POST } = await import('./route');
    const response = await POST(verificationRequest(), { params: Promise.resolve({ sessionId: 'session-1' }) });
    expect(response.status).toBe(500);
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not report success when a report cannot be saved or was superseded', async () => {
    execute.mockResolvedValue({ status: 'completed', stdout: `${CODE_GRADING_MARKER}${JSON.stringify(passingGrade())}`, stderr: '', durationMs: 20 });
    const { POST } = await import('./route');
    finishPracticeVerification.mockRejectedValueOnce(new Error('database unavailable'));
    const failed = await POST(verificationRequest(), { params: Promise.resolve({ sessionId: 'session-1' }) });
    expect(failed.status).toBe(500);
    expect(await failed.json()).not.toHaveProperty('grade');
    finishPracticeVerification.mockResolvedValueOnce(false);
    const superseded = await POST(verificationRequest(), { params: Promise.resolve({ sessionId: 'session-1' }) });
    expect(superseded.status).toBe(409);
    expect(await superseded.json()).not.toHaveProperty('grade');
  });
});

function passingGrade() {
  const tests = codeCheckLabels('pair-with-target-v1').map(name => ({ name, passed: true }));
  return { problemId: 'pair-with-target-v1', version: CODE_GRADING_VERSION, passed: true, passedCount: tests.length, totalCount: tests.length, tests };
}

function verificationRequest() {
  return new Request('http://localhost', { method: 'POST', body: JSON.stringify({ language: 'python', source: 'def find_pair(values, target): return [0, 1]' }) });
}
