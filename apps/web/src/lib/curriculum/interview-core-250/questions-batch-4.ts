import 'server-only';
import {
  freezeQuestionVersion,
  questionVersionKey,
  type InterviewCurriculumTopic,
  type QuestionDifficulty,
  type QuestionOption,
  type QuestionVersion,
} from '@leetcode-app/domain';

export const interviewCore250Batch4Topics = [
  'arrays-hashing',
  'binary-search',
  'bit-manipulation',
  'graphs',
  'heaps',
  'math-geometry',
  'stacks',
  'trees',
] as const satisfies readonly InterviewCurriculumTopic[];

type Topic = typeof interviewCore250Batch4Topics[number];
type Input = {
  questionId: string;
  title: string;
  topicId: Topic;
  difficulty: QuestionDifficulty;
  activityId: string;
  conceptIds: string[];
  prompt: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
};

const option = (id: string, text: string, misconception?: string): QuestionOption => ({
  id,
  text,
  misconceptionTags: misconception ? [misconception] : [],
});

const question = (input: Input): QuestionVersion => freezeQuestionVersion({
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
    authorId: 'interview-core-250-original-author-v4',
    authoredAt: '2026-11-16T15:00:00.000Z',
  },
  review: null,
});

export const interviewCore250Batch4Questions: readonly QuestionVersion[] = Object.freeze([
  question({
    questionId: 'core250-binary-final-false-boundary', title: 'Keep the last false answer', topicId: 'binary-search', difficulty: 'intermediate', activityId: 'last-false-boundary-v1', conceptIds: ['search-boundary', 'loop-invariant'],
    prompt: 'A monotonic predicate is false through index 6 and true after it. Which update is correct when index mid is false?',
    options: [option('a', 'Set low to mid plus one.', 'discarding-false-candidate'), option('b', 'Set high to mid minus one.'), option('c', 'Return mid immediately.', 'stopping-before-boundary'), option('d', 'Set both bounds to mid.', 'preventing-progress')], correctOptionId: 'b',
    explanation: 'A false result can still be the final false index. Move the upper bound left and retain the candidate.',
  }),
  question({
    questionId: 'core250-binary-rotated-sorted-half', title: 'Identify the ordered half', topicId: 'binary-search', difficulty: 'intermediate', activityId: 'rotated-sorted-half-v1', conceptIds: ['rotated-array', 'search-invariant'],
    prompt: 'A rotated array has distinct values. At a search step, values from low through mid are in sorted order. Where should the target be checked first?',
    options: [option('a', 'Check whether it lies between values at low and mid.'), option('b', 'Always search the other half.', 'discarding-sorted-half'), option('c', 'Sort the full array again.', 'destroying-index-meaning'), option('d', 'Compare only with the final value.', 'using-insufficient-bound')], correctOptionId: 'a',
    explanation: 'The ordered half has known bounds. If it contains the target, search there. Otherwise search the other half.',
  }),
  question({
    questionId: 'core250-binary-minimum-feasible-answer', title: 'Raise an infeasible lower bound', topicId: 'binary-search', difficulty: 'advanced', activityId: 'minimum-feasible-capacity-v1', conceptIds: ['answer-space-search', 'feasibility-predicate'],
    prompt: 'A capacity test is false for small capacities and true for large capacities. What must the search do after an infeasible capacity mid?',
    options: [option('a', 'Set low to mid plus one.'), option('b', 'Set high to mid minus one.', 'keeping-infeasible-values'), option('c', 'Accept mid as the answer.', 'accepting-failure'), option('d', 'Change the input order.', 'changing-unrelated-data')], correctOptionId: 'a',
    explanation: 'No capacity at or below an infeasible value can work. The first feasible value must be greater than mid.',
  }),
  question({
    questionId: 'core250-trie-terminal-word-marker', title: 'Mark a complete word', topicId: 'stacks', difficulty: 'foundation', activityId: 'dictionary-prefix-check-v1', conceptIds: ['trie-node', 'word-boundary'],
    prompt: 'A trie stores both "car" and "cart". What node data lets a lookup tell that "car" is a complete stored word?',
    options: [option('a', 'A terminal-word flag at the r node.'), option('b', 'A child count of zero.', 'confusing-word-with-leaf'), option('c', 'The total trie depth.', 'using-global-state'), option('d', 'The first character only.', 'discarding-path')], correctOptionId: 'a',
    explanation: 'A word can end at an internal node. A terminal flag records that the path itself forms a stored word.',
  }),
  question({
    questionId: 'core250-trie-safe-branch-pruning', title: 'Prune only unused nodes', topicId: 'stacks', difficulty: 'advanced', activityId: 'dictionary-delete-pruning-v1', conceptIds: ['trie-deletion', 'shared-prefix'],
    prompt: 'A trie contains "ink" and "into". After removing "ink", when can a node on that path be removed?',
    options: [option('a', 'Only when it has no children and is not a word end.'), option('b', 'Whenever it has one child.', 'removing-shared-path'), option('c', 'As soon as one word is removed.', 'discarding-other-words'), option('d', 'Only at the root.', 'preventing-valid-pruning')], correctOptionId: 'a',
    explanation: 'A removable node supports no remaining word. Children or a terminal marker show that another stored word still needs it.',
  }),
  question({
    questionId: 'core250-trie-prefix-reuse', title: 'Reuse a shared prefix', topicId: 'trees', difficulty: 'foundation', activityId: 'shared-prefix-storage-v1', conceptIds: ['trie-structure', 'prefix-sharing'],
    prompt: 'Why can a trie use less character storage than separate word strings when many words begin with the same letters?',
    options: [option('a', 'Words share one path for the common prefix.'), option('b', 'It stores no characters.', 'denying-data-storage'), option('c', 'It sorts every word.', 'confusing-structure-with-sort'), option('d', 'It removes all suffixes.', 'losing-word-information')], correctOptionId: 'a',
    explanation: 'The common prefix appears once as linked nodes. Each word then branches only where its remaining characters differ.',
  }),
  question({
    questionId: 'core250-heap-running-median-halves', title: 'Balance the median halves', topicId: 'arrays-hashing', difficulty: 'intermediate', activityId: 'running-median-heaps-v1', conceptIds: ['two-heaps', 'balance-invariant'],
    prompt: 'A running-median structure uses a max heap for the lower half and a min heap for the upper half. What size condition should it maintain?',
    options: [option('a', 'Their sizes differ by at most one.'), option('b', 'The lower heap always has twice as many values.', 'inventing-size-rule'), option('c', 'Both heaps contain every value.', 'duplicating-input'), option('d', 'The upper heap must be empty.', 'discarding-upper-half')], correctOptionId: 'a',
    explanation: 'Balanced heap sizes keep the middle value or values at the roots. The roots then provide the median directly.',
  }),
  question({
    questionId: 'core250-heap-cooldown-ready-time', title: 'Release a ready task', topicId: 'heaps', difficulty: 'intermediate', activityId: 'task-cooldown-schedule-v1', conceptIds: ['priority-queue', 'time-simulation'],
    prompt: 'A scheduler keeps delayed tasks in a min heap by ready time. At time t, what should it do with every task whose ready time is at most t?',
    options: [option('a', 'Move it back to the available-task heap.'), option('b', 'Delete it permanently.', 'discarding-ready-work'), option('c', 'Delay it by one more cycle.', 'adding-unneeded-delay'), option('d', 'Run every delayed task at once.', 'violating-single-task-step')], correctOptionId: 'a',
    explanation: 'A task becomes eligible when its cooldown ends. The available heap can then choose it by the scheduling priority.',
  }),
  question({
    questionId: 'core250-heap-k-smallest-root', title: 'Keep the largest selected value on top', topicId: 'heaps', difficulty: 'intermediate', activityId: 'k-smallest-stream-v1', conceptIds: ['bounded-heap', 'stream-selection'],
    prompt: 'A scan must keep the k smallest values seen so far. Which heap root makes replacement decisions direct?',
    options: [option('a', 'The largest selected value in a max heap.'), option('b', 'The smallest selected value in a min heap.', 'wrong-replacement-boundary'), option('c', 'The final input value.', 'using-position-not-selection'), option('d', 'The sum of selected values.', 'using-unrelated-metric')], correctOptionId: 'a',
    explanation: 'The max-heap root is the selected value that a smaller new value should replace. The heap stays bounded at k values.',
  }),
  question({
    questionId: 'core250-union-find-path-compression', title: 'Shorten a parent path', topicId: 'trees', difficulty: 'intermediate', activityId: 'component-root-compression-v1', conceptIds: ['disjoint-set', 'path-compression'],
    prompt: 'During a disjoint-set find operation, what does path compression do after it finds the root?',
    options: [option('a', 'It points visited nodes directly to the root.'), option('b', 'It removes the root.', 'destroying-component'), option('c', 'It joins all components.', 'changing-connectivity'), option('d', 'It sorts node identifiers.', 'using-unrelated-operation')], correctOptionId: 'a',
    explanation: 'Direct parent links shorten later find paths. The component membership remains unchanged.',
  }),
  question({
    questionId: 'core250-union-find-size-attachment', title: 'Attach the smaller component', topicId: 'trees', difficulty: 'intermediate', activityId: 'component-size-union-v1', conceptIds: ['disjoint-set', 'union-by-size'],
    prompt: 'When joining two disjoint-set roots, why attach the smaller component under the larger component?',
    options: [option('a', 'It limits the growth of tree height.'), option('b', 'It guarantees numeric root order.', 'confusing-size-with-id'), option('c', 'It creates one root per node.', 'reversing-union-goal'), option('d', 'It removes all parent links.', 'destroying-set-structure')], correctOptionId: 'a',
    explanation: 'Small trees gain depth when attached. Attaching them below larger trees reduces how often any node depth can grow.',
  }),
  question({
    questionId: 'core250-dijkstra-edge-requirement', title: 'Require nonnegative edges', topicId: 'trees', difficulty: 'advanced', activityId: 'weighted-route-greedy-v1', conceptIds: ['shortest-path', 'dijkstra'],
    prompt: 'Why does Dijkstra’s algorithm require nonnegative edge weights?',
    options: [option('a', 'A settled shortest distance must not become smaller later.'), option('b', 'It needs every edge to have weight one.', 'confusing-weighted-with-unweighted'), option('c', 'It cannot use a priority queue.', 'denying-core-data-structure'), option('d', 'It must visit vertices alphabetically.', 'using-unrelated-order')], correctOptionId: 'a',
    explanation: 'A negative edge could create a shorter route to a settled vertex. Nonnegative edges preserve the greedy settlement decision.',
  }),
  question({
    questionId: 'core250-interval-insert-before-overlap', title: 'Append a separated interval', topicId: 'graphs', difficulty: 'foundation', activityId: 'sorted-range-insert-v1', conceptIds: ['interval-insertion', 'sorted-ranges'],
    prompt: 'Sorted nonoverlapping intervals end before a new interval begins. What should insertion do with each such earlier interval?',
    options: [option('a', 'Append it unchanged before the new interval.'), option('b', 'Merge it with the new interval.', 'merging-separated-ranges'), option('c', 'Discard it.', 'losing-existing-range'), option('d', 'Move it after every later interval.', 'breaking-sorted-order')], correctOptionId: 'a',
    explanation: 'An interval that ends before the new range starts cannot overlap it. Its sorted position is already final.',
  }),
  question({
    questionId: 'core250-interval-removal-earliest-finish', title: 'Keep the earliest finish', topicId: 'graphs', difficulty: 'intermediate', activityId: 'minimum-overlap-removals-v1', conceptIds: ['greedy-selection', 'interval-scheduling'],
    prompt: 'Two overlapping intervals force one removal. Which interval should a greedy algorithm keep to leave the most room for later intervals?',
    options: [option('a', 'The interval with the earlier end.'), option('b', 'The interval with the earlier start.', 'using-wrong-boundary'), option('c', 'The longer interval.', 'reducing-future-space'), option('d', 'Both intervals.', 'keeping-conflict')], correctOptionId: 'a',
    explanation: 'An earlier end leaves at least as much room for each future interval. It is never worse for the remaining schedule.',
  }),
  question({
    questionId: 'core250-interval-sweep-tie-order', title: 'Process an end before a start', topicId: 'graphs', difficulty: 'advanced', activityId: 'meeting-boundary-sweep-v1', conceptIds: ['sweep-line', 'endpoint-order'],
    prompt: 'Meetings use half-open ranges [start, end). One meeting ends at time 12 as another begins. Which sweep event should run first?',
    options: [option('a', 'Process the end event first.'), option('b', 'Process the start event first.', 'counting-touching-as-overlap'), option('c', 'Process both as one added meeting.', 'combining-separate-events'), option('d', 'Ignore both events.', 'discarding-boundary')], correctOptionId: 'a',
    explanation: 'The first meeting no longer occupies time 12. Processing its end first avoids counting a false overlap.',
  }),
  question({
    questionId: 'core250-bit-enable-mask', title: 'Enable selected bits', topicId: 'arrays-hashing', difficulty: 'foundation', activityId: 'flag-enable-mask-v1', conceptIds: ['bitmask', 'bitwise-or'],
    prompt: 'An integer stores feature flags. Which operation turns on every bit that is set in mask while preserving other set bits?',
    options: [option('a', 'value OR mask.'), option('b', 'value AND mask.', 'clearing-unmasked-bits'), option('c', 'value XOR mask.', 'toggling-existing-bits'), option('d', 'value minus mask.', 'using-arithmetic-not-mask')], correctOptionId: 'a',
    explanation: 'OR makes each masked bit one. Bits that are already one remain one.',
  }),
  question({
    questionId: 'core250-bit-test-mask', title: 'Test a required flag', topicId: 'bit-manipulation', difficulty: 'foundation', activityId: 'flag-test-mask-v1', conceptIds: ['bitmask', 'bitwise-and'],
    prompt: 'How can a program test whether a one-bit mask is set in value?',
    options: [option('a', 'Check whether value AND mask is nonzero.'), option('b', 'Check whether value OR mask is zero.', 'using-always-nonzero-operation'), option('c', 'Add mask to value.', 'changing-the-value'), option('d', 'Divide value by mask.', 'using-arithmetic-not-bit-test')], correctOptionId: 'a',
    explanation: 'AND retains a bit only when both operands contain it. A nonzero result shows that the requested bit is set.',
  }),
  question({
    questionId: 'core250-bit-clear-lowest-set', title: 'Clear one lowest set bit', topicId: 'bit-manipulation', difficulty: 'intermediate', activityId: 'set-bit-count-loop-v1', conceptIds: ['bit-counting', 'bitwise-and'],
    prompt: 'For a positive integer n, what does n AND (n minus 1) do?',
    options: [option('a', 'It clears the lowest set bit.'), option('b', 'It sets the lowest clear bit.', 'reversing-bit-change'), option('c', 'It doubles n.', 'confusing-bitwise-with-arithmetic'), option('d', 'It reverses all bits.', 'inventing-transformation')], correctOptionId: 'a',
    explanation: 'Subtracting one changes the lowest set bit to zero and flips lower zeros. AND keeps higher bits and clears that bit.',
  }),
  question({
    questionId: 'core250-matrix-clockwise-rotation', title: 'Rotate a square matrix', topicId: 'math-geometry', difficulty: 'intermediate', activityId: 'square-grid-clockwise-rotation-v1', conceptIds: ['matrix-transform', 'in-place-algorithm'],
    prompt: 'Which two in-place steps rotate a square matrix 90 degrees clockwise?',
    options: [option('a', 'Transpose it, then reverse every row.'), option('b', 'Transpose it, then reverse every column.', 'rotating-opposite-direction'), option('c', 'Reverse every row twice.', 'returning-original-matrix'), option('d', 'Sort each row.', 'destroying-grid-positions')], correctOptionId: 'a',
    explanation: 'Transposition exchanges rows and columns. Reversing each row moves each value to its clockwise rotated column position.',
  }),
  question({
    questionId: 'core250-geometry-normalized-slope', title: 'Normalize a line direction', topicId: 'math-geometry', difficulty: 'advanced', activityId: 'collinear-point-slope-key-v1', conceptIds: ['greatest-common-divisor', 'coordinate-geometry'],
    prompt: 'A point map groups other points by the direction from one anchor. Why reduce delta x and delta y by their greatest common divisor?',
    options: [option('a', 'Equal directions receive the same slope key.'), option('b', 'It changes all directions to horizontal.', 'destroying-direction'), option('c', 'It removes negative coordinates.', 'discarding-coordinate-sign'), option('d', 'It measures only the distance.', 'using-wrong-geometry-property')], correctOptionId: 'a',
    explanation: 'Proportional direction pairs such as (2, 4) and (1, 2) reduce to the same values. Normalize signs too for a stable key.',
  }),
]);
