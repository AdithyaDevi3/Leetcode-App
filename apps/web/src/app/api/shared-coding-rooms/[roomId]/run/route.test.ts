import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), source: vi.fn(), execute: vi.fn(), rateLimit: vi.fn() }));
vi.mock('@leetcode-app/database', () => ({
  SharedCodingRoomAccessError: class SharedCodingRoomAccessError extends Error {},
  SharedCodingRoomValidationError: class SharedCodingRoomValidationError extends Error {},
}));
vi.mock('@/lib/shared-coding-room-access', () => ({ readSharedCodingRoomData: mocks.access }));
vi.mock('@/lib/sandbox/runtime', () => ({ createConfiguredSandbox: () => ({ execute: mocks.execute }) }));
vi.mock('@/lib/rate-limit', () => ({ takeRateLimit: mocks.rateLimit }));

const roomId = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ roomId }) };
const request = () => new Request(`http://localhost/api/shared-coding-rooms/${roomId}/run`, { method: 'POST' });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CODE_EXECUTION_ENABLED = 'true';
  mocks.source.mockResolvedValue({ language: 'typescript', source: 'console.log("saved source")' });
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.execute.mockResolvedValue({ status: 'completed', stdout: 'saved source\u0000', stderr: '', exitCode: 0, durationMs: 11, limits: { timeoutMs: 3000, memoryMb: 256, outputBytes: 50000 } });
  mocks.access.mockImplementation(async (operation: (repository: unknown, actorId: string) => Promise<unknown>) => ({ status: 'authorized', data: await operation({ runnableSource: mocks.source }, 'learner-1') }));
});

describe('shared room Run boundary', () => {
  it('runs only server-selected saved source without grades or submissions', async () => {
    const { POST } = await import('./route');
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.source).toHaveBeenCalledWith(roomId);
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ language: 'typescript', source: 'console.log("saved source")' }));
    expect(mocks.rateLimit).toHaveBeenCalledWith('shared-room-run:learner-1', { limit: 10, windowMs: 600000 });
    const body = await response.json();
    expect(body).toMatchObject({ run: { stdout: 'saved source', status: 'completed' } });
    expect(body).not.toHaveProperty('grade');
    expect(body).not.toHaveProperty('submission');
  });

  it('does not execute when the user is rate limited or execution is disabled', async () => {
    const { POST } = await import('./route');
    mocks.rateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    expect((await POST(request(), context)).status).toBe(429);
    expect(mocks.execute).not.toHaveBeenCalled();
    process.env.CODE_EXECUTION_ENABLED = 'false';
    expect((await POST(request(), context)).status).toBe(503);
  });
});
