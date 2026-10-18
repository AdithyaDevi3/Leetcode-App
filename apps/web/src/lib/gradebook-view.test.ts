import { describe, expect, it } from 'vitest';
import type { ClassGradebook } from '@leetcode-app/database';

import { filterAndSortGradebook, gradebookAwaitingCellCount, gradebookCsv } from './gradebook-view';

const gradebook = {
  classroom: { id: 'class-1', name: 'Algorithms Studio' },
  assignments: [
    { id: 'a1', title: '=Unsafe title', dueOn: null, maxUnits: 1000, policyVersionId: 'p1' },
    { id: 'a2', title: 'Trees', dueOn: null, maxUnits: 1000, policyVersionId: 'p2' },
  ],
  learners: [
    { id: 'l1', displayName: 'Zoe', email: 'zoe@example.test', membership: 'included', cells: [
      { assignmentId: 'a1', recipientId: 'r1', state: 'published', earnedUnits: 900, maxUnits: 1000 },
      { assignmentId: 'a2', recipientId: 'r2', state: 'draft', earnedUnits: 700, maxUnits: 1000 },
    ] },
    { id: 'l2', displayName: '=Alex', email: null, membership: 'withdrawn', cells: [
      { assignmentId: 'a1', recipientId: 'r3', state: 'unavailable', earnedUnits: null, maxUnits: 1000 },
      { assignmentId: 'a2', recipientId: 'r4', state: 'needs_review', earnedUnits: null, maxUnits: 1000 },
    ] },
    { id: 'l3', displayName: 'Bea', email: 'bea@example.test', membership: 'included', cells: [
      { assignmentId: 'a1', recipientId: 'r5', state: 'published', earnedUnits: 800, maxUnits: 1000 },
      { assignmentId: 'a2', recipientId: 'r6', state: 'published', earnedUnits: 1000, maxUnits: 1000 },
    ] },
  ],
  rows: [
    { learnerId: 'l1', publishedTotal: { earnedUnits: 900, possibleUnits: 1000, percentage: '90.00' }, finalizedTotal: null, coverage: { published: 1, applicable: 2, comparison: 2 }, exclusions: ['unpublished_grade'], rank: null },
    { learnerId: 'l2', publishedTotal: { earnedUnits: 0, possibleUnits: 0, percentage: null }, finalizedTotal: null, coverage: { published: 0, applicable: 2, comparison: 2 }, exclusions: ['awaiting_grade', 'withdrawn'], rank: null },
    { learnerId: 'l3', publishedTotal: { earnedUnits: 1800, possibleUnits: 2000, percentage: '90.00' }, finalizedTotal: { earnedUnits: 1800, possibleUnits: 2000, percentage: '90.00' }, coverage: { published: 2, applicable: 2, comparison: 2 }, exclusions: [], rank: 1 },
  ],
  calculationVersion: 'points-v1',
} satisfies ClassGradebook;

describe('gradebook view', () => {
  it('counts actionable cells rather than affected learners', () => {
    expect(gradebookAwaitingCellCount(gradebook)).toBe(3);
  });

  it('searches, filters, and sorts without mutating the snapshot', () => {
    expect(filterAndSortGradebook(gradebook, 'bea@', 'all', 'learner').map(row => row.learner.id)).toEqual(['l3']);
    expect(filterAndSortGradebook(gradebook, '', 'needs_attention', 'learner').map(row => row.learner.id)).toEqual(['l2', 'l1']);
    expect(filterAndSortGradebook(gradebook, '', 'ranked', 'rank').map(row => row.learner.id)).toEqual(['l3']);
    expect(filterAndSortGradebook(gradebook, '', 'all', 'total_desc').map(row => row.learner.id)).toEqual(['l3', 'l1', 'l2']);
    expect(gradebook.learners[0].displayName).toBe('Zoe');
  });

  it('exports the current view and neutralizes spreadsheet formulas', () => {
    const csv = gradebookCsv(gradebook, filterAndSortGradebook(gradebook, '=alex', 'all', 'learner'));
    expect(csv).toContain('"\'=Unsafe title"');
    expect(csv).toContain('"\'=Alex"');
    expect(csv).not.toContain('"Zoe"');
  });
});
