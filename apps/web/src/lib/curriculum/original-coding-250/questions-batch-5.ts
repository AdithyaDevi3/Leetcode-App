import 'server-only';

import {
  freezeOriginalCodingQuestion,
  type CodingQuestionDifficulty,
  type InterviewCurriculumTopic,
  type OriginalCodingQuestion,
} from '@leetcode-app/domain';

type Input = Omit<OriginalCodingQuestion, 'provenance' | 'status' | 'reviewerId'>;

const question = (input: Input): OriginalCodingQuestion => freezeOriginalCodingQuestion({
  ...input,
  provenance: { kind: 'original', authorId: 'original-coding-250-author-batch-5', authoredAt: '2026-11-16T22:00:00.000Z' },
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
  id, topic, difficulty, title, prompt, functionName, functionSignature,
  estimatedMinutes: difficulty === 'foundation' ? 18 : difficulty === 'intermediate' ? 25 : 35,
  constraints: ['Use the stated function contract.', 'Keep the input values unchanged unless the prompt says otherwise.', 'State the time and extra-space cost.'],
  examples: [{ input, output, note }],
  starterDraft,
  conceptIds,
});

/** Original coding questions. Review every record before publication. */
export const originalCoding250Batch5: readonly OriginalCodingQuestion[] = Object.freeze([
  item('tree-nearest-leaf-depth', 'trees', 'foundation', 'Find the nearest leaf depth', 'Return the smallest number of nodes on a root-to-leaf path. Return zero for an empty tree.', 'nearestLeafDepth', 'root: TreeNode | null', 'root = [7, 4, 9, null, null, 8, 11]', '2', 'Node 4 is a leaf at depth 2.', 'Use breadth-first search. Return when the first leaf leaves the queue. The first leaf has the smallest depth.', ['breadth-first-search', 'tree-depth']),
  item('tree-order-validity', 'trees', 'intermediate', 'Check search-tree order', 'Return true when every node in a binary tree satisfies strict binary-search-tree ordering.', 'isStrictSearchTree', 'root: TreeNode | null', 'root = [6, 3, 9, 1, 7]', 'false', 'Value 7 is in the left subtree of 6.', 'Pass a lower and upper bound into each recursive call. Reject a node outside its allowed open range.', ['binary-search-tree', 'range-invariant']),
  item('tree-longest-branch-total', 'trees', 'intermediate', 'Find the largest branch total', 'Return the largest sum on a root-to-leaf path in a binary tree. Node values can be negative.', 'largestBranchTotal', 'root: TreeNode | null', 'root = [4, -2, 7, null, 3, 1, 5]', '16', 'The path 4, 7, 5 totals 16.', 'Return the best child path from each node. Add the current value. A leaf returns its own value.', ['tree-recursion', 'divide-and-combine']),
  item('tree-ancestor-with-missing-nodes', 'trees', 'advanced', 'Find an ancestor when both nodes exist', 'Return the lowest common ancestor of two values only when both values occur in a binary tree. Return null otherwise.', 'commonAncestorIfPresent', 'root: TreeNode | null, first: number, second: number', 'root = [5, 2, 8, 1, 4, 7, 9], first = 1, second = 4', '2', 'Node 2 is the lowest shared ancestor.', 'Return both found flags and the ancestor candidate from each subtree. Accept an ancestor only after confirming both target values exist.', ['postorder', 'recursive-return']),
  item('trie-shortest-replacement', 'tries', 'foundation', 'Replace words with shortest roots', 'Given root words and a sentence, replace each sentence word with its shortest matching root. Keep unmatched words.', 'replaceWithShortestRoots', 'roots: string[], sentence: string', 'roots = ["sun", "stone"], sentence = "sunny stonework rain"', '"sun stone rain"', 'sun and stone replace the longer matching words.', 'Insert roots into a trie with end markers. Scan each sentence word until an end marker or missing child. Use the first end marker found.', ['trie', 'prefix-match']),
  item('trie-ranked-completions', 'tries', 'advanced', 'Return ranked word completions', 'Return up to limit stored words that begin with prefix, ordered by increasing word length and then alphabetically.', 'rankedCompletions', 'words: string[], prefix: string, limit: number', 'words = ["mint", "mine", "min", "map"], prefix = "mi", limit = 3', '["min", "mine", "mint"]', 'Shorter matching words return first.', 'Store words in a trie. Follow the prefix. Collect suffixes below that node, then sort by length and lexical order before taking limit.', ['trie', 'depth-first-search']),
  item('backtrack-fixed-size-groups', 'backtracking', 'foundation', 'List fixed-size groups', 'Return every size-count combination of values from 1 through limit in ascending lexical order.', 'fixedSizeGroups', 'limit: number, count: number', 'limit = 4, count = 2', '[[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]', 'Each group has two distinct values.', 'Build one group at a time. Choose the next value after the previous one. Stop when the group reaches count.', ['backtracking', 'combination-generation']),
  item('backtrack-board-route-count', 'backtracking', 'intermediate', 'Count nonrepeating board routes', 'Return the number of routes from start to finish in an open grid. Move up, down, left, or right and visit each cell at most once per route.', 'countSimpleBoardRoutes', 'grid: number[][], start: number[], finish: number[]', 'grid = [[0, 0], [0, 0]], start = [0, 0], finish = [1, 1]', '2', 'The two routes go right then down, or down then right.', 'Search from start. Mark the current cell before exploring neighbors. Restore the cell after each branch returns.', ['backtracking', 'state-restoration']),
  item('backtrack-restore-address-groups', 'backtracking', 'advanced', 'Restore four number groups', 'Insert three dots into digits to create all valid four-part addresses. Each part is 0 through 255 and has no leading zero unless it is zero.', 'restoreAddressGroups', 'digits: string', 'digits = "10123"', '["1.0.1.23", "1.0.12.3", "10.1.2.3"]', 'Each result has four valid numeric parts.', 'Choose a part with one to three digits. Reject a leading zero or a value above 255. Recurse until four parts consume all digits.', ['backtracking', 'bounded-parsing']),
  item('heap-kth-closest-distance', 'heaps', 'foundation', 'Find the kth closest distance', 'Return the kth smallest nonnegative distance in an unsorted list.', 'kthClosestDistance', 'distances: number[], k: number', 'distances = [9, 2, 6, 1, 5], k = 3', '5', 'The ordered distances are 1, 2, 5, 6, 9.', 'Keep a max heap of the k smallest distances seen. Remove the root when the heap grows beyond k.', ['bounded-heap', 'selection']),
  item('heap-merge-sorted-readings', 'heaps', 'intermediate', 'Merge sorted reading streams', 'Merge ascending reading lists into one ascending list.', 'mergeSortedReadings', 'streams: number[][]', 'streams = [[1, 7], [2, 4, 9], [3, 8]]', '[1, 2, 3, 4, 7, 8, 9]', 'The heap stores the next value from each stream.', 'Put the first value from each nonempty stream in a min heap. Remove the smallest item. Add the next value from its stream.', ['priority-queue', 'k-way-merge']),
  item('heap-most-common-reading', 'heaps', 'advanced', 'Select the most common readings', 'Return the k integer values with the greatest occurrence counts. For equal counts, return the smaller value first.', 'mostCommonReadings', 'values: number[], k: number', 'values = [4, 2, 4, 3, 2, 4], k = 2', '[4, 2]', 'Value 4 occurs three times and value 2 occurs twice.', 'Count values first. Use a bounded heap or frequency buckets to retain the best k values. Apply the tie rule before returning the result.', ['frequency-counting', 'bounded-heap']),
  item('graph-count-separate-clusters', 'graphs', 'foundation', 'Count separate clusters', 'Given an undirected graph with nodes zero through nodeCount minus one, return its number of connected components.', 'countSeparateClusters', 'nodeCount: number, edges: number[][]', 'nodeCount = 5, edges = [[0, 1], [1, 2], [3, 4]]', '2', 'Nodes 0, 1, and 2 form one cluster.', 'Build adjacency lists. Start a traversal from each unvisited node. Mark every reachable node before starting another component.', ['graph-traversal', 'connected-components']),
  item('graph-shortest-ladder', 'graphs', 'intermediate', 'Find a shortest word ladder', 'Return the smallest number of words in a one-letter-change route from start to goal using only allowed words. Return zero when no route exists.', 'shortestWordLadder', 'start: string, goal: string, words: string[]', 'start = "cold", goal = "warm", words = ["cord", "card", "ward", "warm"]', '5', 'The route is cold, cord, card, ward, warm.', 'Use breadth-first search by word layers. Generate one-letter candidates and visit each allowed word once.', ['breadth-first-search', 'implicit-graph']),
  item('graph-safe-course-order', 'graphs', 'intermediate', 'Create a safe course order', 'Return one order that completes every task after its prerequisites. Return an empty list when the prerequisites contain a cycle.', 'safeCourseOrder', 'taskCount: number, prerequisites: number[][]', 'taskCount = 4, prerequisites = [[1, 0], [2, 0], [3, 1], [3, 2]]', '[0, 1, 2, 3]', 'Tasks 1 and 2 can swap positions.', 'Count incoming edges. Start with tasks that have no prerequisites. Remove their outgoing edges and add newly ready tasks.', ['topological-sort', 'indegree']),
  item('graph-two-color-check', 'graphs', 'advanced', 'Check two-color graph groups', 'Return true when an undirected graph can assign one of two colors to every node without equal-colored neighbors.', 'hasTwoColorGroups', 'graph: number[][]', 'graph = [[1, 3], [0, 2], [1, 3], [0, 2]]', 'true', 'The graph is an even cycle.', 'Traverse each component. Assign the opposite color to every neighbor. Reject a neighbor that already has the current color.', ['graph-coloring', 'breadth-first-search']),
  item('graph-water-escape', 'graphs', 'advanced', 'Escape a rising-water grid', 'Return the earliest time to reach the lower-right cell. At time t, you may enter only cells with height at most t.', 'minimumEscapeTime', 'heights: number[][]', 'heights = [[0, 3], [1, 2]]', '2', 'At time 2, move down then right.', 'Use a min heap of reachable frontier cells. Always take the lowest next height. The largest height on the chosen route is the arrival time.', ['priority-queue', 'best-first-search']),
  item('advanced-graph-minimum-wire-cost', 'advanced-graphs', 'foundation', 'Connect stations with minimum wire', 'Return the minimum total wire length that connects every station. Each edge gives two station IDs and a positive cost.', 'minimumWireCost', 'stationCount: number, edges: number[][]', 'stationCount = 4, edges = [[0, 1, 2], [1, 2, 3], [0, 2, 8], [2, 3, 1]]', '6', 'Choose costs 1, 2, and 3.', 'Sort edges by cost. Add an edge only when it joins two separate components. Use a parent structure to test components.', ['minimum-spanning-tree', 'disjoint-set']),
  item('advanced-graph-negative-route-check', 'advanced-graphs', 'intermediate', 'Find paths with negative edges', 'Return shortest distances from source in a directed graph with negative edges. Return null when a reachable negative cycle exists.', 'shortestRoutesWithNegatives', 'nodeCount: number, edges: number[][], source: number', 'nodeCount = 3, edges = [[0, 1, 4], [1, 2, -2], [0, 2, 5]], source = 0', '[0, 4, 2]', 'The route through node 1 improves node 2.', 'Set the source distance to zero. Relax every edge nodeCount minus one times. Run one extra pass to detect a reachable improvement.', ['edge-relaxation', 'negative-cycle']),
  item('advanced-graph-limited-stop-route', 'advanced-graphs', 'advanced', 'Find a route with limited stops', 'Return the lowest price from start to goal using at most maxStops intermediate stops. Return -1 when no allowed route exists.', 'lowestLimitedStopPrice', 'nodeCount: number, flights: number[][], start: number, goal: number, maxStops: number', 'nodeCount = 4, flights = [[0, 1, 50], [1, 2, 40], [0, 2, 120], [2, 3, 30]], start = 0, goal = 3, maxStops = 2', '120', 'Use 0, 1, 2, 3 with two intermediate stops.', 'Keep costs by node and edges used. Relax flights for at most maxStops plus one rounds. Do not overwrite a round with values from that same round.', ['bounded-relaxation', 'state-space-search']),
]);
