import 'server-only';
import {
  freezeQuestionVersion,
  questionVersionKey,
  type QuestionDifficulty,
  type QuestionOption,
  type QuestionVersion,
  type InterviewCurriculumTopic,
} from '@leetcode-app/domain';

export const interviewCore250Topics = [
  'arrays-hashing', 'binary-search', 'linked-lists', 'stacks', 'trees', 'backtracking', 'heaps',
  'advanced-graphs', 'dynamic-programming-2d', 'greedy',
  'bit-manipulation', 'math-geometry',
] as const satisfies readonly InterviewCurriculumTopic[];

export type InterviewCore250Topic = typeof interviewCore250Topics[number];

type QuestionInput = {
  questionId: string;
  title: string;
  topicId: InterviewCore250Topic;
  difficulty: QuestionDifficulty;
  activityId: string;
  conceptIds: string[];
  prompt: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
};

const authorId = 'interview-core-250-original-author-v1';
const authoredAt = '2026-11-15T22:00:00.000Z';
const option = (id: string, text: string, misconception?: string): QuestionOption => ({
  id, text, misconceptionTags: misconception ? [misconception] : [],
});
const question = (input: QuestionInput): QuestionVersion => freezeQuestionVersion({
  questionId: input.questionId,
  version: 1,
  versionId: questionVersionKey(input.questionId, 1),
  kind: 'multiple_choice',
  status: 'in_review',
  title: input.title,
  prompt: input.prompt,
  difficulty: input.difficulty,
  activityIds: [input.activityId],
  conceptIds: [input.topicId, ...input.conceptIds],
  options: input.options,
  correctOptionId: input.correctOptionId,
  explanation: input.explanation,
  provenance: { kind: 'original', authorId, authoredAt },
  review: null,
});

