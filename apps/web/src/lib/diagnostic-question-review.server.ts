import 'server-only';
import type { QuestionReview } from '@leetcode-app/domain';

const review = (finding: string): QuestionReview => Object.freeze({
  reviewerId: 'automated-curriculum-review-v2', reviewedAt: '2026-10-30T02:16:34.000Z',
  notes: `Independent automated content review: ${finding} Final option placement and key were checked. Teacher validation remains pending.`,
});

/** Dedicated practice questions are reviewed separately from assignable class questions. */
export const diagnosticQuestionReviews: Readonly<Record<string, QuestionReview>> = Object.freeze({
  'diagnostic-pair-needed-value-map@1': review('Reconstructed needed keys 11 and 5; arrival 5 matches index 1 containing 10, yielding distinct positions 1 and 2.'),
  'diagnostic-window-earliest-tie@1': review('Compared equal maxima encountered in increasing start order; strict improvement preserves the earliest start.'),
  'diagnostic-tree-child-swap-invariance@1': review('Verified child swaps preserve parent-child connections and every root-to-leaf path length, including empty branches.'),
  'diagnostic-brackets-adjacent-reduction@1': review('Executed each adjacent-pair deletion: [()]{} -> []{} -> {} -> empty.'),
  'diagnostic-stairs-last-move-partition@1': review('Proved exhaustive disjoint last-move classes and the reversible extension from predecessor routes.'),
  'diagnostic-islands-traversal-versus-scan@1': review('Traced the five-cell component and right/down-only fills; reaching top-right from top-left requires an upward step.'),
  'diagnostic-tasks-output-permutation@1': review('Compared required vertex multiplicities with [A,A,C]; length and edge order miss duplicate A and absent B.'),
  'diagnostic-two-arrays-pointer-bounds@1': review('Checked the singleton arrays: their valid positions both have numeric index 0 but belong to distinct arrays.'),
  'diagnostic-coins-scaled-unit-count@1': review('Enumerated [2,2,3] as a minimum three-coin construction; positive scaling gives a count-preserving bijection.'),
  'diagnostic-unique-append-fresh-value@1': review('Verified old frequencies remain ineligible and the new singleton is placed at index n, also when n=0.'),
});
