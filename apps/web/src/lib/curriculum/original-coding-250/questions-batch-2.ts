import {
  freezeOriginalCodingQuestion,
  type CodingQuestionExample,
  type CodingQuestionDifficulty,
  type OriginalCodingQuestion,
} from '@leetcode-app/domain';

type Input = Readonly<{
  id: string;
  topic: OriginalCodingQuestion['topic'];
  difficulty: CodingQuestionDifficulty;
  estimatedMinutes: number;
  title: string;
  prompt: string;
  functionName: string;
  functionSignature: string;
  constraints: readonly string[];
  examples: readonly CodingQuestionExample[];
  starterDraft: string;
  conceptIds: readonly string[];
}>;

const codingQuestion = (input: Input): OriginalCodingQuestion => freezeOriginalCodingQuestion({
  ...input,
  provenance: { kind: 'original', authorId: 'original-coding-catalog-author-b2', authoredAt: '2026-11-16T21:00:00.000Z' },
  status: 'in_review',
  reviewerId: null,
});

/** Original coding questions. These records need language checks before publication. */
export const originalCoding250Batch2: readonly OriginalCodingQuestion[] = Object.freeze([
  codingQuestion({
    id: 'tree-level-gap', topic: 'trees', difficulty: 'foundation', estimatedMinutes: 15,
    title: 'Measure the widest tree level', prompt: 'Return the largest number of non-null nodes that occur at one depth in a binary tree.',
    functionName: 'widestLevel', functionSignature: 'root: TreeNode | null',
    constraints: ['The tree has at most 100,000 nodes.', 'Return zero for an empty tree.', 'Use one breadth-first traversal.'],
    examples: [{ input: 'root = [8, 3, 10, 1, 6, null, 14]', output: '3', note: 'The third level contains 1, 6, and 14.' }],
    starterDraft: 'Return zero for an empty root. Put the root in a queue. For each queue level, record its size and update the largest size. Add non-null children to the next level.',
    conceptIds: ['breadth-first-search', 'level-order'],
  }),
  codingQuestion({
    id: 'tree-ordered-range-total', topic: 'trees', difficulty: 'intermediate', estimatedMinutes: 20,
    title: 'Total values in a search-tree range', prompt: 'Return the sum of values in a binary search tree that are within an inclusive lower and upper bound.',
    functionName: 'rangeTotal', functionSignature: 'root: TreeNode | null, low: number, high: number',
    constraints: ['The tree has at most 100,000 nodes.', 'low is less than or equal to high.', 'Use the search-tree ordering to skip irrelevant branches.'],
    examples: [{ input: 'root = [7, 4, 11, 2, 5, 9, 13], low = 5, high = 11', output: '32', note: 'The included values are 5, 7, 9, and 11.' }],
    starterDraft: 'Stop at an empty node. Add the current value when it is within range. Skip the left branch when the value is below low. Skip the right branch when the value is above high.',
    conceptIds: ['binary-search-tree', 'tree-pruning'],
  }),
  codingQuestion({
    id: 'tree-visible-right-edge', topic: 'trees', difficulty: 'intermediate', estimatedMinutes: 20,
    title: 'Collect the right edge view', prompt: 'Return the last node value at each depth when a binary tree is scanned from left to right.',
    functionName: 'rightEdgeValues', functionSignature: 'root: TreeNode | null',
    constraints: ['The tree has at most 100,000 nodes.', 'Return an empty list for an empty tree.', 'Preserve level order in the result.'],
    examples: [{ input: 'root = [4, 2, 9, null, 3, 7, 11]', output: '[4, 9, 11]', note: 'The last node at each depth is visible.' }],
    starterDraft: 'Use a queue for one level at a time. Remember the final node removed from each level. Add that value to the result before processing the next level.',
    conceptIds: ['level-order', 'queue'],
  }),
  codingQuestion({
    id: 'tree-descendant-target', topic: 'trees', difficulty: 'advanced', estimatedMinutes: 30,
    title: 'Find a downward target path', prompt: 'Return true when a binary tree has a downward parent-to-child path whose values total target. A path may start at any node.',
    functionName: 'hasDownwardTotal', functionSignature: 'root: TreeNode | null, target: number',
    constraints: ['The tree has at most 100,000 nodes.', 'Node values can be negative.', 'A path must contain at least one node.'],
    examples: [{ input: 'root = [5, 3, 8, 2, 4, -1, 6], target = 12', output: 'true', note: 'The path 5, 3, 4 totals 12.' }],
    starterDraft: 'Keep a running prefix total while traversing. Store earlier prefix totals on the current root-to-node path. A matching earlier total shows a path ending at this node.',
    conceptIds: ['tree-traversal', 'prefix-sum'],
  }),
  codingQuestion({
    id: 'trie-shared-prefix-count', topic: 'tries', difficulty: 'foundation', estimatedMinutes: 18,
    title: 'Count registered prefixes', prompt: 'Build a prefix registry from lowercase words. Return how many stored words begin with each query prefix.',
    functionName: 'prefixCounts', functionSignature: 'words: string[], queries: string[]',
    constraints: ['Words and queries contain lowercase letters only.', 'The total input length is at most 200,000.', 'Repeated words count separately.'],
    examples: [{ input: 'words = ["mint", "mine", "map"], queries = ["mi", "min", "ma"]', output: '[2, 2, 1]', note: 'Two words begin with mi and min.' }],
    starterDraft: 'Create a trie node with child links and a pass count. Insert each word and increase the pass count on every visited node. Follow each query path and return its pass count or zero.',
    conceptIds: ['trie', 'prefix-count'],
  }),
  codingQuestion({
    id: 'trie-pattern-token-match', topic: 'tries', difficulty: 'advanced', estimatedMinutes: 30,
    title: 'Match a token pattern', prompt: 'Return true when a word registry contains a word matching a pattern. The question mark matches exactly one lowercase letter.',
    functionName: 'matchesTokenPattern', functionSignature: 'words: string[], pattern: string',
    constraints: ['Words and patterns contain lowercase letters and question marks.', 'The total word length is at most 100,000.', 'A question mark matches one character only.'],
    examples: [{ input: 'words = ["harbor", "harvest", "harden"], pattern = "har?or"', output: 'true', note: 'harbor matches the pattern.' }],
    starterDraft: 'Insert each word into a trie with an end marker. Walk exact letters through one child. At a question mark, recursively try each child. Accept only when the pattern and a word end together.',
    conceptIds: ['trie', 'depth-first-search'],
  }),
  codingQuestion({
    id: 'backtrack-unique-sum-bundles', topic: 'backtracking', difficulty: 'foundation', estimatedMinutes: 22,
    title: 'List unique target bundles', prompt: 'Return all unique combinations of distinct input values that total target. Use each input position at most once.',
    functionName: 'uniqueTargetBundles', functionSignature: 'values: number[], target: number',
    constraints: ['values has at most 20 items.', 'Values are positive integers.', 'Return each combination in nondecreasing order.'],
    examples: [{ input: 'values = [2, 4, 5, 7], target = 9', output: '[[2, 7], [4, 5]]', note: 'Both returned pairs total 9.' }],
    starterDraft: 'Sort the values. Choose or skip each later position. Stop when the remaining target is zero. Skip equal values at the same recursion depth to avoid duplicate combinations.',
    conceptIds: ['backtracking', 'duplicate-control'],
  }),
  codingQuestion({
    id: 'backtrack-grid-word-route', topic: 'backtracking', difficulty: 'intermediate', estimatedMinutes: 25,
    title: 'Trace a word through a letter grid', prompt: 'Return true when adjacent grid cells can spell word. Moves use up, down, left, or right. Do not reuse a cell in one route.',
    functionName: 'hasLetterRoute', functionSignature: 'grid: string[][], word: string',
    constraints: ['The grid has at most 400 cells.', 'word has at most 30 letters.', 'All letters are uppercase A through Z.'],
    examples: [{ input: 'grid = [["A", "R", "T"], ["L", "O", "N"]], word = "ARON"', output: 'true', note: 'The route uses A, R, O, then N.' }],
    starterDraft: 'Start a depth-first search at each matching first letter. Mark a chosen cell for the current route. Search matching neighbors for the next letter. Restore the cell before returning.',
    conceptIds: ['backtracking', 'grid-search'],
  }),
  codingQuestion({
    id: 'backtrack-nonadjacent-picks', topic: 'backtracking', difficulty: 'intermediate', estimatedMinutes: 25,
    title: 'Choose nonadjacent positions', prompt: 'Return the largest sum from a list when selected positions cannot be adjacent. Also return one valid set of selected positions.',
    functionName: 'bestSpacedSelection', functionSignature: 'values: number[]',
    constraints: ['values has at most 24 items.', 'Values can be negative.', 'Return an empty selection when every sum is negative.'],
    examples: [{ input: 'values = [4, 9, 3, 8]', output: '{sum: 17, positions: [1, 3]}', note: 'Positions 1 and 3 are not adjacent.' }],
    starterDraft: 'At each position, branch into skip and choose. A choose branch advances two positions. Track the best sum and selected positions. Copy the selected list when recording a new best.',
    conceptIds: ['backtracking', 'state-restoration'],
  }),
  codingQuestion({
    id: 'backtrack-balanced-symbols', topic: 'backtracking', difficulty: 'advanced', estimatedMinutes: 30,
    title: 'Generate balanced symbol strings', prompt: 'Return all strings with count opening and count closing parentheses that are balanced at every prefix.',
    functionName: 'balancedSymbolStrings', functionSignature: 'count: number',
    constraints: ['0 is less than or equal to count and count is at most 10.', 'Return strings in lexical order.', 'An empty input count returns one empty string.'],
    examples: [{ input: 'count = 2', output: '["(())", "()()"]', note: 'Both strings have two matched pairs.' }],
    starterDraft: 'Track openings and closings used. Add an opening while openings remain. Add a closing only when closings are fewer than openings. Record a string when both counts reach the limit.',
    conceptIds: ['backtracking', 'prefix-invariant'],
  }),
  codingQuestion({
    id: 'heap-service-queue-order', topic: 'heaps', difficulty: 'foundation', estimatedMinutes: 18,
    title: 'Schedule urgent service requests', prompt: 'Return request identifiers in service order. Lower priority numbers run first. Equal priority requests keep their arrival order.',
    functionName: 'serviceOrder', functionSignature: 'requests: { id: string, priority: number }[]',
    constraints: ['requests has at most 100,000 entries.', 'Priorities are integers from 0 through 1,000,000.', 'Each identifier is unique.'],
    examples: [{ input: 'requests = [{id:"a", priority:3}, {id:"b", priority:1}, {id:"c", priority:1}]', output: '["b", "c", "a"]', note: 'b and c retain arrival order.' }],
    starterDraft: 'Store each request with its priority and arrival index in a min-heap. Remove items until the heap is empty. Compare priority first and arrival index second.',
    conceptIds: ['priority-queue', 'stable-order'],
  }),
  codingQuestion({
    id: 'heap-calendar-stream-merge', topic: 'heaps', difficulty: 'intermediate', estimatedMinutes: 25,
    title: 'Merge scheduled event streams', prompt: 'Merge several individually sorted event-time lists into one sorted list of event times.',
    functionName: 'mergeEventStreams', functionSignature: 'streams: number[][]',
    constraints: ['The total number of events is at most 100,000.', 'Each stream is sorted in nondecreasing order.', 'Keep duplicate event times.'],
    examples: [{ input: 'streams = [[1, 8], [2, 4, 10], [3, 9]]', output: '[1, 2, 3, 4, 8, 9, 10]', note: 'The result preserves every event time.' }],
    starterDraft: 'Put the first event from each nonempty stream in a min-heap. Remove the smallest event. Add the following event from the same stream. Continue until the heap is empty.',
    conceptIds: ['priority-queue', 'k-way-merge'],
  }),
  codingQuestion({
    id: 'heap-running-middle-value', topic: 'heaps', difficulty: 'advanced', estimatedMinutes: 30,
    title: 'Report each running middle value', prompt: 'For each prefix of integer values, return its median. For an even prefix, return the lower middle value.',
    functionName: 'runningLowerMedians', functionSignature: 'values: number[]',
    constraints: ['values has at most 100,000 items.', 'Values fit in a signed 32-bit integer.', 'Target O(n log n) time.'],
    examples: [{ input: 'values = [6, 2, 9, 4]', output: '[6, 2, 6, 4]', note: 'The lower middle is used for even prefixes.' }],
    starterDraft: 'Keep a max-heap for the lower half and a min-heap for the upper half. Insert each value into the correct half. Rebalance so the lower half has equal size or one extra value.',
    conceptIds: ['two-heaps', 'balance-invariant'],
  }),
  codingQuestion({
    id: 'graph-component-areas', topic: 'graphs', difficulty: 'foundation', estimatedMinutes: 18,
    title: 'Measure connected work areas', prompt: 'Return the size of each connected component in an undirected graph. Return component sizes in ascending order.',
    functionName: 'componentAreas', functionSignature: 'nodeCount: number, edges: number[][]',
    constraints: ['nodeCount is at most 100,000.', 'Edges have valid distinct endpoints.', 'Isolated nodes form components of size one.'],
    examples: [{ input: 'nodeCount = 6, edges = [[0, 1], [1, 2], [4, 5]]', output: '[1, 2, 3]', note: 'Node 3 is isolated.' }],
    starterDraft: 'Build adjacency lists. For each unvisited node, use a queue or stack to visit its component. Count visited nodes for that traversal. Sort the completed component sizes.',
    conceptIds: ['graph-traversal', 'connected-components'],
  }),
  codingQuestion({
    id: 'graph-directed-route-check', topic: 'graphs', difficulty: 'intermediate', estimatedMinutes: 22,
    title: 'Check a directed route', prompt: 'Return true when a directed graph has a route from start to destination.',
    functionName: 'hasDirectedRoute', functionSignature: 'nodeCount: number, edges: number[][], start: number, destination: number',
    constraints: ['nodeCount is at most 100,000.', 'Edges can contain cycles.', 'start and destination are valid nodes.'],
    examples: [{ input: 'nodeCount = 5, edges = [[0, 2], [2, 4], [1, 3]], start = 0, destination = 4', output: 'true', note: 'The route is 0 to 2 to 4.' }],
    starterDraft: 'Build outgoing adjacency lists. Start a queue or stack at start. Mark nodes when adding them to the frontier. Return true when destination is reached.',
    conceptIds: ['graph-traversal', 'visited-set'],
  }),
  codingQuestion({
    id: 'graph-dependency-finish-order', topic: 'graphs', difficulty: 'intermediate', estimatedMinutes: 25,
    title: 'Order build tasks', prompt: 'Return a valid task order from prerequisite pairs. Return an empty list when the dependencies contain a cycle.',
    functionName: 'buildTaskOrder', functionSignature: 'tasks: string[], prerequisites: string[][]',
    constraints: ['There are at most 100,000 tasks and prerequisite pairs.', 'Task names are unique.', 'Each pair is [task, prerequisite].'],
    examples: [{ input: 'tasks = ["lint", "test", "ship"], prerequisites = [["test", "lint"], ["ship", "test"]]', output: '["lint", "test", "ship"]', note: 'Every prerequisite comes before its dependent task.' }],
    starterDraft: 'Count incoming prerequisites for every task. Put zero-count tasks in a queue. Remove each queued task and reduce its dependents. Return an empty list when not every task is processed.',
    conceptIds: ['topological-sort', 'indegree'],
  }),
  codingQuestion({
    id: 'graph-safe-terminal-nodes', topic: 'graphs', difficulty: 'advanced', estimatedMinutes: 30,
    title: 'Find nodes with only safe exits', prompt: 'Return all directed-graph nodes from which every possible route eventually reaches a node with no outgoing edge.',
    functionName: 'safeExitNodes', functionSignature: 'edges: number[][]',
    constraints: ['The graph has at most 100,000 nodes and edges.', 'Return node identifiers in ascending order.', 'A cycle is not a safe exit.'],
    examples: [{ input: 'edges = [[1], [2], [], [4], [3]]', output: '[0, 1, 2]', note: 'Nodes 3 and 4 remain in a cycle.' }],
    starterDraft: 'Reverse every edge and count each node’s outgoing edges. Start a queue with terminal nodes. Remove a known-safe node and reduce its predecessors’ remaining outgoing count. Sort the safe nodes.',
    conceptIds: ['reverse-graph', 'topological-elimination'],
  }),
  codingQuestion({
    id: 'advanced-graph-signal-arrival', topic: 'advanced-graphs', difficulty: 'intermediate', estimatedMinutes: 28,
    title: 'Find the final signal arrival', prompt: 'A directed network has nonnegative travel times. Return the time when every node first receives a signal from source, or -1 when a node is unreachable.',
    functionName: 'finalSignalArrival', functionSignature: 'nodeCount: number, edges: number[][], source: number',
    constraints: ['nodeCount is at most 100,000.', 'Each edge is [from, to, time].', 'Travel times are nonnegative integers.'],
    examples: [{ input: 'nodeCount = 4, edges = [[0, 1, 2], [0, 2, 5], [1, 2, 1], [2, 3, 3]], source = 0', output: '6', note: 'The last first arrival is at node 3.' }],
    starterDraft: 'Store best arrival times. Put source at time zero in a min-heap. Ignore a heap entry when it is worse than the stored time. Relax outgoing edges and return the largest final time.',
    conceptIds: ['shortest-path', 'dijkstra'],
  }),
  codingQuestion({
    id: 'advanced-graph-minimum-link-cost', topic: 'advanced-graphs', difficulty: 'advanced', estimatedMinutes: 32,
    title: 'Connect stations at minimum cost', prompt: 'Return the smallest total cost needed to connect every station with undirected links. Return -1 when full connection is impossible.',
    functionName: 'minimumLinkCost', functionSignature: 'stationCount: number, links: number[][]',
    constraints: ['stationCount is at most 100,000.', 'Each link is [left, right, cost].', 'Link costs are nonnegative integers.'],
    examples: [{ input: 'stationCount = 4, links = [[0, 1, 4], [0, 2, 3], [1, 2, 1], [2, 3, 2]]', output: '6', note: 'Choose costs 1, 2, and 3.' }],
    starterDraft: 'Sort links by cost. Keep a disjoint-set structure for station components. Add a link only when it joins different components. Return the total after stationCount minus one links.',
    conceptIds: ['minimum-spanning-tree', 'disjoint-set'],
  }),
  codingQuestion({
    id: 'advanced-graph-limited-hop-route', topic: 'advanced-graphs', difficulty: 'advanced', estimatedMinutes: 35,
    title: 'Find a route with limited hops', prompt: 'Return the least travel cost from source to destination using at most maxHops edges. Return -1 when no such route exists.',
    functionName: 'limitedHopCost', functionSignature: 'nodeCount: number, edges: number[][], source: number, destination: number, maxHops: number',
    constraints: ['nodeCount is at most 100 nodes.', 'Each edge is [from, to, cost].', 'Costs are nonnegative integers.'],
    examples: [{ input: 'nodeCount = 4, edges = [[0, 1, 3], [1, 3, 3], [0, 2, 1], [2, 3, 9]], source = 0, destination = 3, maxHops = 2', output: '6', note: 'The two-hop route through node 1 is cheaper.' }],
    starterDraft: 'Keep the cheapest known cost for each node after each hop count. Relax every edge from the previous hop layer into a fresh next layer. Return the smallest destination cost across permitted layers.',
    conceptIds: ['bounded-relaxation', 'dynamic-programming'],
  }),
]);
