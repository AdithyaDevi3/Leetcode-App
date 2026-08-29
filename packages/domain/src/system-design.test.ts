import { describe, expect, it } from 'vitest';
import { validateSystemDesignDocument } from './system-design';

describe('system design document', () => {
  it('accepts a complete connected design document', () => {
    expect(validateSystemDesignDocument({ title: 'Short URLs', requirements: ['redirect'], assumptions: ['public URLs'], components: [{ id: 'api', label: 'API', kind: 'service' }, { id: 'db', label: 'DB', kind: 'database' }], connections: [{ from: 'api', to: 'db' }], failureNotes: ['database failover'] })).toEqual([]);
  });
  it('rejects incomplete documents and unknown connections', () => {
    expect(validateSystemDesignDocument({ title: '', requirements: [], assumptions: [], components: [], connections: [{ from: 'api', to: 'db' }], failureNotes: [] })).toEqual(expect.arrayContaining(['Title is required', 'At least one component is required', 'Connection references an unknown component: api->db']));
  });
});
