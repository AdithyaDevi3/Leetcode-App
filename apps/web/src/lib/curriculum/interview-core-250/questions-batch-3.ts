import 'server-only';
import {
  freezeQuestionVersion,
  questionVersionKey,
  type InterviewCurriculumTopic,
  type QuestionDifficulty,
  type QuestionOption,
  type QuestionVersion,
} from '@leetcode-app/domain';

export const interviewCore250Batch3Topics = [
  'arrays-hashing', 'trees', 'graphs', 'dynamic-programming-1d',
  'dynamic-programming-2d', 'greedy',
] as const satisfies readonly InterviewCurriculumTopic[];

type Topic = typeof interviewCore250Batch3Topics[number];
type Input = { questionId: string; title: string; topicId: Topic; difficulty: QuestionDifficulty; activityId: string; conceptIds: string[]; prompt: string; options: QuestionOption[]; correctOptionId: string; explanation: string };
const option = (id: string, text: string, misconception?: string): QuestionOption => ({ id, text, misconceptionTags: misconception ? [misconception] : [] });
const question = (input: Input): QuestionVersion => freezeQuestionVersion({
  questionId: input.questionId, version: 1, versionId: questionVersionKey(input.questionId, 1), kind: 'multiple_choice', status: 'in_review', title: input.title, prompt: input.prompt, difficulty: input.difficulty,
  activityIds: [input.activityId], conceptIds: [input.topicId, ...input.conceptIds], options: input.options, correctOptionId: input.correctOptionId, explanation: input.explanation,
  provenance: { kind: 'original', authorId: 'interview-core-250-original-author-v3', authoredAt: '2026-11-16T14:00:00.000Z' }, review: null,
});

