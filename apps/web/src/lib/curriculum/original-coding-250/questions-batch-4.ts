import 'server-only';

import {
  freezeOriginalCodingQuestion,
  type CodingQuestionDifficulty,
  type InterviewCurriculumTopic,
  type OriginalCodingQuestion,
} from '@leetcode-app/domain';

type QuestionInput = Omit<OriginalCodingQuestion, 'provenance' | 'reviewerId' | 'status'>;

const question = (input: QuestionInput): OriginalCodingQuestion => freezeOriginalCodingQuestion({
  ...input,
  provenance: { kind: 'original', authorId: 'original-coding-250-author-batch-4', authoredAt: '2026-11-16T22:00:00.000Z' },
  status: 'in_review',
  reviewerId: null,
});

const item = (
  id: string,
  topic: InterviewCurriculumTopic,
  difficulty: CodingQuestionDifficulty,
  title: string,
  prompt: string,
  functionName: string,
  functionSignature: string,
  input: string,
  output: string,
  note: string,
  starterDraft: string,
  conceptIds: string[],
): OriginalCodingQuestion => question({
  id,
  topic,
  difficulty,
  estimatedMinutes: difficulty === 'foundation' ? 16 : difficulty === 'intermediate' ? 24 : 32,
  title,
  prompt,
  functionName,
  functionSignature,
  constraints: ['Use the stated function contract.', 'State the time and extra-space cost.', 'Keep input values unchanged unless the prompt permits changes.'],
  examples: [{ input, output, note }],
  starterDraft,
  conceptIds,
});

