import 'server-only';
import {
  freezeQuestionVersion, questionVersionKey, reviewQuestionVersion,
  type QuestionDifficulty, type QuestionOption, type QuestionReview, type QuestionVersion,
} from '@leetcode-app/domain';
import { expandedQuestionBankCandidates } from './question-bank-expansion.server';
import { expandedQuestionBankReviews } from './question-bank-expansion-review.server';

const authoredAt = '2026-10-26T15:25:41.000Z';
const authorId = 'automated-curriculum-author-v1';
type Candidate = {
  questionId: string; title: string; prompt: string; difficulty: QuestionDifficulty;
  activityId: string; conceptIds: string[]; options: QuestionOption[]; correctOptionId: string; explanation: string;
};
const option = (id: string, text: string, misconception?: string): QuestionOption => ({ id, text, misconceptionTags: misconception ? [misconception] : [] });
const candidate = (input: Candidate): QuestionVersion => freezeQuestionVersion({
  questionId: input.questionId, version: 1, versionId: questionVersionKey(input.questionId, 1),
  kind: 'multiple_choice', status: 'in_review', title: input.title, prompt: input.prompt,
  difficulty: input.difficulty, activityIds: [input.activityId], conceptIds: input.conceptIds,
  options: input.options, correctOptionId: input.correctOptionId, explanation: input.explanation,
  provenance: { kind: 'original', authorId, authoredAt }, review: null,
});

