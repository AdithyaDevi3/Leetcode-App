import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), listInvitees: vi.fn() }));
vi.mock('@/lib/shared-coding-room-access', () => ({ readSharedCodingRoomData: mocks.access }));

const roomId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ roomId }) };
const request = () => new Request(`http://localhost/api/shared-coding-rooms/${roomId}/learners`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listInvitees.mockResolvedValue([{ id: '33333333-3333-4333-8333-333333333333', displayName: 'Class member' }]);
  mocks.access.mockImplementation(async (operation: (repository: unknown) => Promise<unknown>) => ({ status: 'authorized', data: await operation({ listInvitees: mocks.listInvitees }) }));
});

describe('shared coding room invitee roster HTTP boundary', () => {
  it('returns an owner-authorized, private roster only', async () => {
    const { GET } = await import('./route');
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ learners: [{ id: '33333333-3333-4333-8333-333333333333', displayName: 'Class member' }] });
    expect(mocks.listInvitees).toHaveBeenCalledWith(roomId);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });

  it('does not call the repository for unauthenticated or forbidden callers', async () => {
    const { GET } = await import('./route');
    for (const [status, expected] of [['unauthenticated', 401], ['forbidden', 403]] as const) {
      mocks.access.mockResolvedValueOnce({ status });
      expect((await GET(request(), context)).status).toBe(expected);
    }
    expect(mocks.listInvitees).not.toHaveBeenCalled();
  });
});
