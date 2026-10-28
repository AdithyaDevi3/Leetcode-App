import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), instructor: vi.fn(), session: vi.fn(), database: vi.fn(), close: vi.fn(), construct: vi.fn(),
  readLearner: vi.fn(), readInstructor: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ getSession: mocks.session }));
vi.mock('@/lib/admin/authorization', () => ({ readAdministrationData: mocks.admin }));
vi.mock('@/lib/instructor-access', () => ({ readInstructorData: mocks.instructor }));
vi.mock('@leetcode-app/database', () => ({
  createDatabaseClient: mocks.database,
  databaseConfigFromEnv: vi.fn(() => ({})),
  PostgresQuizAssignmentRepository: class {
    readLearnerQuiz = mocks.readLearner;
    readInstructorQuiz = mocks.readInstructor;
    constructor(database: unknown, principal: unknown) { mocks.construct(database, principal); }
  },
}));

const userId = '11111111-1111-4111-8111-111111111111';
const recipientId = '22222222-2222-4222-8222-222222222222';
const principal = { id: userId };
const database = { close: mocks.close };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.database.mockReturnValue(database);
  mocks.session.mockResolvedValue({ user: principal });
  mocks.admin.mockImplementation(async (_action, operation) => ({ status: 'authorized', data: await operation({}, principal, database) }));
  mocks.instructor.mockImplementation(async operation => ({ status: 'authorized', data: await operation({}, principal, database) }));
  mocks.readLearner.mockResolvedValue({ recipientId, releasedGrade: null });
  mocks.readInstructor.mockResolvedValue({ recipientId, grade: null });
});

describe('quiz server authorization selection', () => {
  it('uses class-management authorization and a separately scoped administrator principal for publication', async () => {
    const { readQuizAuthorData } = await import('./quiz-assignment.server');
    const operation = vi.fn(async (_repository, actor) => actor.id);
    await expect(readQuizAuthorData('admin', operation)).resolves.toEqual({ status: 'authorized', data: userId });
    expect(mocks.admin).toHaveBeenCalledWith('classes.manage', expect.any(Function));
    expect(mocks.construct).toHaveBeenCalledWith(database, { role: 'administrator', userId });
    expect(mocks.instructor).not.toHaveBeenCalled();
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it('uses the verified owning-instructor boundary for instructor publication', async () => {
    const { readQuizAuthorData } = await import('./quiz-assignment.server');
    await expect(readQuizAuthorData('teach', async (_repository, actor) => actor.id)).resolves.toEqual({ status: 'authorized', data: userId });
    expect(mocks.instructor).toHaveBeenCalledOnce();
    expect(mocks.construct).toHaveBeenCalledWith(database, { role: 'instructor', userId });
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('does not convert class-management authorization into private instructor grade access', async () => {
    const { readQuizInstructorData } = await import('./quiz-assignment.server');
    await expect(readQuizInstructorData(async (_repository, actor) => actor.id)).resolves.toEqual({ status: 'authorized', data: userId });
    expect(mocks.instructor).toHaveBeenCalledOnce();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.construct).toHaveBeenCalledWith(database, { role: 'instructor', userId });
  });

  it('propagates denied author/instructor access without constructing or invoking a quiz repository', async () => {
    const { readQuizAuthorData, readQuizInstructorData } = await import('./quiz-assignment.server');
    const operation = vi.fn();
    for (const status of ['unauthenticated', 'forbidden'] as const) {
      mocks.admin.mockResolvedValue({ status }); mocks.instructor.mockResolvedValue({ status });
      await expect(readQuizAuthorData('admin', operation)).resolves.toEqual({ status });
      await expect(readQuizAuthorData('teach', operation)).resolves.toEqual({ status });
      await expect(readQuizInstructorData(operation)).resolves.toEqual({ status });
    }
    expect(mocks.construct).not.toHaveBeenCalled(); expect(operation).not.toHaveBeenCalled();
  });

  it('derives learner identity only from the verified session and closes its owned database', async () => {
    const { readQuizLearnerData } = await import('./quiz-assignment.server');
    await expect(readQuizLearnerData(async (_repository, actor) => actor.id)).resolves.toEqual({ status: 'authorized', data: userId });
    expect(mocks.session).toHaveBeenCalledWith({ failOnAuthError: true });
    expect(mocks.construct).toHaveBeenCalledWith(database, { role: 'learner', userId });
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.instructor).not.toHaveBeenCalled();
  });

  it('does not open a database or call a learner operation for an absent session', async () => {
    mocks.session.mockResolvedValue(null);
    const { readQuizLearnerData } = await import('./quiz-assignment.server');
    const operation = vi.fn();
    await expect(readQuizLearnerData(operation)).resolves.toEqual({ status: 'unauthenticated' });
    expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.construct).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled(); expect(mocks.close).not.toHaveBeenCalled();
  });

  it('closes the learner database even if repository authorization or persistence fails', async () => {
    const { readQuizLearnerData } = await import('./quiz-assignment.server');
    const failure = new Error('Synthetic access or transaction failure');
    await expect(readQuizLearnerData(async () => { throw failure; })).rejects.toBe(failure);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('propagates session verification failures without opening persistence or treating them as guests', async () => {
    const failure = new Error('Synthetic auth service unavailable');
    mocks.session.mockRejectedValue(failure);
    const { readQuizLearnerData } = await import('./quiz-assignment.server');
    await expect(readQuizLearnerData(vi.fn())).rejects.toBe(failure);
    expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.construct).not.toHaveBeenCalled();
  });

  it('provides learner/instructor page helpers with the verified account ID and recipient-scoped read', async () => {
    const { readLearnerQuizAssignment, readInstructorQuizAssignment } = await import('./quiz-assignment.server');
    await expect(readLearnerQuizAssignment(recipientId)).resolves.toEqual({ status: 'authorized', data: { learnerId: userId, assignment: { recipientId, releasedGrade: null } } });
    await expect(readInstructorQuizAssignment(recipientId)).resolves.toEqual({ status: 'authorized', data: { instructorId: userId, assignment: { recipientId, grade: null } } });
    expect(mocks.readLearner).toHaveBeenCalledWith(recipientId);
    expect(mocks.readInstructor).toHaveBeenCalledWith(recipientId);
  });
});
