import 'server-only';
import {
  freezeQuestionVersion,
  questionVersionKey,
  type InterviewCurriculumTopic,
  type QuestionDifficulty,
  type QuestionOption,
  type QuestionVersion,
} from '@leetcode-app/domain';

export const interviewCore250Batch2Topics = [
  'arrays-hashing', 'two-pointers', 'sliding-window', 'stacks', 'trees',
  'graphs', 'dynamic-programming-1d', 'binary-search', 'linked-lists',
  'backtracking',
] as const satisfies readonly InterviewCurriculumTopic[];

export type InterviewCore250Batch2Topic = typeof interviewCore250Batch2Topics[number];

type QuestionInput = {
  questionId: string;
  title: string;
  topicId: InterviewCore250Batch2Topic;
  difficulty: QuestionDifficulty;
  activityId: string;
  conceptIds: string[];
  prompt: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
};

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
  provenance: {
    kind: 'original',
    authorId: 'interview-core-250-original-author-v2',
    authoredAt: '2026-11-15T23:00:00.000Z',
  },
  review: null,
});

/** Original in-review material. The live class-question catalog does not import it. */
export const interviewCore250Batch2Questions: readonly QuestionVersion[] = Object.freeze([
  question({
    questionId: 'core250-frequency-delete-count', title: 'Decrease the stored count', topicId: 'arrays-hashing', difficulty: 'foundation', activityId: 'inventory-frequency-v1', conceptIds: ['frequency-counting', 'map-updates'],
    prompt: 'An inventory map stores the count for each product code. A removal request is valid only when the current count is positive. What update keeps the map correct after removing one item?',
    options: [option('a', 'Decrease the count for that code by one.'), option('b', 'Set every product count to zero.', 'clearing-unrelated-counts'), option('c', 'Increase the count to record the removal.', 'reversing-count-change'), option('d', 'Delete a different code with the same count.', 'using-count-as-identity')], correctOptionId: 'a',
    explanation: 'The map stores multiplicity for each code. A valid removal changes only that code and reduces its multiplicity by one.',
  }),
  question({
    questionId: 'core250-prefix-total-before-index', title: 'Store the earliest total', topicId: 'arrays-hashing', difficulty: 'intermediate', activityId: 'balanced-ledger-range-v1', conceptIds: ['prefix-sum', 'earliest-index'],
    prompt: 'A prefix-total map finds the longest range whose sum is zero. When a prefix total appears again at position i, why should the algorithm keep its first stored position?',
    options: [option('a', 'The first position gives the longest range ending at i.'), option('b', 'The latest position always gives more values.', 'reversing-range-length'), option('c', 'Repeated totals prove every range has sum one.', 'misreading-prefix-equality'), option('d', 'The map must sort totals before using them.', 'requiring-unneeded-sort')], correctOptionId: 'a',
    explanation: 'Equal prefix totals mean the values between their positions sum to zero. The earliest matching position creates the greatest distance to i.',
  }),
  question({
    questionId: 'core250-two-pointer-area-boundary', title: 'Move the limiting wall', topicId: 'two-pointers', difficulty: 'foundation', activityId: 'container-capacity-v1', conceptIds: ['boundary-movement', 'greedy-scan'],
    prompt: 'Two vertical walls form a container. Its height is limited by the shorter wall. If the left wall is shorter, which pointer move can produce a larger area?',
    options: [option('a', 'Move the left pointer inward.'), option('b', 'Move the right pointer inward only.', 'moving-nonlimiting-wall'), option('c', 'Keep both pointers fixed.', 'preventing-search'), option('d', 'Move both pointers outward.', 'leaving-input-range')], correctOptionId: 'a',
    explanation: 'Keeping the shorter left wall cannot increase the limiting height. Moving it may find a taller wall, while the width decreases by one.',
  }),
  question({
    questionId: 'core250-slow-fast-remove-position', title: 'Copy the retained value', topicId: 'two-pointers', difficulty: 'intermediate', activityId: 'deduplicate-sorted-values-v1', conceptIds: ['slow-fast-pointers', 'in-place-update'],
    prompt: 'A sorted list must keep one copy of each value in place. A fast pointer reads every value. What should the slow pointer represent?',
    options: [option('a', 'The next position for a newly distinct value.'), option('b', 'The last unread position.', 'confusing-read-and-write-state'), option('c', 'A count of all removed values only.', 'discarding-output-position'), option('d', 'The largest numeric value seen.', 'using-value-instead-of-index')], correctOptionId: 'a',
    explanation: 'The slow pointer marks the compacted output boundary. Copy a new distinct value there, then advance it.',
  }),
  question({
    questionId: 'core250-window-frequency-shrink', title: 'Repair an invalid window', topicId: 'sliding-window', difficulty: 'foundation', activityId: 'distinct-character-window-v1', conceptIds: ['frequency-counting', 'window-invariant'],
    prompt: 'A window must contain no repeated character. Adding the rightmost character makes one count equal two. What must happen before recording this window as valid?',
    options: [option('a', 'Move the left boundary until every count is at most one.'), option('b', 'Record the larger invalid window.', 'accepting-invalid-window'), option('c', 'Reset all counts to zero.', 'discarding-window-state'), option('d', 'Move the right boundary backward.', 'reversing-scan')], correctOptionId: 'a',
    explanation: 'The left boundary removes characters until the uniqueness invariant holds again. Only then can the window length be an answer candidate.',
  }),
  question({
    questionId: 'core250-window-minimum-cover-count', title: 'Track unmet requirements', topicId: 'sliding-window', difficulty: 'intermediate', activityId: 'required-token-window-v1', conceptIds: ['frequency-counting', 'window-invariant'],
    prompt: 'A window must contain required token counts. What does an unmet counter of zero mean?',
    options: [option('a', 'The current window satisfies every required count.'), option('b', 'The window contains no tokens.', 'confusing-requirements-with-size'), option('c', 'Every token count is exactly zero.', 'reversing-count-meaning'), option('d', 'The window is already minimal.', 'assuming-minimality')], correctOptionId: 'a',
    explanation: 'The counter tracks requirements that still need occurrences. Zero means the window is valid, but it may still shrink.',
  }),
  question({
    questionId: 'core250-stack-minimum-restore', title: 'Restore the previous minimum', topicId: 'stacks', difficulty: 'foundation', activityId: 'minimum-stack-v1', conceptIds: ['stack-state', 'auxiliary-state'],
    prompt: 'A stack supports constant-time minimum queries. After popping the only copy of the current minimum, what information must remain available?',
    options: [option('a', 'The minimum value from before that item was pushed.'), option('b', 'The maximum value in the stack.', 'tracking-wrong-extreme'), option('c', 'The stack size only.', 'missing-value-state'), option('d', 'A sorted copy of every removed item.', 'unbounded-extra-work')], correctOptionId: 'a',
    explanation: 'Store a minimum with each stack depth, or use another reversible structure. Popping then reveals the earlier minimum.',
  }),
  question({
    questionId: 'core250-monotonic-stack-pop-rule', title: 'Resolve a waiting bar', topicId: 'stacks', difficulty: 'intermediate', activityId: 'next-warmer-reading-v1', conceptIds: ['monotonic-stack', 'deferred-resolution'],
    prompt: 'A decreasing stack holds reading indices that await a warmer future reading. A new reading exceeds the reading at the stack top. What should the algorithm do first?',
    options: [option('a', 'Pop and resolve the top index with the new reading.'), option('b', 'Discard the new reading.', 'discarding-resolver'), option('c', 'Sort all unresolved readings.', 'replacing-linear-structure'), option('d', 'Clear the stack.', 'discarding-pending-work')], correctOptionId: 'a',
    explanation: 'The new reading is the first warmer reading for the top unresolved index. Continue popping while it resolves more waiting indices.',
  }),
  question({
    questionId: 'core250-bst-range-invariant', title: 'Narrow the allowed range', topicId: 'trees', difficulty: 'foundation', activityId: 'validate-search-tree-v1', conceptIds: ['tree-recursion', 'invariants'],
    prompt: 'A binary search tree validator visits a node in a left subtree of value 10. Which condition must still hold for that node?',
    options: [option('a', 'Its value must be less than 10, even if it is not a direct child.'), option('b', 'Only its parent value matters.', 'checking-local-pairs-only'), option('c', 'It must be greater than every value in the tree.', 'reversing-order'), option('d', 'It must have two children.', 'inventing-shape-requirement')], correctOptionId: 'a',
    explanation: 'The ordering constraint applies to the whole subtree. Carrying lower and upper bounds preserves ancestor constraints.',
  }),
  question({
    questionId: 'core250-tree-level-queue-boundary', title: 'Process one level at a time', topicId: 'trees', difficulty: 'intermediate', activityId: 'tree-level-summary-v1', conceptIds: ['breadth-first-search', 'queue-processing'],
    prompt: 'A breadth-first traversal must return one list per tree depth. How can it identify the nodes for the current depth?',
    options: [option('a', 'Read the queue size before removing nodes for that depth.'), option('b', 'Use the total node count as every level size.', 'mixing-global-and-level-counts'), option('c', 'Process until the queue becomes empty for each level.', 'collapsing-all-levels'), option('d', 'Sort node values before traversal.', 'using-unneeded-order')], correctOptionId: 'a',
    explanation: 'The queue initially contains exactly the current depth. Children added during processing belong to the next depth.',
  }),
  question({
    questionId: 'core250-graph-visit-on-discovery', title: 'Mark before queueing', topicId: 'graphs', difficulty: 'foundation', activityId: 'shortest-unweighted-route-v1', conceptIds: ['breadth-first-search', 'visited-state'],
    prompt: 'Why should breadth-first search mark a graph node visited when it enters the queue?',
    options: [option('a', 'It prevents other edges from adding the same node again.'), option('b', 'It makes every path have equal length.', 'changing-graph-property'), option('c', 'It removes all edges from the graph.', 'destroying-input'), option('d', 'It guarantees the graph is acyclic.', 'inventing-cycle-guarantee')], correctOptionId: 'a',
    explanation: 'Marking on discovery reserves the node immediately. Later neighbors then do not queue duplicate work.',
  }),
  question({
    questionId: 'core250-graph-bipartite-color-conflict', title: 'Detect a color conflict', topicId: 'graphs', difficulty: 'intermediate', activityId: 'two-team-check-v1', conceptIds: ['graph-coloring', 'breadth-first-search'],
    prompt: 'A two-color graph search reaches an edge whose endpoints already have the same color. What does this show?',
    options: [option('a', 'The graph is not bipartite.'), option('b', 'The graph has no edges.', 'discarding-observed-edge'), option('c', 'The colors can be ignored.', 'ignoring-constraint'), option('d', 'The graph must be disconnected.', 'inventing-connectivity-result')], correctOptionId: 'a',
    explanation: 'A bipartite graph requires every edge to cross between its two groups. A same-color edge violates that requirement.',
  }),
  question({
    questionId: 'core250-dp-transition-order', title: 'Build from smaller states', topicId: 'dynamic-programming-1d', difficulty: 'foundation', activityId: 'maximum-nonadjacent-sum-v1', conceptIds: ['recurrence', 'state-definition'],
    prompt: 'A dynamic program stores the best result for each prefix length. Why must a state use only earlier states in its transition?',
    options: [option('a', 'Earlier states are already defined when the transition runs.'), option('b', 'Later states always have smaller values.', 'inventing-value-order'), option('c', 'It removes the need for a base case.', 'discarding-base-case'), option('d', 'It makes every recurrence greedy.', 'confusing-methods')], correctOptionId: 'a',
    explanation: 'The computation order must satisfy dependencies. A prefix recurrence can compute state i after all required smaller prefixes exist.',
  }),
  question({
    questionId: 'core250-dp-rolling-overwrite', title: 'Keep the needed predecessor', topicId: 'dynamic-programming-1d', difficulty: 'intermediate', activityId: 'maximum-nonadjacent-sum-v1', conceptIds: ['rolling-state', 'recurrence'],
    prompt: 'A recurrence uses the previous two states. Before overwriting the older variable, what must the implementation ensure?',
    options: [option('a', 'The next value has already used the older state.'), option('b', 'The older state is always zero.', 'assuming-fixed-value'), option('c', 'The input array is sorted.', 'requiring-unneeded-order'), option('d', 'Both variables point to the same value.', 'losing-required-history')], correctOptionId: 'a',
    explanation: 'Rolling state saves memory only if each old value remains available until the transition consumes it. Use a temporary value or ordered assignment.',
  }),
  question({
    questionId: 'core250-binary-search-empty-range', title: 'Stop after the final candidate', topicId: 'binary-search', difficulty: 'foundation', activityId: 'first-acceptable-version-v1', conceptIds: ['search-boundary', 'loop-invariant'],
    prompt: 'An inclusive binary search has low greater than high. What does this state mean?',
    options: [option('a', 'No unexamined candidate remains in the search range.'), option('b', 'The input is unsorted.', 'confusing-state-with-input'), option('c', 'The target must be at the midpoint.', 'using-nonexistent-midpoint'), option('d', 'The search must restart.', 'discarding-progress')], correctOptionId: 'a',
    explanation: 'The inclusive bounds represent candidates that remain possible. Once they cross, the algorithm has ruled out or recorded every candidate.',
  }),
  question({
    questionId: 'core250-binary-search-overflow-safe-mid', title: 'Compute the midpoint safely', topicId: 'binary-search', difficulty: 'intermediate', activityId: 'first-acceptable-version-v1', conceptIds: ['search-boundary', 'integer-safety'],
    prompt: 'In a fixed-width integer language, which midpoint expression avoids adding two large indices directly?',
    options: [option('a', 'low + (high - low) / 2.'), option('b', '(low + high) / 2 only.', 'overflowing-sum'), option('c', 'high - low / 2.', 'wrong-precedence'), option('d', 'low * high / 2.', 'multiplying-indices')], correctOptionId: 'a',
    explanation: 'The difference high minus low stays within the interval width. Adding half of it to low avoids a potentially overflowing low plus high sum.',
  }),
  question({
    questionId: 'core250-linked-list-merge-tail', title: 'Advance the output tail', topicId: 'linked-lists', difficulty: 'foundation', activityId: 'merge-ordered-chains-v1', conceptIds: ['pointer-rewiring', 'merge'],
    prompt: 'A merge of two ordered linked chains appends the smaller current node to an output tail. What must it do next?',
    options: [option('a', 'Advance the tail to the appended node.'), option('b', 'Return the appended node immediately.', 'stopping-early'), option('c', 'Delete both current nodes.', 'destroying-input'), option('d', 'Move both input chains forward.', 'skipping-unselected-node')], correctOptionId: 'a',
    explanation: 'The tail must identify the final node of the output so the next selected node can attach after it. Advance only the input chain that supplied the node.',
  }),
  question({
    questionId: 'core250-linked-list-dummy-head', title: 'Use one uniform append path', topicId: 'linked-lists', difficulty: 'intermediate', activityId: 'merge-ordered-chains-v1', conceptIds: ['sentinel-node', 'pointer-rewiring'],
    prompt: 'Why can a dummy head simplify linked-list construction?',
    options: [option('a', 'It lets every appended node use the same tail.next update.'), option('b', 'It sorts the input chains automatically.', 'inventing-sort'), option('c', 'It removes the need to compare values.', 'discarding-merge-choice'), option('d', 'It makes null pointers impossible.', 'overstating-safety')], correctOptionId: 'a',
    explanation: 'The dummy node supplies an initial predecessor. The first real node and later nodes therefore follow the same append operation.',
  }),
  question({
    questionId: 'core250-backtrack-base-output-copy', title: 'Copy a completed selection', topicId: 'backtracking', difficulty: 'foundation', activityId: 'combination-sum-limited-v1', conceptIds: ['state-restoration', 'base-cases'],
    prompt: 'A backtracking search reaches a complete valid selection stored in a mutable list. What should it add to the results?',
    options: [option('a', 'A copy of the current list.'), option('b', 'The same mutable list reference.', 'aliasing-future-changes'), option('c', 'An empty list.', 'discarding-solution'), option('d', 'Only the selection length.', 'losing-solution-content')], correctOptionId: 'a',
    explanation: 'Later backtracking changes the working list. A copied result preserves the completed selection at the moment it was valid.',
  }),
  question({
    questionId: 'core250-backtrack-prune-negative-budget', title: 'Stop an impossible branch', topicId: 'backtracking', difficulty: 'intermediate', activityId: 'combination-sum-limited-v1', conceptIds: ['pruning', 'constraint-search'],
    prompt: 'A search chooses positive costs and must reach an exact nonnegative budget. The remaining budget becomes negative. What is the correct action?',
    options: [option('a', 'Stop this branch because later positive costs cannot restore the budget.'), option('b', 'Keep adding costs until the budget reaches zero.', 'continuing-impossible-branch'), option('c', 'Accept the branch as a complete solution.', 'accepting-invalid-budget'), option('d', 'Reset every other branch.', 'destroying-search-state')], correctOptionId: 'a',
    explanation: 'Every remaining choice decreases the budget further because costs are positive. The branch cannot reach exactly zero and can end safely.',
  }),
]);