/** Original authored versions. Independent automated review is recorded separately below. */
export const questionBankCandidates: readonly QuestionVersion[] = Object.freeze([
  candidate({
    questionId: 'pair-distinct-indices', title: 'Avoid reusing the current index', difficulty: 'foundation',
    activityId: 'pair-with-target-v1', conceptIds: ['hash-maps', 'complement-reasoning'],
    prompt: 'Pair With Target must return two distinct indices. While scanning left to right with a map of previously seen values, which order prevents a single value 4 from incorrectly matching itself when the target is 8?',
    options: [option('a', 'Store the current value and index, then search for its complement.', 'self-matching-index'), option('b', 'Search the existing map for the complement, then store the current value and index.'), option('c', 'Return the current index twice whenever the current value is half the target.', 'self-matching-index'), option('d', 'Ignore every value that is half the target, even if it occurs twice.', 'discarding-valid-duplicates')],
    correctOptionId: 'b', explanation: 'Searching before insertion ensures every index found in the map belongs to an earlier position. Two separate occurrences of 4 can still form a valid pair, while a single occurrence cannot match itself.',
  }),
  candidate({
    questionId: 'pair-hash-map-cost', title: 'Account for the map', difficulty: 'intermediate',
    activityId: 'pair-with-target-v1', conceptIds: ['hash-maps', 'complexity-analysis'],
    prompt: 'A Pair With Target solution scans n values once and stores previously seen values in a hash map. Assuming expected constant-time map lookup and insertion, what expected running time and worst-case auxiliary storage should be reported?',
    options: [option('a', 'O(n) scan time and O(1) auxiliary storage.', 'ignoring-map-storage'), option('b', 'O(n²) scan time and O(n) auxiliary storage.', 'counting-lookup-as-full-scan'), option('c', 'O(n) expected scan time and O(n) auxiliary storage.'), option('d', 'O(log n) scan time and O(1) auxiliary storage.', 'assuming-binary-search')],
    correctOptionId: 'c', explanation: 'The scan may inspect every value, performing a constant expected amount of map work per value. If no pair is found until the end, the map can contain a number of entries proportional to n.',
  }),
  candidate({
    questionId: 'window-incremental-sum', title: 'Move a fixed-size window', difficulty: 'foundation',
    activityId: 'max-window-sum-v1', conceptIds: ['sliding-window', 'incremental-state'],
    prompt: 'For values [2, -1, 4, 3] and window length 2, the first window [2, -1] has sum 1. Which update correctly computes the sum of the next window [-1, 4]?',
    options: [option('a', '1 - 2 + 4 = 3.'), option('b', '1 + 4 = 5.', 'forgetting-outgoing-value'), option('c', '1 - (-1) + 4 = 6.', 'removing-wrong-boundary'), option('d', '1 - 4 + 2 = -1.', 'reversing-window-update')],
    correctOptionId: 'a', explanation: 'The next window keeps -1, removes the outgoing 2, and adds the incoming 4. Subtracting the outgoing value and adding the incoming value updates the sum in constant time.',
  }),
  candidate({
    questionId: 'window-negative-initialization', title: 'Handle all-negative windows', difficulty: 'foundation',
    activityId: 'max-window-sum-v1', conceptIds: ['sliding-window', 'edge-cases'],
    prompt: 'Max Window Sum must choose exactly 2 consecutive values from [-5, -2, -8]. Which initialization makes the best sum start as an actual valid length-2 window sum, including when every value is negative?',
    options: [option('a', 'Initialize the best sum to 0 and replace it only with a larger sum.', 'assuming-nonnegative-answer'), option('b', 'Initialize the best sum to the largest single value, -2.', 'ignoring-fixed-window-length'), option('c', 'Initialize the best sum to the total of all values, -15.', 'using-entire-array-window'), option('d', 'Initialize the best sum to the first valid window sum, -7.')],
    correctOptionId: 'd', explanation: 'The valid windows have sums -7 and -10, so the answer is -7. Initializing from a valid length-2 window keeps the best score feasible, including when every value is negative.',
  }),
  candidate({
    questionId: 'tree-depth-empty-base', title: 'Define the empty-tree depth', difficulty: 'foundation',
    activityId: 'tree-max-depth-v1', conceptIds: ['tree-recursion', 'base-cases'],
    prompt: 'Tree Max Depth counts nodes on the longest root-to-leaf path. A one-node tree has depth 1. What should depth(null) return so that depth(node) = 1 + max(depth(left), depth(right)) works?',
    options: [option('a', '1, because every recursive call counts as a node.', 'counting-null-as-node'), option('b', '0, because an empty subtree contains no nodes.'), option('c', '-1, because null is one level before a leaf.', 'mixing-edge-and-node-depth'), option('d', 'The depth of the other child.', 'base-case-depends-on-sibling')],
    correctOptionId: 'b', explanation: 'An empty subtree contributes zero nodes. A leaf therefore has depth 1 + max(0, 0) = 1. Returning -1 would instead fit an edge-counting convention, which this question does not use.',
  }),
  candidate({
    questionId: 'tree-depth-combine-branches', title: 'Combine child depths', difficulty: 'foundation',
    activityId: 'tree-max-depth-v1', conceptIds: ['tree-recursion', 'divide-and-combine'],
    prompt: 'The left subtree of a node has node-counting depth 2 and the right subtree has depth 5. What is the depth of the tree rooted at this node?',
    options: [option('a', '7, by adding the two child depths.', 'summing-independent-branches'), option('b', '5, by taking the larger child depth without counting this node.', 'omitting-current-node'), option('c', '6, by adding this node to the larger child depth.'), option('d', '3, by adding this node to the smaller child depth.', 'using-shortest-path')],
    correctOptionId: 'c', explanation: 'A root-to-leaf path follows one child branch at each node. The longest path follows the depth-5 child, and the current node adds one more node, for a total of 6.',
  }),
  candidate({
    questionId: 'brackets-matching-types', title: 'Check nesting as well as counts', difficulty: 'foundation',
    activityId: 'balanced-brackets-v1', conceptIds: ['stack-state', 'nesting'],
    prompt: 'Why is the bracket string "([)]" invalid even though the counts of each opening and closing bracket type match?',
    options: [option('a', 'The first closing parenthesis does not match the most recent unmatched opener, which is a square bracket.'), option('b', 'Every valid bracket string must use only one bracket type.', 'forbidding-mixed-types'), option('c', 'An equal number of openers and closers is enough, so the string is valid.', 'checking-counts-without-nesting'), option('d', 'The string is invalid only because its length is even.', 'confusing-parity-with-validity')],
    correctOptionId: 'a', explanation: 'The stack records unmatched openers in nesting order. When ) arrives, the top opener is [, so the types conflict. Equal counts do not establish correctly nested pairs.',
  }),
  candidate({
    questionId: 'brackets-leftover-openers', title: 'Inspect the final stack state', difficulty: 'foundation',
    activityId: 'balanced-brackets-v1', conceptIds: ['stack-state', 'edge-cases'],
    prompt: 'A stack-based validator has scanned "([]" without seeing a mismatched closing bracket. The stack still contains "(". What should it return?',
    options: [option('a', 'True, because every closing bracket encountered had a match.', 'ignoring-unclosed-openers'), option('b', 'True, because a nonempty stack proves an opener was present.', 'treating-leftovers-as-success'), option('c', 'False only if the input contains more than one bracket type.', 'forbidding-mixed-types'), option('d', 'False, because a valid completed scan must leave no unmatched openers.')],
    correctOptionId: 'd', explanation: 'Matching each encountered closer is necessary but insufficient. A nonempty stack at the end records openers that never received matching closers, so the full string is invalid.',
  }),
  candidate({
    questionId: 'stairs-count-ordered-paths', title: 'Count ordered step sequences', difficulty: 'foundation',
    activityId: 'climb-stairs-v1', conceptIds: ['dynamic-programming', 'recurrence'],
    prompt: 'A stairway has 4 steps. Each move climbs exactly 1 or 2 steps, and different move orders count as different ways. How many ways reach the top?',
    options: [option('a', '3.', 'treating-sequences-as-unordered'), option('b', '5.'), option('c', '4.', 'assuming-linear-way-count'), option('d', '8.', 'doubling-every-level')],
    correctOptionId: 'b', explanation: 'The five move sequences are 1-1-1-1, 1-1-2, 1-2-1, 2-1-1, and 2-2. Equivalently, ways(4) = ways(3) + ways(2) = 3 + 2.',
  }),
  candidate({
    questionId: 'stairs-preserve-rolling-state', title: 'Preserve both previous counts', difficulty: 'intermediate',
    activityId: 'climb-stairs-v1', conceptIds: ['recurrence', 'rolling-state'],
    prompt: 'Before a rolling-state update, previous = ways(n-2) and current = ways(n-1). Which simultaneous assignment computes the next pair without losing an old value?',
    options: [option('a', '(previous, current) = (previous + current, current).', 'updating-wrong-state'), option('b', '(previous, current) = (current, current + current).', 'overwriting-recurrence-input'), option('c', '(previous, current) = (current, previous + current).'), option('d', '(previous, current) = (previous, previous + current).', 'not-advancing-rolling-state')],
    correctOptionId: 'c', explanation: 'The next previous count is the old current count. The next current count is the sum of both old counts. Simultaneous assignment, or an explicit temporary variable, preserves both inputs until the sum has been computed.',
  }),
  candidate({
    questionId: 'islands-four-direction-connectivity', title: 'Determine grid connectivity', difficulty: 'foundation',
    activityId: 'island-count-v1', conceptIds: ['graph-traversal', 'grid-connectivity'],
    prompt: 'Island Count connects land only through up, down, left, and right neighbors. How many islands are in the grid [[1, 0], [0, 1]], where 1 is land and 0 is water?',
    options: [option('a', '2.'), option('b', '1, because the land cells touch diagonally.', 'using-diagonal-connectivity'), option('c', '0, because an island must contain at least two land cells.', 'discarding-single-cell-islands'), option('d', '4, because every grid cell forms an island.', 'counting-water-as-land')],
    correctOptionId: 'a', explanation: 'The two land cells are diagonal neighbors, not four-direction neighbors. No allowed land path connects them, and each individual land cell is a valid island.',
  }),
  candidate({
    questionId: 'islands-mark-when-enqueued', title: 'Avoid repeated frontier entries', difficulty: 'intermediate',
    activityId: 'island-count-v1', conceptIds: ['graph-traversal', 'visited-state'],
    prompt: 'In breadth-first traversal of one island, several frontier cells may discover the same land neighbor. Which rule ensures a reachable land cell is enqueued at most once?',
    options: [option('a', 'Mark a cell visited only when it is removed from the queue.', 'marking-visited-too-late'), option('b', 'Wait until the entire island has been processed before marking its cells.', 'delaying-visited-until-component-end'), option('c', 'Record visited water cells, but never record visited land cells.', 'tracking-the-wrong-cells'), option('d', 'Mark the start cell when enqueuing it, and mark each unvisited land neighbor before enqueuing it.')],
    correctOptionId: 'd', explanation: 'Marking at enqueue time makes a queued cell immediately unavailable to later discoveries. Marking only when dequeuing can still prevent repeated processing with additional checks, but it allows the same cell to enter the queue multiple times.',
  }),
  candidate({
    questionId: 'tasks-respect-prerequisite-order', title: 'Read dependency direction', difficulty: 'foundation',
    activityId: 'task-order-v1', conceptIds: ['topological-sort', 'queue-processing'],
    prompt: 'Task A must finish before task B, and task A must finish before task C. There is no dependency between B and C. Which complete order respects these prerequisites?',
    options: [option('a', 'B, A, C.', 'reversing-dependency-order'), option('b', 'A, C, B.'), option('c', 'C, B, A.', 'placing-prerequisite-last'), option('d', 'B, C, A.', 'placing-prerequisite-last')],
    correctOptionId: 'b', explanation: 'A must precede both B and C. Once A is complete, either B or C may follow. A, C, B is one valid order; a topological ordering need not be unique.',
  }),
  candidate({
    questionId: 'tasks-detect-residual-cycle', title: 'Interpret an incomplete topological scan', difficulty: 'intermediate',
    activityId: 'task-order-v1', conceptIds: ['topological-sort', 'cycle-detection'],
    prompt: 'A finite directed dependency graph includes every task and every dependency endpoint. Kahn’s algorithm repeatedly processes zero-indegree tasks and removes their outgoing edges. The queue becomes empty while some tasks remain unprocessed. What does this establish?',
    options: [option('a', 'The unprocessed tasks may be appended in any order.', 'ignoring-unmet-prerequisites'), option('b', 'The algorithm has found the unique valid task order.', 'assuming-unique-topological-order'), option('c', 'The remaining dependency graph contains a directed cycle.'), option('d', 'A task with zero outgoing edges must always be processed first.', 'confusing-indegree-with-outdegree')],
    correctOptionId: 'c', explanation: 'Every unprocessed vertex has a remaining incoming edge. Following such predecessors in a finite remaining graph must revisit a vertex, forming a directed cycle. Those cyclic prerequisites prevent a complete valid ordering.',
  }),
  candidate({
    questionId: 'two-pointers-increase-small-sum', title: 'Move the boundary that can help', difficulty: 'foundation',
    activityId: 'two-sum-window-v1', conceptIds: ['two-pointers', 'boundary-movement'],
    prompt: 'In the sorted ascending array [1, 3, 5, 9], a two-pointer pair search targets 12. The pointers currently select 1 and 9, whose sum is 10. Which next move uses the sorted order correctly?',
    options: [option('a', 'Move the left pointer right, from 1 to 3.'), option('b', 'Move the right pointer left, from 9 to 5.', 'decreasing-an-already-small-sum'), option('c', 'Move both pointers inward at once.', 'discarding-unexamined-pairs'), option('d', 'Stop, because an initial sum below the target proves no pair exists.', 'stopping-before-boundary-search')],
    correctOptionId: 'a', explanation: 'The sum is too small. Keeping 1 and moving the right pointer left cannot increase it, so 1 can be discarded. Advancing the left pointer gives 3 + 9 = 12 without discarding that possible match.',
  }),
  candidate({
    questionId: 'two-pointers-search-cost', title: 'Bound pointer movement', difficulty: 'intermediate',
    activityId: 'two-sum-window-v1', conceptIds: ['two-pointers', 'ordered-search', 'complexity-analysis'],
    prompt: 'The input array is already sorted and supports constant-time indexed reads. A pair search uses two indices moving only inward, with no copying or auxiliary collection. What are its worst-case search time and auxiliary space?',
    options: [option('a', 'O(n²) time and O(1) space.', 'multiplying-monotone-pointer-movements'), option('b', 'O(log n) time and O(n) space.', 'mistaking-two-pointers-for-binary-search'), option('c', 'O(n) time and O(n) space.', 'inventing-an-auxiliary-collection'), option('d', 'O(n) time and O(1) space.')],
    correctOptionId: 'd', explanation: 'Each iteration moves a boundary inward, so the total number of pointer moves is linear in the array length. The search retains only the indices and a constant number of temporary values. Sorting cost is excluded because the input is already sorted.',
  }),
  candidate({
    questionId: 'coin-change-greedy-counterexample', title: 'Choose a minimum coin combination', difficulty: 'foundation',
    activityId: 'coin-change-lite-v1', conceptIds: ['dynamic-programming', 'optimization'],
    prompt: 'There is an unlimited supply of coins with values [1, 3, 4]. What is the minimum number of coins needed to make amount 6 exactly?',
    options: [option('a', '1.', 'assuming-an-unavailable-denomination'), option('b', '2.'), option('c', '3, by always taking the largest fitting coin first.', 'assuming-greedy-is-always-optimal'), option('d', '6, by using only value-1 coins.', 'ignoring-larger-denominations')],
    correctOptionId: 'b', explanation: 'Two value-3 coins make 6. No single available coin has value 6, so two is minimal. Greedy selection of 4 followed by two value-1 coins uses three coins and is not optimal for these denominations.',
  }),
  candidate({
    questionId: 'coin-change-unreachable-state', title: 'Evaluate a coin-change result', difficulty: 'foundation',
    activityId: 'coin-change-lite-v1', conceptIds: ['dynamic-programming', 'recurrence', 'edge-cases'],
    prompt: 'Coin Change Lite returns the minimum coin count, or -1 if an amount cannot be formed. With an unlimited supply of value-2 coins, what should it return for amount 3?',
    options: [option('a', '0, because no valid combination was found.', 'using-zero-for-unreachable'), option('b', '1, because a value-2 coin gets close to the amount.', 'accepting-an-inexact-amount'), option('c', '-1, because no exact combination exists.'), option('d', '3, because the amount itself is always a valid coin count.', 'confusing-amount-with-coin-count')],
    correctOptionId: 'c', explanation: 'Every sum of value-2 coins is even, so amount 3 is unreachable. Zero coins is the valid answer for amount 0, not a substitute for an unreachable positive amount. An unreachable final dynamic-programming state maps to -1.',
  }),
  candidate({
    questionId: 'unique-index-original-order', title: 'Preserve the original ordering', difficulty: 'foundation',
    activityId: 'first-unique-index-v1', conceptIds: ['frequency-counting', 'stable-ordering'],
    prompt: 'First Unique Index returns the zero-based index of the earliest value occurring exactly once. What should it return for [5, 2, 5, 7, 2, 9]?',
    options: [option('a', '3.'), option('b', '5, because 9 also occurs exactly once.', 'returning-last-unique-value'), option('c', '0, because 5 is encountered first.', 'ignoring-later-duplicates'), option('d', '1, because 2 is the smallest value in the array.', 'sorting-instead-of-preserving-order')],
    correctOptionId: 'a', explanation: 'Both 5 and 2 occur twice. The value 7 occurs once at index 3, before the other unique value 9 at index 5. The required order is the original array order, not numeric order or map storage order.',
  }),
  candidate({
    questionId: 'unique-count-before-selecting', title: 'Decide when uniqueness is known', difficulty: 'intermediate',
    activityId: 'first-unique-index-v1', conceptIds: ['hash-maps', 'frequency-counting', 'stable-ordering'],
    prompt: 'Why can a frequency-based First Unique Index solution not return index 0 immediately after seeing the first value in [8, 3, 8]?',
    options: [option('a', 'Any first array value must appear at least twice.', 'assuming-first-value-duplicates'), option('b', 'The answer must always be the middle index.', 'assuming-position-determines-uniqueness'), option('c', 'A frequency map automatically sorts values, so the array must be sorted first.', 'assuming-map-provides-required-order'), option('d', 'A later occurrence can make that value non-unique; count all values, then scan the original order for count 1.')],
    correctOptionId: 'd', explanation: 'At its first occurrence, 8 has only a provisional count. The last element raises that count to two. Counting the full input before an ordered selection pass identifies 3 at index 1 as the earliest unique value.',
  }),
  ...expandedQuestionBankCandidates,
]);

