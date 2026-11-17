import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), open: vi.fn() }));
vi.mock('@leetcode-app/database', () => ({
  SharedCodingRoomAccessError: class SharedCodingRoomAccessError extends Error {},
  SharedCodingRoomConflictError: class SharedCodingRoomConflictError extends Error {},
  SharedCodingRoomValidationError: class SharedCodingRoomValidationError extends Error {},
}));
vi.mock('@/lib/shared-coding-room-access', () => ({ readSharedCodingRoomData: mocks.access }));

const roomId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ roomId }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.open.mockResolvedValue({ id: roomId, status: 'open' });
  mocks.access.mockImplementation(async (operation: (repository: { open: typeof mocks.open }) => Promise<unknown>) => ({ status: 'authorized', data: await operation({ open: mocks.open }) }));
});

describe('shared coding room open boundary', () => {
  it('reopens an authorized closed room at the expected revision', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request(`http://localhost/api/shared-coding-rooms/${roomId}/open`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedControlRevision: 3 }) }), context);
    expect(response.status).toBe(200);
    expect(mocks.open).toHaveBeenCalledWith({ roomId, expectedControlRevision: 3 });
  });

  it('rejects invalid revisions before repository access', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request(`http://localhost/api/shared-coding-rooms/${roomId}/open`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedControlRevision: 0 }) }), context);
    expect(response.status).toBe(400);
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
