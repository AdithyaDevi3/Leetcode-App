import 'server-only';

import type { ExecutionLanguage, ExecutionResult } from '@leetcode-app/domain';
import { isCustomRunCaseDrafts, type CodeRunResult, type CustomRunCase } from './code-running';
import { buildOutputExecutionRequest, CODE_OUTPUT_MARKER, hasCodeExecutionSpec, parseExecutionOutputs } from './code-execution.server';
import { matchesExpected } from './code-grading.server';
import { sanitizeSandboxOutput } from './sandbox/execution-policy';
import { getClassDesignProtocol, isClassOperationTrace } from './class-design';

export class CodeRunInputError extends Error {
  constructor(message: string, readonly status: 400 | 413 = 400) { super(message); }
}
type ParsedRunCase = { id: string; args: unknown[]; expected?: unknown };
const fail = (message: string): never => { throw new CodeRunInputError(message); };
const integer = (value: unknown): value is number => Number.isInteger(value) && Math.abs(Number(value)) <= 1_000_000_000;
const integers = (value: unknown): value is number[] => Array.isArray(value) && value.length <= 1_000 && value.every(integer);
const names = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 200
  && value.every(item => typeof item === 'string' && item.length >= 1 && item.length <= 64);

function validTree(value: unknown, depth = 0, budget = { nodes: 0 }): boolean {
  if (value === null) return true;
  if (depth > 30 || ++budget.nodes > 255 || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  const node = value as Record<string, unknown>;
  return Object.keys(node).every(key => ['val', 'left', 'right'].includes(key)) && integer(node.val)
    && validTree(node.left ?? null, depth + 1, budget) && validTree(node.right ?? null, depth + 1, budget);
}

function validArgs(problemId: string, args: unknown[]): boolean {
  const protocol = getClassDesignProtocol(problemId);
  if (protocol) return args.length === 1 && isClassOperationTrace(protocol, args[0]);
  if (problemId === 'tree-max-depth-v1') return args.length === 1 && validTree(args[0]);
  if (problemId === 'balanced-brackets-v1') return args.length === 1 && typeof args[0] === 'string' && /^[()[\]{}]*$/.test(args[0]);
  if (problemId === 'climb-stairs-v1') return args.length === 1 && integer(args[0]) && args[0] >= 0 && args[0] <= 45;
  if (problemId === 'first-unique-index-v1') return args.length === 1 && integers(args[0]) && args[0].length >= 1;
  if (problemId === 'island-count-v1') {
    const grid = args[0];
    return args.length === 1 && Array.isArray(grid) && grid.length >= 1 && grid.length <= 40
      && grid.every(row => integers(row) && row.length >= 1 && row.length <= 40
        && row.length === grid[0].length && row.every(cell => cell === 0 || cell === 1));
  }
  if (problemId === 'task-order-v1') {
    const [tasks, edges] = args;
    return args.length === 2 && names(tasks) && tasks.length >= 1 && new Set(tasks).size === tasks.length
      && Array.isArray(edges) && edges.length <= 500
      && edges.every(edge => names(edge) && edge.length === 2 && edge.every(task => tasks.includes(task)));
  }
  if (args.length !== 2 || !integers(args[0]) || !integer(args[1])) return false;
  const [values, second] = args;
  if (problemId === 'max-window-sum-v1') return second >= 1 && second <= values.length;
  if (problemId === 'coin-change-lite-v1') return values.length >= 1 && values.length <= 10
    && values.every(value => value > 0) && second >= 0 && second <= 10_000;
  if (problemId === 'two-sum-window-v1') return values.length >= 2 && values.every((value, index) => index === 0 || value >= values[index - 1]);
  return problemId === 'pair-with-target-v1' && values.length >= 2;
}

export function parseRunCases(problemId: string, value: unknown): ParsedRunCase[] {
  if (!hasCodeExecutionSpec(problemId)) fail('This practice item does not support code execution.');
  if (!isCustomRunCaseDrafts(value) || value.length < 1) fail('Use between 1 and 8 uniquely named test cases within the size limit.');
  return (value as CustomRunCase[]).map((item, index) => {
    let args: unknown;
    let expected: unknown;
    try {
      args = JSON.parse(item.input);
      expected = item.expected.trim() ? JSON.parse(item.expected) : undefined;
    } catch { return fail(`Case ${index + 1}: enter valid JSON arguments and expected output, or leave expected output blank.`); }
    if (!Array.isArray(args) || !validArgs(problemId, args)) fail(`Case ${index + 1}: arguments must match this problem's types and the bounded Run input limits.`);
    return { id: item.id, args: args as unknown[], ...(expected === undefined ? {} : { expected }) };
  });
}

export function buildRunExecutionRequest(input: { problemId: string; language: ExecutionLanguage; source: string; cases: ParsedRunCase[] }) {
  return buildOutputExecutionRequest(input);
}

export function makeCodeRunResult(input: { problemId: string; language: ExecutionLanguage; cases: ParsedRunCase[]; result: ExecutionResult }): CodeRunResult {
  const parsed = input.result.status === 'completed' ? parseExecutionOutputs(input.result.stdout, input.problemId, input.cases.length) : null;
  const reportAt = input.result.stdout.indexOf(CODE_OUTPUT_MARKER);
  const visibleStdout = reportAt >= 0 ? input.result.stdout.slice(0, reportAt) : input.result.stdout;
  const runError = input.result.status === 'timed_out' ? 'Execution exceeded the time limit.'
    : input.result.status !== 'completed' ? 'The code did not compile or finish. See the execution details.'
      : !parsed ? 'The code did not return a complete result for these cases.' : undefined;
  return {
    problemId: input.problemId, language: input.language,
    cases: input.cases.map((item, index) => {
      const output = parsed?.outputs[index];
      const error = output?.error || runError;
      const hasExpected = Object.hasOwn(item, 'expected');
      return {
        id: item.id, name: item.id === 'example-1' ? 'Example 1' : `Case ${index + 1}`, input: item.args,
        ...(!error && output ? { actual: output.actual } : {}),
        ...(hasExpected ? { expected: item.expected } : {}),
        passed: error ? false : hasExpected ? matchesExpected(input.problemId, item.args, output?.actual, item.expected) : null,
        ...(error ? { error: sanitizeSandboxOutput(error).slice(0,500) } : {}),
      };
    }),
    // The appended report is internal; even malformed reports are not displayed.
    stdout: sanitizeSandboxOutput(parsed ? parsed.stdout : visibleStdout).trimEnd(),
    stderr: sanitizeSandboxOutput(input.result.stderr),
    durationMs: Number.isFinite(input.result.durationMs) ? Math.max(0, input.result.durationMs) : 0,
  };
}

/** Count actual streamed bytes; Content-Length may be absent or inaccurate. */
export async function decodeCodeExecutionBody(request: Request): Promise<Record<string, unknown>> {
  const maximumBytes = 140_000;
  if (Number(request.headers.get('content-length')) > maximumBytes) throw new CodeRunInputError('Execution request is too large.', 413);
  if (!request.body) throw new CodeRunInputError('A supported language, source and test cases are required.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) { await reader.cancel().catch(() => undefined); throw new CodeRunInputError('Execution request is too large.', 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof CodeRunInputError) throw error;
    throw new CodeRunInputError('Enter a valid execution request.');
  } finally { reader.releaseLock(); }
}
