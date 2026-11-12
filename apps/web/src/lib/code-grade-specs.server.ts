import 'server-only';
import { classGradeCases } from './class-grade-specs.server';

export type Validator = 'equal' | 'pair' | 'topological-order';

export type GradeCase = {
  name: string;
  args: unknown[];
  expected: unknown;
};

type CodeGradeSpec = {
  functionName: string;
  pythonFunctionName: string;
  validator: Validator;
  cases: GradeCase[];
};

export const specs: Record<string, CodeGradeSpec> = {
  ...Object.fromEntries(Object.entries(classGradeCases).map(([activityId, cases]) => [activityId, {
    functionName: activityId, pythonFunctionName: activityId, validator: 'equal' as const, cases,
  }])),
  'pair-with-target-v1': {
    functionName: 'findPair',
    pythonFunctionName: 'find_pair',
    validator: 'pair',
    cases: [
      { name: 'finds a normal pair', args: [[4, 7, 1, 9], 8], expected: true },
      { name: 'uses distinct duplicate positions', args: [[3, 3], 6], expected: true },
      { name: 'handles negative values', args: [[-4, 8, 5], 1], expected: true },
      { name: 'finds a pair late in the list', args: [[10, 2, 12, 6, 4], 10], expected: true },
    ],
  },
  'max-window-sum-v1': {
    functionName: 'maxWindowSum',
    pythonFunctionName: 'max_window_sum',
    validator: 'equal',
    cases: [
      { name: 'finds the best middle window', args: [[2, 1, 5, 1, 3, 2], 3], expected: 9 },
      { name: 'handles all-negative windows', args: [[-4, -2, -8, -1], 2], expected: -6 },
      { name: 'handles a one-value window', args: [[-5, 7, 1], 1], expected: 7 },
      { name: 'handles a full-length window', args: [[2, 3, 4], 3], expected: 9 },
    ],
  },
  'tree-max-depth-v1': {
    functionName: 'maxDepth',
    pythonFunctionName: 'max_depth',
    validator: 'equal',
    cases: [
      { name: 'handles an empty tree', args: [null], expected: 0 },
      { name: 'handles one node', args: [{ val: 1, left: null, right: null }], expected: 1 },
      { name: 'follows the deeper branch', args: [{ val: 3, left: { val: 9, left: null, right: null }, right: { val: 20, left: { val: 15, left: null, right: null }, right: { val: 7, left: null, right: null } } }], expected: 3 },
      { name: 'handles a left-skewed tree', args: [{ val: 1, left: { val: 2, left: { val: 3, left: null, right: null }, right: null }, right: null }], expected: 3 },
    ],
  },
  'balanced-brackets-v1': {
    functionName: 'isBalanced',
    pythonFunctionName: 'is_balanced',
    validator: 'equal',
    cases: [
      { name: 'accepts nested brackets', args: ['{[()()]}'], expected: true },
      { name: 'rejects crossing brackets', args: ['([)]'], expected: false },
      { name: 'rejects an unmatched closer', args: [']'], expected: false },
      { name: 'rejects an unmatched opener', args: ['((('], expected: false },
      { name: 'accepts an empty string', args: [''], expected: true },
    ],
  },
  'climb-stairs-v1': {
    functionName: 'climbStairs',
    pythonFunctionName: 'climb_stairs',
    validator: 'equal',
    cases: [
      { name: 'handles zero steps', args: [0], expected: 1 },
      { name: 'handles one step', args: [1], expected: 1 },
      { name: 'handles four steps', args: [4], expected: 5 },
      { name: 'handles a larger input', args: [10], expected: 89 },
    ],
  },
  'island-count-v1': {
    functionName: 'countIslands',
    pythonFunctionName: 'count_islands',
    validator: 'equal',
    cases: [
      { name: 'counts separated regions', args: [[[1, 1, 0], [0, 1, 0], [1, 0, 1]]], expected: 3 },
      { name: 'handles all water', args: [[[0, 0], [0, 0]]], expected: 0 },
      { name: 'handles one connected region', args: [[[1, 1], [1, 1]]], expected: 1 },
      { name: 'does not connect diagonals', args: [[[1, 0], [0, 1]]], expected: 2 },
    ],
  },
  'task-order-v1': {
    functionName: 'taskOrder',
    pythonFunctionName: 'task_order',
    validator: 'topological-order',
    cases: [
      { name: 'orders a dependency chain', args: [['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]], expected: true },
      { name: 'allows multiple valid orders', args: [['ship', 'test', 'build', 'lint'], [['ship', 'test'], ['test', 'build'], ['ship', 'lint']]], expected: true },
      { name: 'includes independent tasks', args: [['A', 'B', 'C'], [['A', 'B']]], expected: true },
      { name: 'reports a cycle with no order', args: [['A', 'B'], [['A', 'B'], ['B', 'A']]], expected: false },
    ],
  },
  'two-sum-window-v1': {
    functionName: 'twoSumWindow',
    pythonFunctionName: 'two_sum_window',
    validator: 'pair',
    cases: [
      { name: 'finds a middle pair', args: [[1, 3, 4, 6, 8, 11], 10], expected: true },
      { name: 'finds an endpoint pair', args: [[-5, -1, 2, 7, 12], 7], expected: true },
      { name: 'handles duplicate values', args: [[1, 2, 2, 4], 4], expected: true },
      { name: 'handles two values', args: [[3, 9], 12], expected: true },
    ],
  },
  'coin-change-lite-v1': {
    functionName: 'coinChangeLite',
    pythonFunctionName: 'coin_change_lite',
    validator: 'equal',
    cases: [
      { name: 'finds the minimum combination', args: [[1, 3, 4], 6], expected: 2 },
      { name: 'reports an impossible amount', args: [[2], 3], expected: -1 },
      { name: 'handles zero amount', args: [[2, 5], 0], expected: 0 },
      { name: 'avoids a greedy-choice trap', args: [[1, 3, 4], 10], expected: 3 },
    ],
  },
  'first-unique-index-v1': {
    functionName: 'findFirstUniqueIndex',
    pythonFunctionName: 'find_first_unique_index',
    validator: 'equal',
    cases: [
      { name: 'finds the first unique value', args: [[4, 5, 4, 6, 5]], expected: 3 },
      { name: 'returns the first position when unique', args: [[9, 1, 1]], expected: 0 },
      { name: 'reports no unique value', args: [[2, 2, 3, 3]], expected: -1 },
      { name: 'handles one value', args: [[7]], expected: 0 },
    ],
  },
};