/** Original seed material. It is not imported by the live class-question catalog. */
export const interviewCore250SeedQuestions: readonly QuestionVersion[] = Object.freeze([
  question({
    questionId: 'core250-boundary-first-true', title: 'Keep a possible boundary', topicId: 'binary-search', difficulty: 'foundation',
    activityId: 'threshold-crossing-v1', conceptIds: ['monotonic-predicate', 'search-boundary'],
    prompt: 'A sorted sensor log has false readings before a threshold and true readings from the threshold onward. A search keeps inclusive bounds low and high. If value[mid] is true, which update can still find the first true position?',
    options: [option('a', 'Set high to mid - 1.', 'discarding-possible-answer'), option('b', 'Set low to mid + 1.', 'moving-past-first-true'), option('c', 'Record mid as a candidate and set high to mid - 1.'), option('d', 'Stop at the first true value without checking earlier positions.', 'returning-arbitrary-true')], correctOptionId: 'c',
    explanation: 'A true value proves that the first true position is at mid or earlier. Recording mid preserves it as an answer. Searching the earlier half can still locate a smaller true position.',
  }),
  question({
    questionId: 'core250-feasible-speed-search', title: 'Search the answer range', topicId: 'binary-search', difficulty: 'intermediate',
    activityId: 'delivery-speed-v1', conceptIds: ['monotonic-predicate', 'answer-space-search'],
    prompt: 'A worker must process all positive workloads within a fixed number of hours. A proposed speed is feasible when the required hours do not exceed the limit. Which fact makes binary search over integer speeds valid?',
    options: [option('a', 'If a speed is feasible, every larger speed is feasible.'), option('b', 'Every feasible speed has the same required hours.', 'assuming-constant-cost'), option('c', 'The workloads must already be sorted.', 'requiring-sorted-input'), option('d', 'A smaller speed is always feasible when a larger one is feasible.', 'reversing-monotonicity')], correctOptionId: 'a',
    explanation: 'Increasing speed cannot increase the hours needed for fixed positive workloads. Feasible speeds form an upper interval. Binary search can find the smallest member of that interval without sorting the workload list.',
  }),
  question({
    questionId: 'core250-reverse-link-order', title: 'Save the next link first', topicId: 'linked-lists', difficulty: 'foundation',
    activityId: 'reverse-chain-v1', conceptIds: ['pointer-rewiring', 'invariants'],
    prompt: 'While reversing a singly linked chain, current points to a node whose next link has not yet been processed. Which action must occur before assigning current.next to the previous node?',
    options: [option('a', 'Save current.next in a temporary variable.'), option('b', 'Set previous to null.', 'discarding-reversed-prefix'), option('c', 'Advance current through current.next after overwriting it.', 'following-overwritten-link'), option('d', 'Delete the current node.', 'destroying-input')], correctOptionId: 'a',
    explanation: 'Changing current.next removes the only direct link to the unprocessed suffix. Save that successor first. Then reverse the link and advance through the saved reference.',
  }),
  question({
    questionId: 'core250-cycle-meeting-meaning', title: 'Interpret a repeated node', topicId: 'linked-lists', difficulty: 'intermediate',
    activityId: 'detect-chain-cycle-v1', conceptIds: ['fast-slow-pointers', 'cycle-detection'],
    prompt: 'A slow pointer advances one link per step and a fast pointer advances two links per step. Both start at the head of a finite singly linked structure. What does a meeting at a non-null node prove?',
    options: [option('a', 'The structure contains a cycle.'), option('b', 'The chain has an even number of nodes.', 'inferring-parity'), option('c', 'The head node is the only repeated node.', 'confusing-meeting-with-entry'), option('d', 'The structure is sorted.', 'inventing-order-property')], correctOptionId: 'a',
    explanation: 'In an acyclic finite chain, the fast pointer reaches null and cannot revisit a node. A non-null meeting means both pointers revisited the same node while continuing through links. That requires a cycle.',
  }),
  question({
    questionId: 'core250-stack-push-pop-order', title: 'Remove the latest item', topicId: 'stacks', difficulty: 'foundation',
    activityId: 'latest-action-stack-v1', conceptIds: ['last-in-first-out', 'stack-state'],
    prompt: 'A stack receives actions A, then B, then C. Which action does the next pop remove?',
    options: [option('a', 'A, because it was stored first.', 'using-first-in-first-out'), option('b', 'C, because it was stored last.'), option('c', 'B, because it is in the middle.', 'using-position-not-order'), option('d', 'All actions at once.', 'discarding-stack-state')], correctOptionId: 'b',
    explanation: 'A stack removes the most recently stored item first. The next pop removes C and leaves A and B.',
  }),
  question({
    questionId: 'core250-stack-postfix-operand-order', title: 'Keep postfix operand order', topicId: 'stacks', difficulty: 'intermediate',
    activityId: 'postfix-expression-evaluator-v1', conceptIds: ['expression-evaluation', 'last-in-first-out'],
    prompt: 'A postfix evaluator reads minus after pushing 9 and then 4. Which calculation must it perform?',
    options: [option('a', '9 minus 4.'), option('b', '4 minus 9.', 'reversing-operands'), option('c', '9 plus 4.', 'using-wrong-operator'), option('d', 'Remove only one value.', 'leaving-missing-operand')], correctOptionId: 'a',
    explanation: 'The most recent pop is the right operand. The next pop is the left operand. The evaluator must calculate 9 minus 4.',
  }),
  question({
    questionId: 'core250-subset-include-exclude', title: 'Partition subset choices', topicId: 'backtracking', difficulty: 'foundation',
    activityId: 'distinct-subsets-v1', conceptIds: ['decision-tree', 'state-restoration'],
    prompt: 'A subset generator considers each distinct input value once. At position i, it recurses once after including the value and once after excluding it. Why are these branches enough to generate every subset?',
    options: [option('a', 'Every subset makes exactly one include-or-exclude decision for position i.'), option('b', 'A subset may include the same position several times.', 'duplicating-position-choice'), option('c', 'Excluding one value prevents all later values from being chosen.', 'pruning-valid-suffixes'), option('d', 'The generator needs a third branch for sorting.', 'inventing-unrelated-branch')], correctOptionId: 'a',
    explanation: 'For each input position, a subset either contains that value or does not. Those choices are mutually exclusive and exhaustive. Recursing through all positions therefore reaches each position-based subset once.',
  }),
  question({
    questionId: 'core250-board-state-restore', title: 'Undo the attempted placement', topicId: 'backtracking', difficulty: 'intermediate',
    activityId: 'nonattacking-markers-v1', conceptIds: ['state-restoration', 'constraint-search'],
    prompt: 'A board search records occupied columns and diagonals before recursing to the next row. What must happen immediately after that recursive call returns?',
    options: [option('a', 'Remove the placement from all three recorded sets.'), option('b', 'Keep the placement for every sibling branch.', 'leaking-branch-state'), option('c', 'Clear every placement from earlier rows.', 'destroying-prefix-state'), option('d', 'Add another marker in the same row.', 'duplicating-choice')], correctOptionId: 'a',
    explanation: 'Sibling branches share the same parent state but represent different choices for the current row. Removing only the current attempt restores that parent state. Keeping it would incorrectly reject placements that conflict only with a finished branch.',
  }),
  question({
    questionId: 'core250-top-k-heap-size', title: 'Bound the retained candidates', topicId: 'heaps', difficulty: 'foundation',
    activityId: 'top-k-readings-v1', conceptIds: ['heap-invariant', 'selection'],
    prompt: 'A stream reports numeric readings. The task needs the largest k readings seen so far. Which min-heap invariant keeps storage proportional to k?',
    options: [option('a', 'Keep at most k readings; remove the smallest when a larger new reading makes the heap exceed k.'), option('b', 'Keep every reading in a min-heap.', 'unbounded-storage'), option('c', 'Remove the largest reading whenever the heap grows.', 'retaining-smallest-values'), option('d', 'Sort the full stream after every reading.', 'repeated-full-sort')], correctOptionId: 'a',
    explanation: 'The heap root is the weakest retained candidate. After removing it when needed, every stored reading is at least as large as an excluded reading seen at that decision point. The heap never needs more than k entries.',
  }),
  question({
    questionId: 'core250-merge-stream-next-item', title: 'Refill the extracted stream', topicId: 'heaps', difficulty: 'intermediate',
    activityId: 'merge-sorted-streams-v1', conceptIds: ['heap-invariant', 'k-way-merge'],
    prompt: 'A k-way merge heap holds the next unmerged item from each nonempty ascending stream. After extracting an item from stream s, what preserves the invariant?',
    options: [option('a', 'Insert the next unmerged item from s, if one exists.'), option('b', 'Insert the first item from every stream again.', 'duplicating-items'), option('c', 'Discard all remaining items from s.', 'losing-stream-suffix'), option('d', 'Insert the extracted item back into the heap.', 'repeating-output')], correctOptionId: 'a',
    explanation: 'The extracted item is the smallest available head. The following item from that same ascending stream becomes its new candidate. Other stream heads remain unchanged, so the heap again represents every stream that still has work.',
  }),
  question({
    questionId: 'core250-tree-inorder-visit-order', title: 'Visit the left subtree first', topicId: 'trees', difficulty: 'foundation',
    activityId: 'tree-inorder-walk-v1', conceptIds: ['tree-traversal', 'recursive-order'],
    prompt: 'What order does an inorder traversal use for a node with left and right children?',
    options: [option('a', 'Visit left subtree, node, then right subtree.'), option('b', 'Visit node, left subtree, then right subtree.', 'using-preorder'), option('c', 'Visit left subtree, right subtree, then node.', 'using-postorder'), option('d', 'Visit only the node.', 'skipping-children')], correctOptionId: 'a',
    explanation: 'Inorder traversal completes the left subtree before the node. It then visits the right subtree.',
  }),
  question({
    questionId: 'core250-shortest-path-stale-entry', title: 'Ignore an obsolete route', topicId: 'advanced-graphs', difficulty: 'intermediate',
    activityId: 'weighted-route-planning-v1', conceptIds: ['dijkstra', 'priority-queue'],
    prompt: 'A shortest-path priority queue may contain an old entry for a vertex after a shorter route was discovered. When removing an entry whose stored distance exceeds the current best distance, what should the algorithm do?',
    options: [option('a', 'Skip the stale entry and continue.'), option('b', 'Replace the current best distance with the larger value.', 'overwriting-improvement'), option('c', 'Report a negative edge.', 'misidentifying-stale-entry'), option('d', 'Restart from the source.', 'discarding-progress')], correctOptionId: 'a',
    explanation: 'The newer, smaller distance is already the useful candidate. Relaxing from a larger obsolete distance cannot improve a nonnegative-weight shortest path. Skipping it avoids repeated work while preserving the best-distance invariant.',
  }),
  question({
    questionId: 'core250-grid-path-base-case', title: 'Seed the empty prefix', topicId: 'dynamic-programming-2d', difficulty: 'foundation',
    activityId: 'blocked-grid-routes-v1', conceptIds: ['grid-dynamic-programming', 'base-cases'],
    prompt: 'A route may move only right or down through an open grid. Let ways[r][c] count routes to cell r,c. If the start cell is open, what value must ways[0][0] have?',
    options: [option('a', '1, representing the one empty sequence of moves at the start.'), option('b', '0, because no move has occurred.', 'discarding-empty-route'), option('c', '2, one for each allowed direction.', 'counting-future-moves'), option('d', 'The grid width.', 'using-unrelated-dimension')], correctOptionId: 'a',
    explanation: 'The recurrence needs one existing way to stand at the start before extending paths. This is the empty move sequence. A blocked start would instead contribute zero routes.',
  }),
  question({
    questionId: 'core250-alignment-last-symbol', title: 'Choose the final alignment action', topicId: 'dynamic-programming-2d', difficulty: 'intermediate',
    activityId: 'string-alignment-cost-v1', conceptIds: ['sequence-dynamic-programming', 'recurrence'],
    prompt: 'An edit-cost table compares prefixes of strings A and B. At cell i,j, the final action can delete A[i-1], insert B[j-1], or align the two final symbols. Which predecessor corresponds to aligning those two final symbols?',
    options: [option('a', 'Cell i-1,j-1.'), option('b', 'Cell i-1,j.', 'deleting-instead-of-aligning'), option('c', 'Cell i,j-1.', 'inserting-instead-of-aligning'), option('d', 'Cell i+1,j+1.', 'moving-outside-solved-prefix')], correctOptionId: 'a',
    explanation: 'Aligning the final symbols removes one symbol from each prefix. The remaining subproblem compares the prefixes ending at i-1 and j-1. The other adjacent predecessors remove a symbol from only one side.',
  }),
  question({
    questionId: 'core250-reachability-farthest-index', title: 'Keep the best reachable boundary', topicId: 'greedy', difficulty: 'foundation',
    activityId: 'jump-range-v1', conceptIds: ['greedy-invariant', 'reachability'],
    prompt: 'Each array value gives the farthest jump length from that index. During a left-to-right scan, farthest stores the greatest index reachable from processed positions. What proves that an index i cannot be reached?',
    options: [option('a', 'i is greater than farthest.'), option('b', 'The value at i is zero.', 'treating-zero-as-global-failure'), option('c', 'i equals farthest.', 'rejecting-boundary-position'), option('d', 'The array length is even.', 'using-unrelated-property')], correctOptionId: 'a',
    explanation: 'All processed jumps end at or before farthest. If the scan reaches an index beyond that boundary, no previous reachable position can land there. A zero value may still be harmless when a previous jump already passes it.',
  }),
  question({
    questionId: 'core250-schedule-earliest-finish', title: 'Free the next slot sooner', topicId: 'greedy', difficulty: 'intermediate',
    activityId: 'nonoverlap-session-selection-v1', conceptIds: ['exchange-argument', 'interval-scheduling'],
    prompt: 'To maximize the number of nonoverlapping sessions, a rule chooses an available session with the earliest finishing time. Why does this rule leave a safe choice for later sessions?',
    options: [option('a', 'Any optimal schedule can exchange its first selected session for an earliest-finishing available session without reducing its size.'), option('b', 'The shortest session always finishes first.', 'equating-duration-with-finish-time'), option('c', 'The latest-starting session cannot overlap another session.', 'ignoring-end-times'), option('d', 'All schedules have the same number of sessions.', 'assuming-objective-is-constant')], correctOptionId: 'a',
    explanation: 'Replacing an optimal schedule’s first session with one that finishes no later keeps every later compatible session compatible. This exchange establishes that an optimal schedule exists with the greedy first choice. The same argument then applies to the remaining time.',
  }),
  question({
    questionId: 'core250-array-frequency-key', title: 'Choose a frequency key', topicId: 'arrays-hashing', difficulty: 'foundation',
    activityId: 'value-frequency-map-v1', conceptIds: ['hash-map', 'frequency-counting'],
    prompt: 'A program counts how often each integer occurs in an array. What should it use as a map key?',
    options: [option('a', 'The integer value.'), option('b', 'The total array length.', 'using-global-value'), option('c', 'The current count only.', 'losing-value-identity'), option('d', 'A random position.', 'using-unstable-key')], correctOptionId: 'a',
    explanation: 'The map needs one separate count for each value. Using the value as its key keeps those counts separate.',
  }),
  question({
    questionId: 'core250-array-prefix-sum-query', title: 'Answer a range total', topicId: 'arrays-hashing', difficulty: 'intermediate',
    activityId: 'range-sum-prefix-v1', conceptIds: ['prefix-sum', 'range-query'],
    prompt: 'A prefix array has prefix[0] equal to zero. What expression gives the sum from index left through index right?',
    options: [option('a', 'prefix[right + 1] minus prefix[left].'), option('b', 'prefix[right] minus prefix[left].', 'omitting-right-value'), option('c', 'prefix[left] minus prefix[right + 1].', 'reversing-subtraction'), option('d', 'prefix[right + 1] plus prefix[left].', 'adding-unrelated-prefix')], correctOptionId: 'a',
    explanation: 'The larger prefix includes all values through right. Subtracting the prefix before left removes earlier values.',
  }),
  question({
    questionId: 'core250-xor-pair-cancellation', title: 'Cancel duplicated identifiers', topicId: 'bit-manipulation', difficulty: 'foundation',
    activityId: 'unpaired-device-id-v1', conceptIds: ['xor', 'bit-invariants'],
    prompt: 'Every device identifier in a list appears exactly twice except one identifier that appears once. Why can XOR of all identifiers reveal the unpaired one?',
    options: [option('a', 'Each duplicated value XORs with itself to zero, and zero leaves other XOR values unchanged.'), option('b', 'XOR sorts identifiers before comparing them.', 'confusing-bitwise-operation-with-sort'), option('c', 'XOR counts how often each identifier occurs.', 'assuming-frequency-table'), option('d', 'Every identifier must be positive.', 'inventing-sign-requirement')], correctOptionId: 'a',
    explanation: 'XOR is associative and commutative for this use, so equal pairs can be grouped conceptually. Each pair cancels to zero. The only remaining contribution is the value with no partner.',
  }),
  question({
    questionId: 'core250-rectangle-coordinate-identity', title: 'Map a cell to one unique number', topicId: 'math-geometry', difficulty: 'intermediate',
    activityId: 'grid-coordinate-key-v1', conceptIds: ['coordinate-encoding', 'grid-geometry'],
    prompt: 'A grid has rows numbered 0 through r-1 and columns numbered 0 through c-1. Which key maps each valid coordinate row,col to a distinct integer when c is the fixed column count?',
    options: [option('a', 'row * c + col.'), option('b', 'row + col.', 'colliding-diagonals'), option('c', 'row * r + col.', 'using-wrong-stride'), option('d', 'row - col.', 'colliding-diagonals')], correctOptionId: 'a',
    explanation: 'Multiplying the row by the fixed row width c reserves a block of c keys for each row. Adding a valid column selects one key within that block. Different valid row-column pairs therefore cannot share a key.',
  }),
]);

export const interviewCore250SeedTopicByQuestionId: Readonly<Record<string, InterviewCore250Topic>> = Object.freeze(
  Object.fromEntries(interviewCore250SeedQuestions.map(questionVersion => [
    questionVersion.questionId,
    questionVersion.conceptIds[0] as InterviewCore250Topic,
  ])),
);
