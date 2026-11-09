import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { CODE_OUTPUT_MARKER } from '@/lib/code-execution.server';
import { getPublicRunCases } from '@/lib/code-running';

const getPracticeOwner = vi.fn();
const getPracticeSessionHistory = vi.fn();
const execute = vi.fn();
const takeRateLimit = vi.fn();
vi.mock('@/lib/auth/session', () => ({ getPracticeOwner }));
vi.mock('@/lib/practice-api', () => ({ getPracticeSessionHistory }));
vi.mock('@/lib/sandbox/runtime', () => ({ createConfiguredSandbox: () => ({ execute }) }));
vi.mock('@/lib/rate-limit', () => ({ takeRateLimit }));
// Importing this writer from Run would fail the test before execution.
vi.mock('@/lib/practice-verification', () => { throw new Error('Run must not import verification writers'); });

const problemId = 'pair-with-target-v1';
function request(body: unknown = { language: 'typescript', source: 'function findPair() { return [1,2]; }', cases: getPublicRunCases(problemId) }) {
  return new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
}
const context = { params: Promise.resolve({ sessionId: 'session-1' }) };
beforeEach(() => {
  vi.resetAllMocks();
  process.env.CODE_EXECUTION_ENABLED = 'true';
  getPracticeOwner.mockResolvedValue({ kind: 'guest', id: 'guest-1' });
  getPracticeSessionHistory.mockResolvedValue({ session: { contentId: '20000000-0000-0000-0000-000000000001' } });
  takeRateLimit.mockResolvedValue({ allowed: true });
  execute.mockResolvedValue({ status: 'completed', stdout: `debug\n${CODE_OUTPUT_MARKER}${JSON.stringify({ problemId, outputs: [{ actual: [1,2] }] })}`, stderr: '', durationMs: 20, exitCode: 0 });
});

describe('/api/practice/sessions/[sessionId]/run', () => {
  it('executes only visible inputs for the owned session and never returns a trusted grade', async () => {
    const { POST } = await import('./route');
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body).toMatchObject({ run: { problemId, language: 'typescript', stdout: 'debug', cases: [{ id: 'example-1', actual: [1,2], passed: true }] } });
    expect(body).not.toHaveProperty('grade');
    expect(body).not.toHaveProperty('completed');
    expect(getPracticeSessionHistory).toHaveBeenCalledExactlyOnceWith({ owner: { kind: 'guest', id: 'guest-1' }, sessionId: 'session-1' });
    expect(execute.mock.calls[0][0].source).not.toContain('[3,3]');
    expect(takeRateLimit).toHaveBeenCalledExactlyOnceWith('verified-execution:guest:guest-1', { limit: 10, windowMs: 600000 });
  });
  it('accepts Java as an execution language and builds a Main/Solution harness', async () => {
    const { POST } = await import('./route');
    const response = await POST(request({ language: 'java', source: 'class Solution { int[] findPair(int[] values, int target) { return new int[]{1,2}; } }', cases: getPublicRunCases(problemId) }), context);
    expect(response.status).toBe(200);
    expect(execute.mock.calls[0][0]).toMatchObject({ language: 'java' });
    expect(execute.mock.calls[0][0].source).toContain('public class Main');
  });
  it('never executes another owner’s session', async () => {
    getPracticeSessionHistory.mockRejectedValue(new Error('Practice session not found'));
    const { POST } = await import('./route');
    const response = await POST(request(), context);
    expect(response.status).toBe(404);
    expect(execute).not.toHaveBeenCalled();
    expect(takeRateLimit).not.toHaveBeenCalled();
  });
  it('uses the content attached to the session and rejects caller-supplied problem/identity fields', async () => {
    const { POST } = await import('./route');
    const response = await POST(request({ language: 'typescript', source: 'x', problemId: 'other', ownerId: 'other', cases: getPublicRunCases(problemId) }), context);
    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it.each([
    { language: 'ruby', source: 'x', cases: getPublicRunCases(problemId) },
    { language: 'typescript', source: '', cases: getPublicRunCases(problemId) },
    { language: 'typescript', source: 'x'.repeat(100001), cases: getPublicRunCases(problemId) },
    { language: 'typescript', source: 'x', cases: [] },
    { language: 'typescript', source: 'x', cases: [{ id: 'x', input: 'unfinished', expected: '' }] },
  ])('rejects invalid requests before execution', async body => {
    const { POST } = await import('./route');
    const response = await POST(request(body), context);
    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
    expect(takeRateLimit).not.toHaveBeenCalled();
  });
  it('rejects oversized streamed requests', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: 'x'.repeat(140001) }), context);
    expect(response.status).toBe(413);
    expect(execute).not.toHaveBeenCalled();
  });
  it('returns retry-after from the shared Run/Submit execution budget', async () => {
    takeRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const { POST } = await import('./route');
    const response = await POST(request(), context);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(execute).not.toHaveBeenCalled();
  });
  it('returns compiler details without a trusted grade or completion', async () => {
    execute.mockResolvedValue({ status: 'failed', stdout: '', stderr: 'missing return', durationMs: 1 });
    const { POST } = await import('./route');
    const response = await POST(request(), context);
    expect(await response.json()).toMatchObject({ run: { stderr: 'missing return', cases: [{ passed: false, error: expect.any(String) }] } });
  });
  it('reports time limits and malformed results as failed runs', async () => {
    const { POST } = await import('./route');
    execute.mockResolvedValueOnce({ status: 'timed_out', stdout: '', stderr: '', durationMs: 3000 });
    expect(await (await POST(request(), context)).json()).toMatchObject({ run: { cases: [{ error: 'Execution exceeded the time limit.' }] } });
    execute.mockResolvedValueOnce({ status: 'completed', stdout: `${CODE_OUTPUT_MARKER}private malformed result`, stderr: '', durationMs: 1 });
    const body = await (await POST(request(), context)).json();
    expect(body.run.stdout).toBe('');
    expect(body.run.cases[0]).toHaveProperty('error');
  });
  it('reports unavailable execution without calling the provider', async () => {
    process.env.CODE_EXECUTION_ENABLED = 'false';
    const { POST } = await import('./route');
    expect((await POST(request(), context)).status).toBe(503);
    expect(execute).not.toHaveBeenCalled();
  });
});
