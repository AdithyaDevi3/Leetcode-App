import { beforeEach, describe, expect, it, vi } from 'vitest';

const readClassGradebook = vi.fn();
const withInstructorGradebook = vi.fn(async (operation: (repository: { readClassGradebook: typeof readClassGradebook }) => unknown) => operation({ readClassGradebook }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/instructor-gradebook', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/instructor-gradebook')>();
  return { ...original, withInstructorGradebook };
});

const classId = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ classId }) };

describe('class gradebook route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the owner-scoped gradebook snapshot', async () => {
    const snapshot = { classroom: { id: classId, name: 'Algorithms' }, assignments: [], learners: [], rows: [], calculationVersion: 'points-v1' };
    readClassGradebook.mockResolvedValue(snapshot);
    const { GET } = await import('./route');
    const response = await GET(new Request(`http://localhost/api/instructor/classes/${classId}/gradebook`), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(snapshot);
    expect(readClassGradebook).toHaveBeenCalledWith(classId);
  });

  it('rejects unexpected query parameters before repository access', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request(`http://localhost/api/instructor/classes/${classId}/gradebook?include=responses`), context);
    expect(response.status).toBe(400);
    expect(readClassGradebook).not.toHaveBeenCalled();
  });
});