/** Original coding questions. Review is required before learner publication. */
export const originalCoding250Batch4: readonly OriginalCodingQuestion[] = Object.freeze([
  item('pair-count-divisible-total', 'arrays-hashing', 'foundation', 'Count divisible pair totals', 'Return the number of index pairs whose values have a sum divisible by divisor.', 'countDivisiblePairs', 'values: number[], divisor: number', 'values = [2, 4, 1, 5, 3], divisor = 3', '4', 'The valid pairs are indices (0,2), (0,3), (1,4), and (2,3).', 'Count each remainder seen so far. For a value remainder r, add the count of the complementary remainder before storing r.', ['remainder-counting', 'hash-maps']),
  item('range-change-requests', 'arrays-hashing', 'intermediate', 'Apply range change requests', 'Each request adds delta to every value from left through right. Return the final value list after all requests.', 'applyRangeChanges', 'length: number, requests: Array<[number, number, number]>', 'length = 5, requests = [[1, 3, 4], [0, 1, -2]]', '[-2, 2, 4, 4, 0]', 'The first request adds four at indices 1 through 3.', 'Create a difference list with one extra position. Add delta at left and subtract it after right. Build the final values with a running sum.', ['difference-array', 'prefix-sums']),
  item('least-common-label', 'arrays-hashing', 'intermediate', 'Find the least common label', 'Return the first value from left that also occurs in right. Return null when the lists share no value.', 'firstSharedLabel', 'left: string[], right: string[]', 'left = ["oak", "maple", "pine"], right = ["birch", "pine", "oak"]', '"oak"', 'Oak occurs first in left and is also in right.', 'Store right values in a set. Scan left in order. Return the first left value found in the set.', ['set-membership', 'stable-ordering']),
  item('matching-prefix-suffix-total', 'arrays-hashing', 'advanced', 'Count matching prefix and suffix totals', 'Return the number of split positions where the sum before the split equals the sum after it.', 'countBalancedSplits', 'values: number[]', 'values = [2, 1, 3, 1, 2, 3]', '1', 'The split after index 2 gives totals of six on both sides.', 'Compute the full sum. Scan left to right. Move each value from the right total to the left total and count equal totals before the final position.', ['running-total', 'invariant']),
  item('three-value-target', 'two-pointers', 'foundation', 'Find three values for a target', 'Return true when three distinct positions in values sum to target. Return false when no such three positions exist.', 'hasThreeValueTarget', 'values: number[], target: number', 'values = [4, -1, 2, 7, 3], target = 6', 'true', 'Values -1, 3, and 4 sum to six.', 'Sort a copy. Fix one value. Search the remaining suffix with a left and right pointer.', ['two-pointers', 'sorted-search']),
  item('reverse-vowel-positions', 'two-pointers', 'foundation', 'Reverse vowel positions', 'Return a copy of text with vowels reversed while every other character stays in place.', 'reverseVowelPositions', 'text: string', 'text = "method"', '"mothed"', 'The vowels e and o exchange positions.', 'Use left and right pointers. Move each pointer until it reaches a vowel. Exchange the vowel characters and continue inward.', ['two-pointers', 'character-scan']),
  item('closest-target-sum', 'two-pointers', 'advanced', 'Choose the closest three-value sum', 'Return the sum of three distinct values whose total is closest to target. Inputs always have one unique closest total.', 'closestThreeValueSum', 'values: number[], target: number', 'values = [-4, -1, 2, 5, 8], target = 4', '3', 'Values -4, -1, and 8 give the closest total of three.', 'Sort a copy. Fix one position and move two boundaries. Update the best total whenever its distance to target is smaller.', ['two-pointers', 'distance-comparison']),
  item('maximum-average-window', 'sliding-window', 'foundation', 'Find the strongest average window', 'Return the greatest average of any contiguous window with exactly width values.', 'maximumWindowAverage', 'values: number[], width: number', 'values = [2, 6, 1, 7, 3], width = 2', '5', 'The window [6, 1] has average 3.5, but [7, 3] has average five.', 'Track the sum of one fixed window. Slide it by removing the outgoing value and adding the incoming value. Divide the greatest sum by width.', ['fixed-window', 'incremental-sum']),
  item('longest-replaceable-stretch', 'sliding-window', 'intermediate', 'Find a replaceable symbol stretch', 'Return the greatest substring length that can contain one repeated character after changing at most changes symbols.', 'longestReplaceableStretch', 'text: string, changes: number', 'text = "AABAB", changes = 1', '4', 'Change the middle B to A and keep four A values.', 'Track symbol counts in a moving window. Keep the highest count in the window. Shrink when window length minus that count exceeds changes.', ['variable-window', 'frequency-counting']),
  item('smallest-positive-total-window', 'sliding-window', 'advanced', 'Find the smallest positive-total window', 'Values are positive integers. Return the smallest contiguous length whose sum is at least target. Return zero when no window reaches target.', 'smallestTargetWindow', 'values: number[], target: number', 'values = [2, 3, 1, 2, 4, 3], target = 7', '2', 'The window [4, 3] reaches seven with length two.', 'Expand the right boundary and add its value. While the sum meets target, update the best length and remove values from the left boundary.', ['variable-window', 'positive-values']),
  item('last-negative-boundary', 'binary-search', 'foundation', 'Find the last negative value', 'Return the last index containing a negative number in a sorted integer list. Return -1 when no value is negative.', 'lastNegativeIndex', 'values: number[]', 'values = [-8, -3, -1, 0, 4]', '2', 'Index two contains the final negative value.', 'Search the middle. Save a negative index and move right. Move left when the middle value is zero or positive.', ['binary-search', 'boundary-search']),
  item('rotated-list-smallest', 'binary-search', 'intermediate', 'Find the smallest rotated value', 'An ascending list of distinct integers was rotated. Return its smallest value in logarithmic time.', 'smallestRotatedValue', 'values: number[]', 'values = [12, 15, 19, 2, 5, 8]', '2', 'The rotation boundary is before two.', 'Compare the middle value with the right boundary. Keep the half that contains the rotation boundary.', ['binary-search', 'rotated-order']),
  item('minimum-shipping-capacity', 'binary-search', 'advanced', 'Find minimum shipping capacity', 'Packages must ship in order over days days. Return the smallest daily capacity that ships every package on time.', 'minimumShippingCapacity', 'weights: number[], days: number', 'weights = [3, 2, 2, 4, 1, 4], days = 3', '6', 'Capacity six ships [3,2], [2,4], and [1,4].', 'Search capacities from the largest package through the total weight. Simulate days for each middle capacity and keep the smallest feasible value.', ['answer-space-search', 'feasibility-predicate']),
  item('split-chain-by-pivot', 'linked-lists', 'foundation', 'Split a chain by a pivot', 'Reorder a singly linked chain so nodes below pivot appear before nodes at or above pivot. Preserve the order within each group.', 'splitChainByPivot', 'head: ListNode | null, pivot: number', 'head = 5 -> 1 -> 7 -> 3, pivot = 4', '1 -> 3 -> 5 -> 7', 'Each group keeps its original order.', 'Build a below-pivot chain and an at-or-above-pivot chain. Connect the first tail to the second head.', ['linked-lists', 'stable-partition']),
  item('cycle-entry-node', 'linked-lists', 'intermediate', 'Find a cycle entry node', 'Return the node where a singly linked chain cycle begins. Return null when the chain has no cycle.', 'cycleEntryNode', 'head: ListNode | null', 'head = 1 -> 4 -> 6 -> 4 ...', 'node with value 4', 'The repeated node begins the cycle.', 'Use slow and fast pointers to detect a meeting. Reset one pointer to head. Move both one step until they meet at the cycle entry.', ['fast-slow-pointers', 'cycle-detection']),
  item('remove-sorted-chain-duplicates', 'linked-lists', 'intermediate', 'Remove repeated chain values', 'A singly linked chain is sorted in ascending order. Remove duplicate nodes so every value occurs once.', 'removeSortedChainDuplicates', 'head: ListNode | null', 'head = 1 -> 1 -> 2 -> 3 -> 3', '1 -> 2 -> 3', 'The repeated first and final values are removed.', 'Walk the chain with one pointer. When the next node has the same value, skip that next node. Otherwise move forward.', ['linked-lists', 'in-place-rewiring']),
  item('copy-random-link-chain', 'linked-lists', 'advanced', 'Copy a random-link chain', 'Each node has next and random links. Return an independent deep copy with matching links.', 'copyRandomLinkChain', 'head: RandomListNode | null', 'head = 2(random: null) -> 5(random: 2)', '2(random: null) -> 5(random: 2)', 'The new random link points to the copied first node.', 'Map each original node to a copied node. In a second pass, connect copied next and random links through the map.', ['node-mapping', 'deep-copy']),
  item('normalize-parentheses', 'stacks', 'foundation', 'Normalize unmatched parentheses', 'Return a string after removing the fewest parentheses needed to make nesting valid. Keep all non-parenthesis characters.', 'removeInvalidParentheses', 'text: string', 'text = "a)b(c)d"', '"ab(c)d"', 'The unmatched closing parenthesis is removed.', 'Scan left to right and record unmatched opening positions. Skip unmatched closing parentheses. Remove recorded opening positions after the scan.', ['stack-state', 'string-rebuild']),
  item('daily-warmer-delay', 'stacks', 'intermediate', 'Measure the next warmer delay', 'For each temperature, return how many later days pass before a warmer temperature occurs. Return zero when none occurs.', 'nextWarmerDelay', 'temperatures: number[]', 'temperatures = [60, 62, 61, 64]', '[1, 2, 1, 0]', 'The day at 60 waits one day for 62.', 'Keep indices with unresolved temperatures in decreasing order. When a warmer value arrives, fill the delay for every smaller stacked value.', ['monotonic-stack', 'deferred-results']),
  item('largest-rectangle-row', 'stacks', 'advanced', 'Find the largest histogram rectangle', 'Bar heights form a histogram. Return the largest rectangle area that uses consecutive bars.', 'largestHistogramRectangle', 'heights: number[]', 'heights = [2, 1, 5, 6, 2, 3]', '10', 'Bars five and six form a rectangle of height five and width two.', 'Use an increasing stack of indices. When height drops, pop bars and compute each popped bar width from its new boundaries.', ['monotonic-stack', 'area-boundaries']),
]);
