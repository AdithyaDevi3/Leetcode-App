import type { ExecutionLanguage } from '@leetcode-app/domain';

/** Raw strings keep partially edited JSON recoverable without silently discarding it. */
export type CustomRunCase = { id: string; input: string; expected: string };
export type CodeRunResult = {
  problemId: string;
  language: ExecutionLanguage;
  cases: Array<{
    id: string; name: string; input: unknown[]; actual?: unknown; expected?: unknown;
    passed: boolean | null; error?: string;
  }>;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export const MAX_RUN_CASES = 8;
export const MAX_RUN_CASE_TEXT = 4_000;
export const MAX_RUN_DRAFT_TEXT = 32_000;

// These are the examples printed in the problem description, never the private suite.
const publicExamples: Record<string, { args: unknown[]; expected: unknown }> = {
  'pair-with-target-v1': { args: [[4, 7, 1, 9], 8], expected: [1, 2] },
  'max-window-sum-v1': { args: [[2, 1, 5, 1, 3, 2], 3], expected: 9 },
  'tree-max-depth-v1': { args: [{ val: 3, left: { val: 9, left: null, right: null }, right: { val: 20, left: { val: 15, left: null, right: null }, right: { val: 7, left: null, right: null } } }], expected: 3 },
  'balanced-brackets-v1': { args: ['{[()()]}'], expected: true },
  'climb-stairs-v1': { args: [4], expected: 5 },
  'island-count-v1': { args: [[[1, 1, 0], [0, 1, 0], [1, 0, 1]]], expected: 3 },
  'task-order-v1': { args: [['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]], expected: ['C', 'B', 'A'] },
  'two-sum-window-v1': { args: [[1, 3, 4, 6, 8, 11], 10], expected: [2, 3] },
  'coin-change-lite-v1': { args: [[1, 3, 4], 6], expected: 2 },
  'first-unique-index-v1': { args: [[9, 4, 9, 6, 4, 7]], expected: 3 },
};

export function getPublicRunCases(problemId: string): CustomRunCase[] {
  const example = Object.hasOwn(publicExamples, problemId) ? publicExamples[problemId] : undefined;
  return example ? [{ id: 'example-1', input: JSON.stringify(example.args), expected: JSON.stringify(example.expected) }] : [];
}

/** Validate storage bounds only; unfinished JSON is intentionally a valid draft. */
export function isCustomRunCaseDrafts(value: unknown): value is CustomRunCase[] {
  if (!Array.isArray(value) || value.length > MAX_RUN_CASES) return false;
  const ids = new Set<string>();
  let size = 0;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const item = candidate as Record<string, unknown>;
    if (Object.keys(item).some(key => !['id', 'input', 'expected'].includes(key))
      || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id)
      || typeof item.input !== 'string' || item.input.length > MAX_RUN_CASE_TEXT
      || typeof item.expected !== 'string' || item.expected.length > MAX_RUN_CASE_TEXT) return false;
    ids.add(item.id);
    size += item.input.length + item.expected.length;
  }
  return size <= MAX_RUN_DRAFT_TEXT;
}
