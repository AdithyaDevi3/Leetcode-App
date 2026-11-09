import 'server-only';

import type { ExecutionLanguage, ExecutionRequest } from '@leetcode-app/domain';
import { CODE_GRADING_VERSION, type CodeGrade } from './code-grading';
import { specs } from './code-grade-specs.server';
import { buildOutputExecutionRequest, parseExecutionOutputs } from './code-execution.server';

export function matchesExpected(problemId: string, args: unknown[], actual: unknown, expected: unknown): boolean {
  const validator = Object.hasOwn(specs, problemId) ? specs[problemId].validator : undefined;
  if (validator === 'pair' && (expected === true || (Array.isArray(expected) && expected.length === 2))) {
    const [values, target] = args as [number[], number];
    const valid = (pair: unknown) => {
      if (!Array.isArray(pair) || pair.length !== 2) return false;
      const [left, right] = pair;
      return Number.isInteger(left) && Number.isInteger(right) && left !== right
        && left >= 0 && right >= 0 && left < values.length && right < values.length
        && values[left] + values[right] === target;
    };
    return (expected === true || valid(expected)) && valid(actual);
  }
  if (validator === 'topological-order' && (typeof expected === 'boolean' || Array.isArray(expected))) {
    const [tasks, prerequisites] = args as [string[], string[][]];
    if (expected === false || (Array.isArray(expected) && expected.length === 0)) return Array.isArray(actual) && actual.length === 0;
    const valid = (order: unknown) => {
      if (!Array.isArray(order) || order.length !== tasks.length || new Set(order).size !== tasks.length
        || !tasks.every(task => order.includes(task))) return false;
      const positions = new Map(order.map((task, index) => [task, index]));
      return prerequisites.every(([task, prerequisite]) => positions.get(prerequisite)! < positions.get(task)!);
    };
    return (expected === true || valid(expected)) && valid(actual);
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function buildGradedExecutionRequest(input: { problemId: string; language: ExecutionLanguage; source: string }): ExecutionRequest {
  const spec = Object.hasOwn(specs, input.problemId) ? specs[input.problemId] : undefined;
  if (!spec) throw new Error('No code grading specification exists for this practice item');
  return buildOutputExecutionRequest({ ...input, cases: spec.cases });
}

/** Expectations are compared here, outside the learner's isolated process. */
export function gradeExecutionOutputs(problemId: string, stdout: string): CodeGrade | null {
  const spec = Object.hasOwn(specs, problemId) ? specs[problemId] : undefined;
  if (!spec) return null;
  const parsed = parseExecutionOutputs(stdout, problemId, spec.cases.length);
  if (!parsed) return null;
  const tests = spec.cases.map((test, index) => {
    const output = parsed.outputs[index];
    return {
      name: test.name,
      passed: !output.error && matchesExpected(problemId, test.args, output.actual, test.expected),
      // Runtime messages may contain private inputs; expose no private diagnostics.
      ...(output.error ? { detail: 'The code raised an error for this check.' } : {}),
    };
  });
  const passedCount = tests.filter(test => test.passed).length;
  return { problemId, version: CODE_GRADING_VERSION, passed: passedCount === tests.length, passedCount, totalCount: tests.length, tests };
}
