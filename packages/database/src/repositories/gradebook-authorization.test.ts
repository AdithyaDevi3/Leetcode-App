import { describe, expect, it, vi } from 'vitest';
import { authorizeGradebookActor } from './gradebook-authorization.js';

const actorId = '11111111-1111-4111-8111-111111111111';

describe('authorizeGradebookActor', () => {
  it('allows an administrator to use a learner principal', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ role: 'admin' }] });
    await expect(authorizeGradebookActor({ query } as never, { userId: actorId, role: 'learner' })).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith('SELECT role FROM users WHERE id=$1 ', [actorId]);
  });

  it('does not allow an instructor to use a learner principal', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ role: 'instructor' }] });
    await expect(authorizeGradebookActor({ query } as never, { userId: actorId, role: 'learner' })).rejects.toThrow();
  });
});