// These exact versions passed independent automated content review. New versions
// require their own review entry; this record does not establish teacher validation.
const approvedVersionIds = [
  'pair-distinct-indices@1', 'pair-hash-map-cost@1',
  'window-incremental-sum@1', 'window-negative-initialization@1',
  'tree-depth-empty-base@1', 'tree-depth-combine-branches@1',
  'brackets-matching-types@1', 'brackets-leftover-openers@1',
  'stairs-count-ordered-paths@1', 'stairs-preserve-rolling-state@1',
  'islands-four-direction-connectivity@1', 'islands-mark-when-enqueued@1',
  'tasks-respect-prerequisite-order@1', 'tasks-detect-residual-cycle@1',
  'two-pointers-increase-small-sum@1', 'two-pointers-search-cost@1',
  'coin-change-greedy-counterexample@1', 'coin-change-unreachable-state@1',
  'unique-index-original-order@1', 'unique-count-before-selecting@1',
] as const;
const approvedReviews: Readonly<Record<string, QuestionReview>> = Object.freeze({ ...expandedQuestionBankReviews, ...Object.fromEntries(approvedVersionIds.map(versionId => [versionId, Object.freeze({
  reviewerId: 'automated-curriculum-review-v1', reviewedAt: '2026-10-26T15:31:28.000Z',
  notes: 'Independent automated content review; corrected negative-window initialization ambiguity and expected-time wording. Teacher validation remains pending.',
})])) });
const reviewedQuestions: readonly QuestionVersion[] = Object.freeze(questionBankCandidates.flatMap(question => {
  const review = approvedReviews[question.versionId];
  return review ? [reviewQuestionVersion(question, review)] : [];
}));

export function getQuestionBankCandidates(): readonly QuestionVersion[] { return questionBankCandidates; }
export function getReviewedQuestionVersions(): readonly QuestionVersion[] { return reviewedQuestions; }
export function getReviewedQuestionVersion(versionId: string): QuestionVersion | null {
  return reviewedQuestions.find(question => question.versionId === versionId) ?? null;
}
