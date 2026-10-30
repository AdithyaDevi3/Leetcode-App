import 'server-only';
import {
  freezeQuestionVersion, questionVersionKey,
  type QuestionDifficulty, type QuestionOption, type QuestionVersion,
} from '@leetcode-app/domain';

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
  provenance: { kind: 'original', authorId: 'automated-curriculum-author-v2', authoredAt: '2026-10-29T16:34:51.000Z' }, review: null,
});

/** Practice-only candidates, intentionally separate from the assignable class bank. */
export const diagnosticQuestionCandidates: readonly QuestionVersion[] = Object.freeze([
  candidate({
    questionId: 'diagnostic-pair-needed-value-map', title: 'Read an alternative complement map', difficulty: 'intermediate',
    activityId: 'pair-with-target-v1', conceptIds: ['hash-maps', 'complement-reasoning'],
    prompt: 'A pair-search variation stores needed[target - earlierValue] = earlierIndex. With target 15, it has read values 4 at index 0 and 10 at index 1, so needed contains {11:0, 5:1}. The next value is 5 at index 2. Which lookup recognizes its partner?',
    options: [option('a', 'Look up needed[10], because every map in a pair search must use earlier values as keys.', 'assuming-one-map-representation'), option('b', 'Look up needed[15], because only the target can be a useful key.', 'keying-only-by-target'), option('c', 'Look up needed[20], because target and current value must be added.', 'adding-instead-of-matching-needed-value'), option('d', 'Look up needed[5]; it yields earlier index 1, whose value 10 combines with the current 5.')],
    correctOptionId: 'd', explanation: 'This representation stores the future value each earlier entry needs, rather than the earlier value itself. The arriving value 5 therefore matches key 5, which points to earlier value 10 at index 1. The resulting positions 1 and 2 are distinct and their values sum to 15.',
  }),
  candidate({
    questionId: 'diagnostic-window-earliest-tie', title: 'Keep the earliest maximum window', difficulty: 'foundation',
    activityId: 'max-window-sum-v1', conceptIds: ['sliding-window', 'incremental-state'],
    prompt: 'A fixed-window variation returns the earliest starting index among windows tied for the maximum sum. Starts are visited from left to right. bestSum and bestStart initially describe the first window. Which update rule preserves that tie policy?',
    options: [option('a', 'Replace them only when currentSum > bestSum; keep the saved earlier start on equality.'), option('b', 'Replace them only when currentSum < bestSum.', 'minimizing-instead-of-maximizing'), option('c', 'Replace bestStart after every slide, regardless of the sum.', 'forgetting-best-window-state'), option('d', 'Replace bestSum and bestStart whenever currentSum >= bestSum.', 'overwriting-earliest-on-equal-sum')],
    correctOptionId: 'a', explanation: 'Every newly examined window starts later than the current saved window. An equal sum cannot improve the required earliest start, while a strictly greater sum must replace the old best. Using >= would instead retain the last encountered tied window.',
  }),
  candidate({
    questionId: 'diagnostic-tree-child-swap-invariance', title: 'Separate branch direction from path length', difficulty: 'foundation',
    activityId: 'tree-max-depth-v1', conceptIds: ['tree-recursion', 'divide-and-combine'],
    prompt: 'A finite binary tree has no shared child nodes or cycles. At any chosen nodes, swap their left and right child references without adding or removing nodes. What happens to the maximum node-counting root-to-leaf depth?',
    options: [option('a', 'It must become zero whenever a swapped child is null.', 'letting-empty-branch-erase-depth'), option('b', 'It increases by one for every swap.', 'counting-reordering-as-an-extra-level'), option('c', 'It stays the same, because the root-to-leaf path lengths are unchanged.'), option('d', 'It becomes the total number of nodes.', 'equating-tree-size-with-depth')],
    correctOptionId: 'c', explanation: 'The swaps change left/right labels but retain all parent-child connections and path lengths. Taking the longer child depth is symmetric in the two children. Empty trees remain depth zero as well; a relabeling of branch directions creates no new level.',
  }),
  candidate({
    questionId: 'diagnostic-brackets-adjacent-reduction', title: 'Recognize an innermost-pair reduction', difficulty: 'intermediate',
    activityId: 'balanced-brackets-v1', conceptIds: ['nesting', 'stack-state'],
    prompt: 'A checker repeatedly removes an adjacent matching pair (), [] or {} until no such pair remains. Which reduction trace correctly shows that "[()]{}" is balanced?',
    options: [option('a', 'Remove the first [ and last } because both are outside the string.', 'pairing-different-bracket-types'), option('b', 'Remove every opening bracket first; any remaining closers prove balance.', 'discarding-nesting-and-pair-types'), option('c', 'Remove () to obtain []{}, then remove [] to obtain {}, then remove {} to obtain the empty string.'), option('d', 'Stop immediately because the original string is not one adjacent pair.', 'requiring-whole-input-to-be-one-pair')],
    correctOptionId: 'c', explanation: 'Each removed adjacent pair is a correctly matched innermost group. The displayed sequence removes all groups, leaving nothing unmatched. Simply deleting all openers or pairing unlike outside brackets does not preserve the nesting requirement.',
  }),
  candidate({
    questionId: 'diagnostic-stairs-last-move-partition', title: 'Choose addition from disjoint last moves', difficulty: 'foundation',
    activityId: 'climb-stairs-v1', conceptIds: ['dynamic-programming', 'recurrence'],
    prompt: 'For n >= 3, every ordered route using 1-step or 2-step moves ends with exactly one of those moves. There are ways(n-1) routes before a final 1-step move and ways(n-2) routes before a final 2-step move. Why should the two counts be added?',
    options: [option('a', 'The larger count always contains all routes in the smaller set.', 'using-maximum-instead-of-counting-alternatives'), option('b', 'The two sets of finished routes are disjoint and together contain every route to n.'), option('c', 'There is exactly one finished route regardless of the two prefix counts.', 'collapsing-distinct-move-sequences'), option('d', 'Both route prefixes must be chosen together for every finished route, so addition is interchangeable with multiplication.', 'multiplying-alternative-last-moves')],
    correctOptionId: 'b', explanation: 'A finished route cannot end with both a 1-step move and a 2-step move. Removing its final move places it in exactly one predecessor class, and appending that move reverses the process. Counting disjoint alternatives uses addition, not a product of independent choices made together.',
  }),
  candidate({
    questionId: 'diagnostic-islands-traversal-versus-scan', title: 'Do not confuse scan direction with connectivity', difficulty: 'intermediate',
    activityId: 'island-count-v1', conceptIds: ['graph-traversal', 'grid-connectivity', 'visited-state'],
    prompt: 'Island Count uses four-direction connectivity and scans rows from top to bottom, left to right. On grid [[1,0,1],[1,1,1]], its flood fill follows only right and down neighbors. Why can it incorrectly count two islands instead of one?',
    options: [option('a', 'The outer scan must stop after finding the first land cell.', 'skipping-unscanned-components'), option('b', 'A connected component must be entirely contained in one row.', 'forbidding-cross-row-components'), option('c', 'Water must be traversed as though it were land.', 'joining-components-through-water'), option('d', 'From the first land cell, the connected top-right land requires moving up from the bottom row; the flood fill must allow every permitted direction.')],
    correctOptionId: 'd', explanation: 'All five land cells belong to one four-direction component. Right/down-only traversal from the top-left reaches the bottom row but cannot move back up to the top-right cell. The outer scan later starts another fill there. Scan order does not turn undirected grid connectivity into directed reachability.',
  }),
  candidate({
    questionId: 'diagnostic-tasks-output-permutation', title: 'Validate the complete task list', difficulty: 'foundation',
    activityId: 'task-order-v1', conceptIds: ['topological-sort', 'queue-processing'],
    prompt: 'The task list is [A,B,C], with the only prerequisite A before C. A proposed output [A,A,C] has length 3 and places A before C. What additional contract check rejects this output?',
    options: [option('a', 'Every task must have an outgoing edge.', 'requiring-dependents-for-every-task'), option('b', 'Every known task must occur exactly once; the output repeats A and omits B.'), option('c', 'Task names must appear in reverse alphabetical order.', 'inventing-name-ordering-rule'), option('d', 'Only the output length matters, so the proposal is valid.', 'using-length-as-proof-of-membership')],
    correctOptionId: 'b', explanation: 'A topological order is a permutation of the complete vertex set satisfying every prerequisite. Length and edge order alone do not prove that all vertices occur once. B remains a required task even though it has no incident dependency edge.',
  }),
  candidate({
    questionId: 'diagnostic-two-arrays-pointer-bounds', title: 'Adapt bounds when pointers refer to different arrays', difficulty: 'intermediate',
    activityId: 'two-sum-window-v1', conceptIds: ['two-pointers', 'boundary-movement', 'ordered-search'],
    prompt: 'A variation chooses one value from sorted array A and one from sorted array B. It starts i=0 in A and j=B.length-1 in B, then moves i right for a small sum or j left for a large sum. For A=[2], B=[8] and target 10, why is the loop guard i<j wrong?',
    options: [option('a', 'Both pointers are in bounds even though i=j=0; test each pointer against its own array bounds instead of comparing the two index numbers.'), option('b', 'The guard should instead require i>j.', 'reversing-index-inequality-without-bounds'), option('c', 'The variation must reject every one-element input array.', 'discarding-valid-cross-array-pair'), option('d', 'It is correct because equal index numbers always mean the same array position.', 'confusing-equal-indices-across-arrays')],
    correctOptionId: 'a', explanation: 'The positions belong to different arrays, so A[0] and B[0] are different selectable elements. Their values form the required pair. The search continues while i is a valid A index and j is a valid B index; the same-array condition left<right does not transfer to this different contract.',
  }),
  candidate({
    questionId: 'diagnostic-coins-scaled-unit-count', title: 'Separate amount units from number of coins', difficulty: 'intermediate',
    activityId: 'coin-change-lite-v1', conceptIds: ['dynamic-programming', 'optimization'],
    prompt: 'With positive denominations and unlimited reuse, [2,3] can make amount 7 using three coins. Multiply every denomination and the target by 10, obtaining [20,30] and target 70. Arithmetic is exact. What happens to the minimum coin count?',
    options: [option('a', 'The scaled amount must be unreachable because coin 1 is absent.', 'requiring-unit-coin-for-reachability'), option('b', 'It becomes 30 because every quantity was multiplied by 10.', 'scaling-number-of-coins-with-denominations'), option('c', 'It becomes 1 because 70 is larger than every original denomination.', 'treating-target-as-available-coin'), option('d', 'It remains 3: each exact combination corresponds to a scaled combination using the same number of coins.')],
    correctOptionId: 'd', explanation: 'The combinations 2+2+3=7 and 20+20+30=70 use three coins. Dividing any scaled construction by 10 gives an original construction with the same count, so no shorter scaled solution can appear. The transformation changes monetary units, not how many selected coins are used.',
  }),
  candidate({
    questionId: 'diagnostic-unique-append-fresh-value', title: 'Predict the index of a newly unique value', difficulty: 'foundation',
    activityId: 'first-unique-index-v1', conceptIds: ['frequency-counting', 'stable-ordering'],
    prompt: 'First Unique Index returns -1 for an integer array of length n because no value occurs exactly once. Append one value that has never appeared in the array. Using zero-based indices, what must the new result be?',
    options: [option('a', '-1, because once no unique value exists it can never change.', 'freezing-a-result-after-input-changes'), option('b', 'n+1, because the new array has that many elements.', 'returning-length-instead-of-final-index'), option('c', 'n, because earlier counts are unchanged and the new value occurs once at the new final index.'), option('d', 'The appended numeric value itself.', 'returning-value-instead-of-index')],
    correctOptionId: 'c', explanation: 'Every old value keeps its old multiplicity and therefore remains ineligible. The fresh value has count one, making it the only unique value. Appending to length n places it at zero-based index n, even when the original array was empty.',
  }),
]);