/** Original material awaiting independent review. The live catalog does not import it. */
export const interviewCore250Batch3Questions: readonly QuestionVersion[] = Object.freeze([
  question({
    questionId: 'core250-group-words-by-signature', title: 'Choose a stable group key', topicId: 'arrays-hashing', difficulty: 'foundation', activityId: 'word-signature-groups-v1', conceptIds: ['hash-keys', 'canonical-representation'],
    prompt: 'A program groups words that contain the same letters with the same multiplicities. Which key makes words with the same letter multiset map to one group?',
    options: [option('a', 'A sorted copy of the word.'), option('b', 'The word length only.', 'discarding-letter-multiplicity'), option('c', 'The first letter only.', 'using-insufficient-key'), option('d', 'The original word position.', 'using-input-order-as-content')], correctOptionId: 'a',
    explanation: 'Sorting places equal letter multisets in one canonical order. Word length alone cannot distinguish different letters.',
  }),
  question({
    questionId: 'core250-prefix-target-complement', title: 'Look up the needed prior total', topicId: 'arrays-hashing', difficulty: 'intermediate', activityId: 'target-sum-range-v1', conceptIds: ['prefix-sum', 'complement-reasoning'],
    prompt: 'A prefix sum at index i is total. To count earlier prefixes that form a range ending at i with sum target, which prefix total must the frequency map contain?',
    options: [option('a', 'total minus target.'), option('b', 'total plus target.', 'reversing-complement'), option('c', 'target only.', 'discarding-current-prefix'), option('d', 'The array length.', 'using-unrelated-state')], correctOptionId: 'a',
    explanation: 'If total - prior equals target, then prior is total minus target. Every stored occurrence of that prior total supplies one range.',
  }),
  question({
    questionId: 'core250-duplicate-detection-before-store', title: 'Check before adding', topicId: 'arrays-hashing', difficulty: 'foundation', activityId: 'first-repeat-event-v1', conceptIds: ['set-membership', 'scan-order'],
    prompt: 'A scan must report the first arriving value that has appeared earlier. When should the scan test membership in its seen set?',
    options: [option('a', 'Before adding the current value.'), option('b', 'Only after the full scan.', 'losing-first-repeat-order'), option('c', 'After clearing the set.', 'discarding-history'), option('d', 'Only when the value is negative.', 'inventing-value-restriction')], correctOptionId: 'a',
    explanation: 'The set must represent earlier values at the membership test. Adding first would make every current value appear to be a repeat.',
  }),
  question({
    questionId: 'core250-coordinate-pair-key', title: 'Separate two dimensions', topicId: 'arrays-hashing', difficulty: 'advanced', activityId: 'point-visit-counter-v1', conceptIds: ['composite-keys', 'collision-avoidance'],
    prompt: 'A visit map must distinguish integer coordinate pairs, including negative values. Which key construction is safe without relying on numeric concatenation?',
    options: [option('a', 'Serialize as `${x},${y}` with a delimiter.'), option('b', 'Use x + y.', 'colliding-coordinate-pairs'), option('c', 'Use x * y.', 'colliding-coordinate-pairs'), option('d', 'Use the larger coordinate only.', 'discarding-one-dimension')], correctOptionId: 'a',
    explanation: 'A delimiter preserves both coordinate boundaries. Addition and multiplication map many different pairs to the same value.',
  }),
  question({
    questionId: 'core250-bst-range-bound', title: 'Carry strict ancestor bounds', topicId: 'trees', difficulty: 'intermediate', activityId: 'search-tree-validation-v1', conceptIds: ['bst-invariant', 'recursion'],
    prompt: 'A binary-search-tree validator visits a node in the right subtree of value 10. What lower bound must still apply even if its direct parent is 12?',
    options: [option('a', 'The node must be greater than 10.'), option('b', 'The node must be less than 10.', 'reversing-subtree-bound'), option('c', 'The node only needs to differ from 12.', 'checking-parent-only'), option('d', 'The node must equal 12.', 'requiring-duplicate-parent')], correctOptionId: 'a',
    explanation: 'Every descendant in the right subtree of 10 must remain greater than 10. Parent-only comparisons miss violations deeper in a subtree.',
  }),
  question({
    questionId: 'core250-tree-level-start-count', title: 'Measure one level before processing', topicId: 'trees', difficulty: 'foundation', activityId: 'tree-level-groups-v1', conceptIds: ['breadth-first-search', 'queue-boundary'],
    prompt: 'A breadth-first traversal must return one list of values for each tree depth. What queue value identifies the number of nodes in the current level?',
    options: [option('a', 'The queue length before processing that level.'), option('b', 'The total number of tree nodes.', 'using-global-size'), option('c', 'The value at the root.', 'using-node-value-as-count'), option('d', 'The number of null children.', 'counting-absent-nodes')], correctOptionId: 'a',
    explanation: 'Nodes enqueued while processing a level belong to the next level. The starting queue length isolates exactly the current level.',
  }),
  question({
    questionId: 'core250-lowest-common-ancestor-split', title: 'Recognize a search split', topicId: 'trees', difficulty: 'intermediate', activityId: 'search-tree-common-ancestor-v1', conceptIds: ['bst-ordering', 'lowest-common-ancestor'],
    prompt: 'In a BST, target values p and q lie on opposite sides of the current node value. What does that make the current node?',
    options: [option('a', 'Their lowest common ancestor.'), option('b', 'A node that must be skipped.', 'discarding-split-node'), option('c', 'A leaf.', 'assuming-no-children'), option('d', 'The larger target.', 'confusing-node-with-target')], correctOptionId: 'a',
    explanation: 'One target is in each child direction, so neither child subtree contains both. The current node is the first shared ancestor.',
  }),
  question({
    questionId: 'core250-tree-serialization-empty-marker', title: 'Preserve missing children', topicId: 'trees', difficulty: 'advanced', activityId: 'tree-roundtrip-v1', conceptIds: ['tree-serialization', 'structural-invariants'],
    prompt: 'A preorder tree serializer writes values but omits markers for missing children. Why can this fail to preserve the original tree shape?',
    options: [option('a', 'Different shapes can produce the same value sequence.'), option('b', 'Preorder never visits leaves.', 'misunderstanding-traversal'), option('c', 'Values cannot be written as text.', 'rejecting-serialization'), option('d', 'Missing children always occur in pairs.', 'assuming-full-tree')], correctOptionId: 'a',
    explanation: 'Null markers show where a child subtree ends. Without them, a decoder cannot always know which child relationship a later value belongs to.',
  }),
  question({
    questionId: 'core250-graph-visited-at-discovery', title: 'Mark a discovered vertex', topicId: 'graphs', difficulty: 'foundation', activityId: 'component-walk-v1', conceptIds: ['graph-traversal', 'visited-state'],
    prompt: 'During graph traversal, why should a vertex be marked visited when it is added to the work list?',
    options: [option('a', 'Other edges cannot add the same vertex again.'), option('b', 'It makes every graph acyclic.', 'changing-graph-property'), option('c', 'It removes all outgoing edges.', 'destroying-traversal-data'), option('d', 'It sorts the neighbors.', 'inventing-ordering')], correctOptionId: 'a',
    explanation: 'Marking at discovery records that the vertex already has a pending visit. Later edges then skip it instead of creating duplicate work.',
  }),
  question({
    questionId: 'core250-bipartite-color-conflict', title: 'Detect an equal-color edge', topicId: 'graphs', difficulty: 'intermediate', activityId: 'two-team-graph-v1', conceptIds: ['graph-coloring', 'breadth-first-search'],
    prompt: 'A two-color graph traversal reaches an edge whose endpoints already have the same color. What does this prove?',
    options: [option('a', 'The graph is not bipartite.'), option('b', 'The graph is disconnected.', 'confusing-components-with-conflict'), option('c', 'The edge can be ignored.', 'discarding-constraint'), option('d', 'Every vertex has degree two.', 'inventing-degree-property')], correctOptionId: 'a',
    explanation: 'A bipartite graph requires every edge to cross from one color set to the other. An equal-color edge violates that requirement.',
  }),
  question({
    questionId: 'core250-unweighted-distance-first-visit', title: 'Use the first shortest layer', topicId: 'graphs', difficulty: 'foundation', activityId: 'unweighted-route-length-v1', conceptIds: ['breadth-first-search', 'shortest-path'],
    prompt: 'Why does breadth-first search find shortest edge counts in an unweighted graph when a vertex is first discovered?',
    options: [option('a', 'Vertices are discovered in nondecreasing path length.'), option('b', 'Every graph has one path per vertex.', 'assuming-unique-paths'), option('c', 'Depth-first search runs first.', 'using-wrong-traversal'), option('d', 'Edge weights become zero.', 'changing-input-model')], correctOptionId: 'a',
    explanation: 'BFS exhausts one distance layer before the next. The first discovery therefore has the fewest edges from the start.',
  }),
  question({
    questionId: 'core250-directed-cycle-three-state', title: 'Find an active back edge', topicId: 'graphs', difficulty: 'advanced', activityId: 'dependency-cycle-check-v1', conceptIds: ['depth-first-search', 'cycle-detection'],
    prompt: 'A directed DFS marks vertices unvisited, active, or finished. What edge proves a directed cycle?',
    options: [option('a', 'An edge to an active vertex.'), option('b', 'An edge to a finished vertex.', 'misreading-completed-work'), option('c', 'An edge from the start vertex.', 'assuming-start-causes-cycle'), option('d', 'An edge to an unvisited vertex.', 'normal-discovery-edge')], correctOptionId: 'a',
    explanation: 'An active vertex is on the current DFS path. Returning to it creates a path that loops back to an ancestor.',
  }),
  question({
    questionId: 'core250-dp-count-base-empty-prefix', title: 'Seed the empty construction', topicId: 'dynamic-programming-1d', difficulty: 'foundation', activityId: 'message-decode-count-v1', conceptIds: ['dynamic-programming', 'base-cases'],
    prompt: 'A DP table counts ways to parse a valid message prefix. Why is the empty prefix usually initialized to one way?',
    options: [option('a', 'It represents one completed choice of no symbols.'), option('b', 'It means the message has one character.', 'confusing-empty-with-singleton'), option('c', 'It prevents every invalid prefix.', 'overstating-base-case'), option('d', 'It stores the maximum parse length.', 'using-wrong-metric')], correctOptionId: 'a',
    explanation: 'The empty choice is one way to complete nothing. This lets a valid first token extend a real predecessor state.',
  }),
  question({
    questionId: 'core250-dp-house-adjacent-choice', title: 'Compare take and skip', topicId: 'dynamic-programming-1d', difficulty: 'intermediate', activityId: 'nonadjacent-reward-v1', conceptIds: ['recurrence', 'optimization'],
    prompt: 'A reward sequence forbids taking adjacent positions. At position i, which two alternatives belong in the recurrence?',
    options: [option('a', 'Skip i, or take i plus the best through i-2.'), option('b', 'Take i plus the best through i-1.', 'taking-adjacent-reward'), option('c', 'Take every positive reward.', 'ignoring-adjacency-constraint'), option('d', 'Use only the reward at i.', 'discarding-earlier-optimum')], correctOptionId: 'a',
    explanation: 'Taking i excludes i-1, so its compatible earlier optimum ends at i-2. Skipping i preserves the optimum through i-1.',
  }),
  question({
    questionId: 'core250-dp-partition-reachable-state', title: 'Extend only reachable totals', topicId: 'dynamic-programming-1d', difficulty: 'advanced', activityId: 'equal-load-partition-v1', conceptIds: ['boolean-dynamic-programming', 'state-transition'],
    prompt: 'A Boolean table marks totals reachable from earlier values. When adding a new value v for a 0/1 selection problem, why must totals be scanned downward?',
    options: [option('a', 'The same value cannot make itself available twice in one pass.'), option('b', 'Downward scans sort the values.', 'confusing-update-order-with-sort'), option('c', 'Upward scans use less memory.', 'inventing-memory-difference'), option('d', 'Only negative totals are valid.', 'using-wrong-domain')], correctOptionId: 'a',
    explanation: 'Descending totals read states from before v was applied. Ascending order can reuse v after it has just set a smaller total.',
  }),
  question({
    questionId: 'core250-grid-obstacle-zero-ways', title: 'Block a path state', topicId: 'dynamic-programming-2d', difficulty: 'foundation', activityId: 'obstacle-grid-count-v1', conceptIds: ['grid-dynamic-programming', 'state-transition'],
    prompt: 'A path-count grid allows moves right and down. What value should a blocked cell contribute to the path-count table?',
    options: [option('a', 'Zero paths.'), option('b', 'One path for waiting.', 'treating-block-as-valid'), option('c', 'The sum of its neighbors.', 'passing-through-obstacle'), option('d', 'A negative path count.', 'using-invalid-count')], correctOptionId: 'a',
    explanation: 'No legal route can end at a blocked cell. Setting zero prevents paths from passing through it in later transitions.',
  }),
  question({
    questionId: 'core250-sequence-common-suffix', title: 'Extend matching suffixes', topicId: 'dynamic-programming-2d', difficulty: 'intermediate', activityId: 'common-subsequence-length-v1', conceptIds: ['sequence-dynamic-programming', 'recurrence'],
    prompt: 'Two sequence prefixes end with the same item. In longest-common-subsequence DP, which predecessor extends that matching item?',
    options: [option('a', 'The diagonal prefix state plus one.'), option('b', 'The left state plus two.', 'overcounting-match'), option('c', 'The upper state only.', 'discarding-one-prefix'), option('d', 'The larger item value.', 'using-value-not-length')], correctOptionId: 'a',
    explanation: 'A shared final item can extend a common subsequence of both shorter prefixes. The diagonal state removes one item from each prefix.',
  }),
  question({
    questionId: 'core250-interval-dp-final-split', title: 'Choose the final split point', topicId: 'dynamic-programming-2d', difficulty: 'advanced', activityId: 'optimal-cut-order-v1', conceptIds: ['interval-dynamic-programming', 'subproblem-order'],
    prompt: 'An interval optimization chooses one final split k between endpoints i and j. Which subproblems must be solved before evaluating that split?',
    options: [option('a', 'The intervals from i to k and from k to j.'), option('b', 'Only the full interval i to j.', 'circular-dependency'), option('c', 'Every interval outside i through j.', 'using-unrelated-state'), option('d', 'Only single-element intervals.', 'omitting-larger-subproblems')], correctOptionId: 'a',
    explanation: 'The final split separates the interval into two independent parts. Their optimal results combine with the cost of the chosen split.',
  }),
  question({
    questionId: 'core250-greedy-fuel-current-reach', title: 'Keep a reachable frontier', topicId: 'greedy', difficulty: 'foundation', activityId: 'fuel-stop-feasibility-v1', conceptIds: ['greedy-invariant', 'reachability'],
    prompt: 'A route scan maintains the farthest position reachable from all processed stops. When does the scan prove the next stop cannot be reached?',
    options: [option('a', 'Its position exceeds the farthest reachable position.'), option('b', 'Its fuel amount is positive.', 'treating-positive-fuel-as-failure'), option('c', 'The route has an even number of stops.', 'using-unrelated-property'), option('d', 'It is the first stop.', 'assuming-initial-failure')], correctOptionId: 'a',
    explanation: 'Every processed choice reaches at most the maintained frontier. A stop beyond it has no feasible predecessor path.',
  }),
  question({
    questionId: 'core250-greedy-change-exchange', title: 'Test a local exchange', topicId: 'greedy', difficulty: 'intermediate', activityId: 'resource-allocation-order-v1', conceptIds: ['exchange-argument', 'optimality-proof'],
    prompt: 'What does an exchange argument typically show for a greedy choice?',
    options: [option('a', 'An optimal solution can be changed to use the greedy choice without worsening its result.'), option('b', 'Every possible choice has equal cost.', 'assuming-all-choices-equal'), option('c', 'The greedy choice must be the largest number.', 'confusing-rule-with-value-order'), option('d', 'No proof is needed after testing one example.', 'using-example-as-proof')], correctOptionId: 'a',
    explanation: 'The argument replaces an optimal solution’s competing choice with the greedy one. If the objective does not worsen, an optimal solution exists that starts greedily.',
  }),
]);
