import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), join: vi.fn() }));
vi.mock('@/lib/shared-coding-room-access', () => ({ readSharedCodingRoomData: mocks.access }));

const roomId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ roomId }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.join.mockResolvedValue({ id: roomId });
  mocks.access.mockImplementation(async (operation: (repository: unknown) => Promise<unknown>) => ({ status: 'authorized', data: await operation({ join: mocks.join }) }));
});

describe('shared coding room join boundary', () => {
  it('joins an authorized class member to an open collaboration room', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request(`http://localhost/api/shared-coding-rooms/${roomId}/join`, { method: 'POST' }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: roomId });
    expect(mocks.join).toHaveBeenCalledWith(roomId);
  });

  it('does not call the repository without verified access', async () => {
    const { POST } = await import('./route');
    for (const [status, expected] of [['unauthenticated', 401], ['forbidden', 403]] as const) {
      mocks.access.mockResolvedValueOnce({ status });
      expect((await POST(new Request('http://localhost', { method: 'POST' }), context)).status).toBe(expected);
    }
    expect(mocks.join).not.toHaveBeenCalled();
  });
});
