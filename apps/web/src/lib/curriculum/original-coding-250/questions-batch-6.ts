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
  provenance: { kind: 'original', authorId: 'original-coding-250-author-batch-6', authoredAt: '2026-11-16T22:00:00.000Z' },
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
  constraints: ['Use the stated function contract.', 'State the time and extra-space cost.', 'Do not change input values unless the prompt permits it.'],
  examples: [{ input, output, note }],
  starterDraft,
  conceptIds,
});

/** Sixth original coding-question batch. It is not in the learner catalog yet. */
export const originalCoding250Batch6: readonly OriginalCodingQuestion[] = Object.freeze([
  item('dp1-climb-pattern-count', 'dynamic-programming-1d', 'foundation', 'Count step patterns', 'A marker may advance one or three positions at a time. Return the number of ordered ways to reach exactly distance.', 'countStepPatterns', 'distance: number', 'distance = 4', '3', 'The patterns are 1-1-1-1, 1-3, and 3-1.', 'Set the count at distance zero to one. Build each later count from the reachable prior distances.', ['recurrence', 'base-case']),
  item('dp1-rising-signal-length', 'dynamic-programming-1d', 'intermediate', 'Measure a rising signal', 'Return the length of the longest strictly increasing subsequence in readings.', 'longestRisingSignal', 'readings: number[]', 'readings = [5, 1, 6, 2, 3, 7]', '4', 'One rising subsequence is 1, 2, 3, 7.', 'Store the best subsequence length ending at each position. Compare each earlier lower reading.', ['subsequence', 'state-by-position']),
  item('dp1-maximum-alternating-total', 'dynamic-programming-1d', 'advanced', 'Choose an alternating total', 'Choose a nonempty subsequence. Add the first chosen value, subtract the next, then continue alternating signs. Return the greatest possible total.', 'maximumAlternatingTotal', 'values: number[]', 'values = [4, 1, 7, 3]', '10', 'Choose 4, 1, and 7 for 4 - 1 + 7.', 'Track the best total whose next operation is addition and the best total whose next operation is subtraction.', ['two-state-dynamic-programming', 'subsequence']),
  item('dp2-largest-clear-square', 'dynamic-programming-2d', 'foundation', 'Find the largest clear square', 'A grid contains zero for clear cells and one for blocked cells. Return the side length of its largest all-clear square.', 'largestClearSquare', 'grid: number[][]', 'grid = [[0, 0, 1], [0, 0, 0], [1, 0, 0]]', '2', 'The lower-right 2 by 2 area is clear.', 'For each clear cell, combine the top, left, and top-left square lengths. Use the smallest neighbor plus one.', ['grid-dynamic-programming', 'local-recurrence']),
  item('dp2-message-interleave-check', 'dynamic-programming-2d', 'intermediate', 'Check interleaved messages', 'Return true when target can be formed by interleaving left and right while keeping the order within each source.', 'isMessageInterleave', 'left: string, right: string, target: string', 'left = "ab", right = "cd", target = "acbd"', 'true', 'Take a, then c, then b, then d.', 'Use a table for consumed prefix lengths. A state is valid when the next target symbol can come from either source.', ['prefix-table', 'two-source-state']),
  item('dp2-minimum-paint-route', 'dynamic-programming-2d', 'advanced', 'Choose a paint route', 'Rows contain paint costs for three colors. Paint one color per row. Adjacent rows cannot use the same color. Return the least total cost.', 'minimumPaintRoute', 'costs: number[][]', 'costs = [[3, 5, 4], [6, 2, 7], [4, 8, 1]]', '6', 'Choose colors zero, one, and two for costs 3, 2, and 1.', 'Store the least total for each final color in every row. Add the current cost to the smaller prior color total.', ['row-dynamic-programming', 'state-exclusion']),
  item('greedy-farthest-reach-check', 'greedy', 'foundation', 'Check the farthest reach', 'Each value gives the farthest forward jump from its index. Return true when the last index is reachable.', 'canReachLastIndex', 'jumps: number[]', 'jumps = [2, 3, 1, 0, 4]', 'true', 'The first jump can reach index 1, which extends the reach to index 4.', 'Scan left to right. Keep the farthest reachable index. Stop when an index is beyond that boundary.', ['reachability', 'greedy-invariant']),
  item('greedy-queue-by-height', 'greedy', 'intermediate', 'Rebuild a height queue', 'Each person is [height, ahead], where ahead is the number of people at least that tall before them. Return one valid queue.', 'rebuildHeightQueue', 'people: Array<[number, number]>', 'people = [[7, 0], [4, 2], [6, 1], [5, 0]]', '[[7, 0], [5, 0], [6, 1], [4, 2]]', 'Place taller people first because shorter people do not change their ahead counts.', 'Sort by height descending and ahead ascending. Insert each person at its ahead index.', ['ordering', 'constructive-greedy']),
  item('greedy-supply-circuit-start', 'greedy', 'advanced', 'Find a supply circuit start', 'Locations form a circle. Supply[i] is collected at location i and cost[i] is needed to reach the next location. Return a valid start index or -1.', 'findSupplyCircuitStart', 'supply: number[], cost: number[]', 'supply = [3, 1, 4], cost = [2, 3, 2]', '2', 'Starting at index 2 provides enough supply for the full circuit.', 'Reject every start before a negative running total. Reset the candidate after a failure. Reject all starts when total supply is below total cost.', ['prefix-balance', 'greedy-reset']),
  item('interval-first-uncovered-time', 'intervals', 'foundation', 'Find the first uncovered time', 'Given closed coverage ranges and a limit, return the first integer from zero through limit that no range covers. Return -1 when all are covered.', 'firstUncoveredTime', 'ranges: Array<[number, number]>, limit: number', 'ranges = [[0, 2], [4, 6]], limit = 6', '3', 'No range includes time 3.', 'Sort ranges by start. Track the first uncovered value. Extend coverage or return when a gap appears.', ['range-scan', 'sorted-intervals']),
  item('interval-event-attendance', 'intervals', 'intermediate', 'Attend the most events', 'Each event has an inclusive start and end day. Attend at most one event per day. Return the greatest number of events you can attend.', 'maximumEventAttendance', 'events: Array<[number, number]>', 'events = [[1, 2], [2, 2], [2, 3]]', '3', 'Attend one event on each of days 1, 2, and 3.', 'Process days in start order. Add active event end days to a minimum structure. Attend the event ending first each day.', ['priority-queue', 'earliest-deadline']),
  item('interval-minimum-range-removals', 'intervals', 'advanced', 'Remove overlapping ranges', 'Return the fewest ranges to remove so all remaining half-open ranges do not overlap.', 'minimumRangeRemovals', 'ranges: Array<[number, number]>', 'ranges = [[1, 4], [2, 5], [4, 7]]', '1', 'Remove [2,5] and keep the two ranges that meet at 4.', 'Sort by end. Keep the earliest ending compatible range. Count each range that starts before the kept end.', ['interval-scheduling', 'greedy-choice']),
  item('bit-single-power-check', 'bit-manipulation', 'foundation', 'Check a single power bit', 'Return true when value is a positive power of two.', 'isSinglePowerBit', 'value: number', 'value = 32', 'true', 'Binary 100000 has exactly one set bit.', 'Reject nonpositive values. Clear the lowest set bit and check whether the result is zero.', ['bitwise-and', 'power-of-two']),
  item('bit-reversed-byte-order', 'bit-manipulation', 'intermediate', 'Reverse a fixed bit field', 'Reverse the lowest width bits of value. Return the resulting nonnegative integer.', 'reverseFixedBits', 'value: number, width: number', 'value = 13, width = 4', '11', 'Binary 1101 reverses to 1011.', 'Read one low bit at a time. Shift the result left and append that bit. Shift the input right.', ['bit-shift', 'fixed-width']),
  item('bit-unique-triple-signal', 'bit-manipulation', 'advanced', 'Find a signal without triples', 'Every integer appears exactly three times except one. Return the integer that appears once.', 'findUniqueTripleSignal', 'values: number[]', 'values = [6, 1, 6, 6]', '1', 'Each bit count from the repeated value is a multiple of three.', 'Count each bit position across all values. Keep the count remainder after division by three.', ['bit-counting', 'modular-arithmetic']),
  item('bit-range-xor-total', 'bit-manipulation', 'advanced', 'Compute a range XOR', 'Return the XOR of every integer from start through end, inclusive.', 'rangeXorTotal', 'start: number, end: number', 'start = 3, end = 6', '4', '3 XOR 4 XOR 5 XOR 6 equals 4.', 'Use the repeating XOR pattern for values from zero through n. XOR the two prefix results.', ['xor', 'prefix-pattern']),
  item('math-clock-hand-gap', 'math-geometry', 'foundation', 'Measure a clock-hand gap', 'Return the smaller angle between an analog clock hour hand and minute hand.', 'smallerClockAngle', 'hour: number, minute: number', 'hour = 3, minute = 30', '75', 'The minute hand is at 180 degrees and the hour hand is at 105 degrees.', 'Convert both hands to degrees. Use the absolute difference or its complement from 360.', ['angle-calculation', 'modular-arithmetic']),
  item('math-rectangle-contact', 'math-geometry', 'intermediate', 'Check rectangle contact', 'Return true when two axis-aligned rectangles share an area with positive width and height. Edge-only contact is false.', 'rectanglesShareArea', 'first: [number, number, number, number], second: [number, number, number, number]', 'first = [0, 0, 3, 2], second = [2, 1, 4, 4]', 'true', 'The shared area has width 1 and height 1.', 'Compare the maximum left and bottom edges with the minimum right and top edges. Both overlap lengths must be positive.', ['axis-aligned-geometry', 'interval-overlap']),
  item('math-repeated-digit-square', 'math-geometry', 'intermediate', 'Detect a repeated digit-square state', 'Repeatedly replace a positive integer with the sum of its squared decimal digits. Return true when the process reaches one. Return false when it repeats another value.', 'reachesDigitSquareOne', 'value: number', 'value = 19', 'true', 'The sequence reaches 1 after several digit-square sums.', 'Use a set of seen values. Compute the next value by taking digits with modulo and division. Stop at one or a repeat.', ['cycle-detection', 'digit-arithmetic']),
  item('math-lattice-path-count', 'math-geometry', 'advanced', 'Count lattice paths', 'Return the number of shortest paths from 0,0 to right,up when each move increases exactly one coordinate by one.', 'countLatticePaths', 'right: number, up: number', 'right = 2, up = 2', '6', 'Choose the two right moves among four total moves.', 'Compute a binomial coefficient with a multiplicative loop. Use the smaller of right and up for fewer steps.', ['combinatorics', 'binomial-coefficient']),
]);
