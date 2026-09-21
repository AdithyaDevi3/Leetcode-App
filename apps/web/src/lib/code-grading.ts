import type { ExecutionLanguage, ExecutionRequest } from '@leetcode-app/domain';

import { executionLimits } from './sandbox/execution-policy';

export const CODE_GRADING_MARKER = '__METHOD_GRADE__';
export const CODE_GRADING_VERSION = 'code-tests-v2';

export type CodeTestResult = {
  name: string;
  passed: boolean;
  detail?: string;
};

export type CodeGrade = {
  problemId: string;
  version: string;
  passed: boolean;
  passedCount: number;
  totalCount: number;
  tests: CodeTestResult[];
};

type Validator = 'equal' | 'pair' | 'topological-order';

type GradeCase = {
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

const specs: Record<string, CodeGradeSpec> = {
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

export const codeCheckLabels = (problemId: string): string[] =>
  (specs[problemId]?.cases ?? []).map((testCase) => testCase.name);

const typescriptPreamble = `type TreeNode = { val: number; left: TreeNode | null; right: TreeNode | null };`;

const typescriptHarness = (problemId: string, spec: CodeGradeSpec) => `
const __methodCases = ${JSON.stringify(spec.cases)};
const __methodEqual = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const __methodValidate = (args: unknown[], actual: unknown, expected: unknown) => {
  if (${JSON.stringify(spec.validator)} === 'pair') {
    if (!Array.isArray(actual) || actual.length !== 2) return false;
    const [left, right] = actual;
    const values = args[0] as number[];
    const target = args[1] as number;
    return Number.isInteger(left) && Number.isInteger(right) && left !== right && left >= 0 && right >= 0 && left < values.length && right < values.length && values[left] + values[right] === target;
  }
  if (${JSON.stringify(spec.validator)} === 'topological-order') {
    const tasks = args[0] as string[];
    const prerequisites = args[1] as string[][];
    if (expected === false) return Array.isArray(actual) && actual.length === 0;
    if (!Array.isArray(actual) || actual.length !== tasks.length || new Set(actual).size !== tasks.length) return false;
    if (!tasks.every((task) => actual.includes(task))) return false;
    const positions = new Map(actual.map((task, index) => [task, index]));
    return prerequisites.every(([task, prerequisite]) => (positions.get(prerequisite) ?? Infinity) < (positions.get(task) ?? -1));
  }
  return __methodEqual(actual, expected);
};
const __methodResults = __methodCases.map((testCase) => {
  try {
    const actual = (${spec.functionName} as (...args: unknown[]) => unknown)(...testCase.args);
    return { name: testCase.name, passed: __methodValidate(testCase.args, actual, testCase.expected) };
  } catch (error) {
    return { name: testCase.name, passed: false, detail: error instanceof Error ? error.message : 'Execution failed' };
  }
});
const __methodPassedCount = __methodResults.filter((result) => result.passed).length;
console.log(${JSON.stringify(CODE_GRADING_MARKER)} + JSON.stringify({ problemId: ${JSON.stringify(problemId)}, version: ${JSON.stringify(CODE_GRADING_VERSION)}, passed: __methodPassedCount === __methodResults.length, passedCount: __methodPassedCount, totalCount: __methodResults.length, tests: __methodResults }));`;

const pythonPreamble = `from __future__ import annotations
import json
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def __method_tree(value):
    if value is None:
        return None
    return TreeNode(value.get("val", 0), __method_tree(value.get("left")), __method_tree(value.get("right")))`;

const pythonHarness = (problemId: string, spec: CodeGradeSpec) => `
__method_cases = json.loads(${JSON.stringify(JSON.stringify(spec.cases))})
def __method_validate(args, actual, expected):
    if ${JSON.stringify(spec.validator)} == "pair":
        if not isinstance(actual, (list, tuple)) or len(actual) != 2:
            return False
        left, right = actual
        values, target = args
        return isinstance(left, int) and isinstance(right, int) and left != right and 0 <= left < len(values) and 0 <= right < len(values) and values[left] + values[right] == target
    if ${JSON.stringify(spec.validator)} == "topological-order":
        tasks, prerequisites = args
        if expected is False:
            return isinstance(actual, (list, tuple)) and len(actual) == 0
        if not isinstance(actual, (list, tuple)) or len(actual) != len(tasks) or len(set(actual)) != len(tasks) or any(task not in actual for task in tasks):
            return False
        positions = {task: index for index, task in enumerate(actual)}
        return all(positions.get(prerequisite, float("inf")) < positions.get(task, -1) for task, prerequisite in prerequisites)
    return actual == expected

__method_results = []
for __method_case in __method_cases:
    try:
        __method_args = __method_case["args"]
        if ${JSON.stringify(problemId)} == "tree-max-depth-v1":
            __method_args = [__method_tree(__method_args[0])]
        __method_actual = ${spec.pythonFunctionName}(*__method_args)
        __method_results.append({"name": __method_case["name"], "passed": __method_validate(__method_case["args"], __method_actual, __method_case["expected"])})
    except Exception as error:
        __method_results.append({"name": __method_case["name"], "passed": False, "detail": str(error)[:160]})
__method_passed_count = sum(1 for result in __method_results if result["passed"])
print(${JSON.stringify(CODE_GRADING_MARKER)} + json.dumps({"problemId": ${JSON.stringify(problemId)}, "version": ${JSON.stringify(CODE_GRADING_VERSION)}, "passed": __method_passed_count == len(__method_results), "passedCount": __method_passed_count, "totalCount": len(__method_results), "tests": __method_results}))`;

export function buildGradedExecutionRequest(input: {
  problemId: string;
  language: ExecutionLanguage;
  source: string;
}): ExecutionRequest {
  const spec = specs[input.problemId];
  if (!spec) throw new Error('No code grading specification exists for this practice item');

  const source = input.language === 'python'
    ? `${pythonPreamble}\n\n${input.source}\n${pythonHarness(input.problemId, spec)}`
    : `${input.problemId === 'tree-max-depth-v1' ? `${typescriptPreamble}\n\n` : ''}${input.source}\n${typescriptHarness(input.problemId, spec)}`;

  return { language: input.language, source, limits: executionLimits };
}

export function parseCodeGrade(stdout: string): CodeGrade | null {
  const markerAt = stdout.lastIndexOf(CODE_GRADING_MARKER);
  if (markerAt < 0) return null;
  try {
    const value = JSON.parse(stdout.slice(markerAt + CODE_GRADING_MARKER.length).trim()) as Partial<CodeGrade>;
    const spec = typeof value.problemId === 'string' ? specs[value.problemId] : undefined;
    if (
      typeof value.problemId !== 'string' ||
      value.version !== CODE_GRADING_VERSION ||
      typeof value.passed !== 'boolean' ||
      typeof value.passedCount !== 'number' ||
      typeof value.totalCount !== 'number' ||
      !Array.isArray(value.tests) ||
      !spec ||
      value.totalCount !== spec.cases.length ||
      value.tests.length !== spec.cases.length ||
      value.tests.some((test, index) => (
        !test ||
        typeof test !== 'object' ||
        (test as CodeTestResult).name !== spec.cases[index].name ||
        typeof (test as CodeTestResult).passed !== 'boolean'
      ))
    ) return null;
    const grade = value as CodeGrade;
    const passedCount = grade.tests.filter((test) => test.passed).length;
    if (grade.passedCount !== passedCount || grade.passed !== (passedCount === grade.totalCount)) return null;
    return grade;
  } catch {
    return null;
  }
}
