import 'server-only';
import type { QuestionReview } from '@leetcode-app/domain';

const reviewedAt = '2026-10-30T02:16:34.000Z';
const review = (finding: string): QuestionReview => Object.freeze({
  reviewerId: 'automated-curriculum-review-v2', reviewedAt,
  notes: `Independent automated content review: ${finding} Final option placement and key were checked. Teacher validation remains pending.`,
});

/** Explicit approvals for the independently solved versions; never auto-approve new candidates. */
export const expandedQuestionBankReviews: Readonly<Record<string, QuestionReview>> = Object.freeze({
  'pair-map-index-zero@1': review('Verified that a stored index 0 is a present complement despite being false in the stipulated language.'),
  'pair-map-key-equality@1': review('Verified that collision resolution distinguishes complete unequal keys within a shared bucket.'),
  'pair-preserve-source-indices@1': review('Sorted [1,4,6,8] independently; values 4 and 6 originate at positions 3 and 2.'),
  'pair-prefix-map-proof@1': review('Checked the prefix-map invariant at the later solution index; any earlier occurrence of the required value suffices.'),
  'window-valid-start-range@1': review('Derived 0 <= s <= n-k from s+k-1 <= n-1, including k=n.'),
  'window-final-entry-bound@1': review('Enumerated window sums 3,-3,4; right<n-1 omits the final incoming index.'),
  'window-fixed-length-feasibility@1': review('Enumerated the original contiguous sums -95 and -94; deleting a value changes feasibility.'),
  'window-prefix-range-query@1': review('Expanded both prefix sums and cancelled positions before s; both window endpoints remain included.'),
  'tree-depth-iterative-path-state@1': review('Checked nonempty branching trees; node-local path depth avoids accumulating sibling visits.'),
  'tree-depth-recursion-storage@1': review('Counted simultaneously live ancestor calls for balanced and chain shapes under the stated evaluation order.'),
  'tree-depth-one-child-shortcut@1': review('Traced the three-node right chain: the buggy root returns 1 while maximum node-counting depth is 3.'),
  'tree-depth-total-recursive-calls@1': review('Counted the initial call plus two calls created per non-null node, including n=0.'),
  'brackets-prefix-stack-trace@1': review('Traced all five characters: matched parentheses and square brackets pop, leaving only the outer brace.'),
  'brackets-invalid-prefix-cannot-recover@1': review('Verified the preceding-opener requirement; appending a suffix cannot repair an already unmatched closer.'),
  'brackets-maximum-live-stack@1': review('Counted m simultaneous unmatched openers before the first closer, distinct from final empty storage.'),
  'brackets-single-type-compression@1': review('Checked the nonnegative-prefix and final-zero criterion for one type, and mixed-type counterexample ([)].'),
  'stairs-empty-route-identity@1': review('Enumerated the two routes [1,1] and [2]; the recurrence requires ways(0)=1.'),
  'stairs-forbidden-state@1': review('Enumerated allowed routes [1,1,2,1] and [2,2,1]; both avoid landing on step 3.'),
  'stairs-memoized-state-count@1': review('Bounded arguments by 0..n and new computations by one per non-base state, using stated constant arithmetic costs.'),
  'stairs-modular-rolling-recurrence@1': review('Applied congruence under addition for every positive modulus, explicitly including reduced bases for M=1.'),
  'islands-count-traversal-starts@1': review('Used component partitioning: each complete fill consumes exactly the unvisited component containing its start.'),
  'islands-preserve-input-grid@1': review('Checked the caller-visible nonmutation contract; separate visited storage preserves original cell values.'),
  'islands-rectangular-neighbor-bounds@1': review('Checked lower and exclusive upper bounds independently for rectangular row and column dimensions.'),
  'islands-coordinate-key-identity@1': review('Proved disjoint row-major key intervals; (0,1) and (1,0) witness the sum-key collision.'),
  'tasks-include-isolated-vertices@1': review('Enumerated valid orders for A before B with isolated C; C must be initialized and included once.'),
  'tasks-wait-for-all-predecessors@1': review('Removed only A->C from incoming edges {A->C,B->C}; one prerequisite remains.'),
  'tasks-ready-choice-and-uniqueness@1': review('Verified either zero-indegree vertex can start a distinct completion because removing it preserves acyclicity.'),
  'tasks-duplicate-edge-accounting@1': review('Traced count 2 against a one-entry adjacency set; consistent relation deduplication restores one decrement.'),
  'two-pointers-sorted-input-contract@1': review('Traced the unsorted counterexample and found valid original positions 1 and 3; monotone elimination needs order.'),
  'two-pointers-distinct-positions-not-values@1': review('Checked [5,5] and [5]; strict position inequality permits equal-valued distinct positions only.'),
  'two-pointers-mixed-movement-trace@1': review('Traced sums 15,18,14,16 and successive left,right,left movements to positions 2 and 3.'),
  'two-pointers-count-equal-value-pairs@1': review('Enumerated the six unordered two-position subsets of four entries; values need not differ.'),
  'coin-change-zero-amount-base@1': review('Distinguished minimizing coin count from counting combinations; the empty construction uses zero coins.'),
  'coin-change-sentinel-transition@1': review('Evaluated the invalid transition -1+1=0 and checked why a missing predecessor cannot be extended.'),
  'coin-change-unlimited-loop-direction@1': review('Traced denomination 2 through target 4 in both directions; only the ascending pass reuses its newly reached state.'),
  'coin-change-reconstruct-optimal-choice@1': review('Verified explicit unlimited reuse, positive progress, and the optimal-predecessor equality that decreases count by one.'),
  'unique-presence-is-not-frequency@1': review('Counted [A,A,B] and [A,B,B] independently: equal presence sets require distinct answers 2 and 0.'),
  'unique-saturating-frequency-state@1': review('Checked that once-vs-at-least-twice saturation preserves count=1 eligibility and original scan order.'),
  'unique-online-candidate-front@1': review('Checked lazy removal against current-prefix frequencies; duplicate entries never regain eligibility as input grows.'),
  'unique-injective-relabeling@1': review('Verified injectivity preserves equality classes, their multiplicities, and positions, including no-unique output -1.'),
});
