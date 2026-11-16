import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), update: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock('@leetcode-app/database', () => ({
  SharedCodingRoomAccessError: class SharedCodingRoomAccessError extends Error {},
  SharedCodingRoomConflictError: class SharedCodingRoomConflictError extends Error {},
  SharedCodingRoomValidationError: class SharedCodingRoomValidationError extends Error {},
}));
vi.mock('@/lib/shared-coding-room-access', () => ({ readSharedCodingRoomData: mocks.access }));

const roomId = '11111111-1111-4111-8111-111111111111';
const room = { id: roomId, revision: 4, controlRevision: 3, source: 'const answer = 4;', language: 'typescript' };

function request(query = '') { return new Request(`http://localhost/api/shared-coding-rooms/${roomId}${query}`); }
const context = { params: Promise.resolve({ roomId }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockResolvedValue({ changed: false, revision: 4, controlRevision: 3 });
  mocks.read.mockResolvedValue(room);
  mocks.access.mockImplementation(async (operation: (repository: unknown) => Promise<unknown>) => ({ status: 'authorized', data: await operation({ readUpdate: mocks.update, read: mocks.read, saveSnapshot: mocks.save }) }));
});

describe('shared coding room HTTP boundary', () => {
  it('passes both content and interview control revisions to polling', async () => {
    const { GET } = await import('./route');
    const response = await GET(request('?afterRevision=4&afterControlRevision=3'), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ changed: false, revision: 4, controlRevision: 3 });
    expect(mocks.update).toHaveBeenCalledWith(roomId, 4, 3);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });

  it('uses a safe legacy control revision when the client does not send one', async () => {
    const { GET } = await import('./route');
    const response = await GET(request('?afterRevision=4'), context);
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(roomId, 4, 0);
  });

  it('rejects invalid poll revisions before repository access', async () => {
    const { GET } = await import('./route');
    for (const query of ['?afterRevision=-1', '?afterRevision=1.5', '?afterRevision=4&afterControlRevision=-1']) {
      expect((await GET(request(query), context)).status).toBe(400);
    }
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
