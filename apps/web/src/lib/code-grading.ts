export const CODE_GRADING_MARKER = '__METHOD_GRADE__';
export const CODE_GRADING_VERSION = 'code-tests-v3';

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

const checkLabels: Record<string, string[]> = {
  "pair-with-target-v1": [
    "finds a normal pair",
    "uses distinct duplicate positions",
    "handles negative values",
    "finds a pair late in the list"
  ],
  "max-window-sum-v1": [
    "finds the best middle window",
    "handles all-negative windows",
    "handles a one-value window",
    "handles a full-length window"
  ],
  "tree-max-depth-v1": [
    "handles an empty tree",
    "handles one node",
    "follows the deeper branch",
    "handles a left-skewed tree"
  ],
  "balanced-brackets-v1": [
    "accepts nested brackets",
    "rejects crossing brackets",
    "rejects an unmatched closer",
    "rejects an unmatched opener",
    "accepts an empty string"
  ],
  "climb-stairs-v1": [
    "handles zero steps",
    "handles one step",
    "handles four steps",
    "handles a larger input"
  ],
  "island-count-v1": [
    "counts separated regions",
    "handles all water",
    "handles one connected region",
    "does not connect diagonals"
  ],
  "task-order-v1": [
    "orders a dependency chain",
    "allows multiple valid orders",
    "includes independent tasks",
    "reports a cycle with no order"
  ],
  "two-sum-window-v1": [
    "finds a middle pair",
    "finds an endpoint pair",
    "handles duplicate values",
    "handles two values"
  ],
  "coin-change-lite-v1": [
    "finds the minimum combination",
    "reports an impossible amount",
    "handles zero amount",
    "avoids a greedy-choice trap"
  ],
  "first-unique-index-v1": [
    "finds the first unique value",
    "returns the first position when unique",
    "reports no unique value",
    "handles one value"
  ]
};

export const codeCheckLabels = (problemId: string): string[] => Object.hasOwn(checkLabels, problemId) ? [...checkLabels[problemId]] : [];

export function parseCodeGrade(stdout: string): CodeGrade | null {
  const markerAt = stdout.lastIndexOf(CODE_GRADING_MARKER);
  if (markerAt < 0) return null;
  try {
    const value = JSON.parse(stdout.slice(markerAt + CODE_GRADING_MARKER.length).trim()) as Partial<CodeGrade>;
    const labels = typeof value.problemId === 'string' && Object.hasOwn(checkLabels, value.problemId) ? checkLabels[value.problemId] : undefined;
    if (
      typeof value.problemId !== 'string' ||
      value.version !== CODE_GRADING_VERSION ||
      typeof value.passed !== 'boolean' ||
      typeof value.passedCount !== 'number' ||
      typeof value.totalCount !== 'number' ||
      !Array.isArray(value.tests) ||
      !labels ||
      value.totalCount !== labels.length ||
      value.tests.length !== labels.length ||
      value.tests.some((test, index) => (
        !test ||
        typeof test !== 'object' ||
        (test as CodeTestResult).name !== labels[index] ||
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
