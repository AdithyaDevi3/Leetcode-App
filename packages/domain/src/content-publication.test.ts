import { describe, expect, it } from 'vitest';
import { validatePublication } from './content-publication';

describe('content publication validation', () => {
  it('accepts reviewed content with provenance and increasing version', () => {
    expect(validatePublication({ version: 2, previousVersion: 1, title: 'Lesson', body: 'Original lesson', provenance: 'Internal author', review: { reviewerId: 'reviewer', approvedAt: '2026-08-29T00:00:00Z', rightsApproved: true } })).toEqual([]);
  });
  it('rejects unpublished or legally incomplete content', () => {
    expect(validatePublication({ version: 1, title: '', body: '', provenance: '', review: { reviewerId: '', approvedAt: '', rightsApproved: false } })).toEqual(expect.arrayContaining(['Title and body are required', 'Provenance is required', 'Reviewer approval is required', 'Rights approval is required']));
  });
});
