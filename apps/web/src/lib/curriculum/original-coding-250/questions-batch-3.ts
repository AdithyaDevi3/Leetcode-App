import 'server-only';
import {
  freezeOriginalCodingQuestion,
  type CodingQuestionDifficulty,
  type OriginalCodingQuestion,
  type InterviewCurriculumTopic,
} from '@leetcode-app/domain';

type Input = Omit<OriginalCodingQuestion, 'provenance' | 'status' | 'reviewerId'>;

const question = (input: Input): OriginalCodingQuestion => freezeOriginalCodingQuestion({
  ...input,
  provenance: { kind: 'original', authorId: 'original-coding-250-author-v3', authoredAt: '2026-11-16T21:00:00.000Z' },
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
  constraints: ['Use the stated function contract.', 'Do not change the input values.', 'State the time and extra-space cost.'],
  examples: [{ input, output, note }],
  starterDraft,
  conceptIds,
});

/** Original coding questions. They require review before publication. */
export const originalCoding250Batch3: readonly OriginalCodingQuestion[] = Object.freeze([
  item('dp1-rest-stop-minimum', 'dynamic-programming-1d', 'foundation', 'Plan rest stops', 'A trail has a fatigue cost at each marker. Start before marker 0. Move one or two markers per step. Return the least total cost to reach beyond the last marker.', 'minimumRestCost', 'costs: number[]', 'costs = [4, 2, 7, 3]', '5', 'Choose markers 1 and 3.', 'Store the least cost to reach each marker. Combine the two previous states. Return the cheaper exit state.', ['recurrence', 'rolling-state']),
  item('dp1-signal-decode-count', 'dynamic-programming-1d', 'intermediate', 'Count valid signal splits', 'A signal is a string of digits. A one-digit group from 1 through 9 is valid. A two-digit group from 10 through 26 is valid. Return the number of valid full splits.', 'countSignalSplits', 'signal: string', 'signal = "121"', '3', 'The valid splits are 1-2-1, 12-1, and 1-21.', 'Define ways at each prefix length. Reject groups that start with zero. Add one- and two-digit transitions.', ['prefix-dynamic-programming', 'validation']),
  item('dp1-robust-message-value', 'dynamic-programming-1d', 'intermediate', 'Choose nonadjacent messages', 'Each message has a value. You cannot choose adjacent messages because they use the same channel. Return the largest total value.', 'maximumSeparatedValue', 'values: number[]', 'values = [6, 3, 8, 4, 5]', '19', 'Choose values 6, 8, and 5.', 'For each value, compare skipping it with taking it after the state two positions back.', ['take-or-skip', 'rolling-state']),
  item('dp1-circular-sensor-selection', 'dynamic-programming-1d', 'advanced', 'Choose circular sensors', 'Sensors form a circle. Activating adjacent sensors causes interference. Return the largest total reading from nonadjacent sensors.', 'maximumCircularReading', 'readings: number[]', 'readings = [5, 9, 4, 8]', '17', 'Choose the second and fourth sensors.', 'Solve two linear cases. Exclude the first sensor in one case and exclude the last sensor in the other.', ['case-split', 'take-or-skip']),
  item('dp2-safe-grid-routes', 'dynamic-programming-2d', 'foundation', 'Count safe grid routes', 'A robot starts at the upper-left cell and moves only right or down. Cells with -1 are blocked. Return the number of routes to the lower-right cell.', 'countSafeRoutes', 'grid: number[][]', 'grid = [[0, 0], [0, 0]]', '2', 'The robot can change direction once.', 'Set the start state to one. Add the top and left route counts for each open cell.', ['grid-dynamic-programming', 'base-case']),
  item('dp2-minimum-risk-grid', 'dynamic-programming-2d', 'intermediate', 'Minimize grid risk', 'Move from the upper-left cell to the lower-right cell using only right and down moves. Return the smallest sum of visited risk values.', 'minimumGridRisk', 'risk: number[][]', 'risk = [[1, 5], [2, 1]]', '4', 'Use the lower path.', 'Store the best cost for each cell. Add the current risk to the lower predecessor cost.', ['grid-dynamic-programming', 'minimization']),
  item('dp2-common-route-length', 'dynamic-programming-2d', 'intermediate', 'Find shared route length', 'Two route codes are strings. Return the length of their longest shared sequence. Characters must keep their relative order.', 'longestSharedRoute', 'left: string, right: string', 'left = "ABCD", right = "ACBD"', '3', 'One shared sequence is A-C-D.', 'Build a prefix table. Match characters diagonally. Otherwise retain the better adjacent state.', ['sequence-dynamic-programming', 'subsequence']),
  item('dp2-edit-message-cost', 'dynamic-programming-2d', 'advanced', 'Edit one message into another', 'Return the smallest number of insertions, removals, and replacements needed to change source into target.', 'messageEditCost', 'source: string, target: string', 'source = "plane", target = "plans"', '2', 'Replace e with s and remove the final character.', 'Initialize empty-prefix costs. Compare diagonal replacement with insertion and removal states.', ['edit-distance', 'sequence-dynamic-programming']),
  item('greedy-refuel-checkpoints', 'greedy', 'foundation', 'Refuel at checkpoints', 'A vehicle starts with zero fuel. Each checkpoint provides fuel and is at a known distance. Return the smallest number of refuels needed to reach destination, or -1.', 'minimumRefuels', 'destination: number, fuel: number[], distance: number[]', 'destination = 25, fuel = [8, 12, 10], distance = [5, 11, 18]', '2', 'Refuel at the first two reachable checkpoints.', 'Scan checkpoints in distance order. Add reachable fuel amounts to a max structure. Use the largest available refill when needed.', ['greedy-choice', 'priority-queue']),
  item('greedy-project-deadlines', 'greedy', 'intermediate', 'Select deadline projects', 'Each project takes one day, has a deadline, and has a reward. Return the largest reward from projects completed by their deadlines.', 'maximumDeadlineReward', 'projects: Array<[number, number]>', 'projects = [[1, 8], [1, 4], [2, 7]]', '15', 'Complete rewards 8 and 7.', 'Sort by deadline. Keep selected rewards in a minimum structure. Remove the smallest reward when too many projects are selected.', ['scheduling', 'priority-queue']),
  item('greedy-smallest-remaining-number', 'greedy', 'advanced', 'Remove digits for a smaller number', 'Remove exactly k digits from a nonnegative decimal string. Return the smallest possible remaining number without leading zeros.', 'smallestAfterRemovals', 'digits: string, k: number', 'digits = "48217", k = 2', '217', 'Remove 4 and 8.', 'Use a monotonic stack. Remove larger prior digits when a smaller digit arrives. Trim remaining digits if removals remain.', ['monotonic-stack', 'lexicographic-order']),
  item('interval-merge-reservations', 'intervals', 'foundation', 'Merge touching reservations', 'Given time ranges with inclusive starts and ends, merge overlapping or touching ranges. Return ranges in ascending start order.', 'mergeReservations', 'ranges: Array<[number, number]>', 'ranges = [[1, 3], [3, 5], [8, 9]]', '[[1, 5], [8, 9]]', 'The first two ranges touch.', 'Sort by start time. Extend the active range when the next range starts before or at its end.', ['sorting', 'range-merge']),
  item('interval-minimum-gates', 'intervals', 'intermediate', 'Count loading gates', 'Each delivery uses a gate from start through end, with an end freeing the gate before a new start at the same time. Return the smallest required gate count.', 'minimumLoadingGates', 'deliveries: Array<[number, number]>', 'deliveries = [[2, 5], [3, 4], [5, 8]]', '2', 'The delivery at 5 reuses a gate.', 'Sort starts and ends separately. Free every completed delivery before allocating a new gate.', ['sweep-line', 'resource-allocation']),
  item('interval-best-nonoverlap-count', 'intervals', 'advanced', 'Keep compatible sessions', 'Return the largest number of nonoverlapping sessions. A session ending at time t is compatible with one starting at t.', 'maximumCompatibleSessions', 'sessions: Array<[number, number]>', 'sessions = [[1, 4], [3, 5], [4, 6], [6, 7]]', '3', 'Choose [1,4], [4,6], and [6,7].', 'Sort by end time. Keep a session when it starts at or after the most recent kept end.', ['earliest-finish', 'exchange-argument']),
  item('bit-count-enabled-flags', 'bit-manipulation', 'foundation', 'Count enabled flags', 'Return the number of one bits in a nonnegative integer.', 'countEnabledFlags', 'value: number', 'value = 22', '3', '22 is binary 10110.', 'Repeat while the value is nonzero. Clear its lowest one bit on each step.', ['bit-counting', 'bitwise-and']),
  item('bit-unique-transmission', 'bit-manipulation', 'intermediate', 'Find the unique transmission', 'Every transmission ID appears twice except one. Return the ID that appears once.', 'findUniqueTransmission', 'ids: number[]', 'ids = [12, 5, 12, 8, 8]', '5', 'Paired IDs cancel.', 'XOR every ID. Equal pairs cancel and leave the unique value.', ['xor', 'invariant']),
  item('bit-subset-permission', 'bit-manipulation', 'advanced', 'Check required permissions', 'Permissions are bit masks. Return true when every bit in required also appears in granted.', 'hasRequiredPermissions', 'granted: number, required: number', 'granted = 13, required = 5', 'true', 'Binary 1101 includes 0101.', 'AND granted with required. Compare the result with required.', ['bitmask', 'bitwise-and']),
  item('math-grid-rectangle-area', 'math-geometry', 'foundation', 'Measure grid rectangles', 'A rectangle has axis-aligned corners. Return its area from two opposite corners. Coordinates may be negative.', 'rectangleArea', 'left: number, bottom: number, right: number, top: number', 'left = -2, bottom = 1, right = 3, top = 5', '20', 'Width is 5 and height is 4.', 'Subtract matching coordinates. Multiply the absolute width and height.', ['coordinate-geometry', 'absolute-value']),
  item('math-normalized-direction', 'math-geometry', 'intermediate', 'Normalize a direction', 'Return a stable direction key for a vector dx, dy. Equal directions must return equal keys even when both values have a common factor.', 'normalizedDirection', 'dx: number, dy: number', 'dx = 6, dy = 9', '"2,3"', 'Divide both values by 3.', 'Handle zero axes first. Otherwise divide both values by their greatest common divisor and normalize the sign.', ['greatest-common-divisor', 'slope-normalization']),
  item('math-spiral-cell-value', 'math-geometry', 'advanced', 'Locate a spiral cell', 'Positive integers fill an outward square spiral. Return the value at row and column, where the center is 1 at 0,0.', 'spiralCellValue', 'row: number, column: number', 'row = 1, column = 1', '3', 'The first square ring contains 2 through 9.', 'Find the ring from the largest coordinate magnitude. Compute the ring maximum, then subtract the side offset.', ['coordinate-geometry', 'ring-arithmetic']),
]);
