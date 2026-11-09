import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

import ts from 'typescript';
import { practiceItems } from './content';
import { CODE_GRADING_MARKER, CODE_GRADING_VERSION, codeCheckLabels } from './code-grading';
import { buildGradedExecutionRequest, gradeExecutionOutputs } from './code-grading.server';
import { CODE_OUTPUT_MARKER, executionRateLimitOptions, parseExecutionOutputs } from './code-execution.server';
import { getPublicRunCases, isCustomRunCaseDrafts } from './code-running';
import { buildRunExecutionRequest, decodeCodeExecutionBody, makeCodeRunResult, parseRunCases } from './code-running.server';

const runTs = (source: string) => {
  const output: string[] = [];
  Function('console', ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)({ log: (value: unknown) => output.push(String(value)) });
  return output.join('\n');
};
const problemId = 'pair-with-target-v1';
const solution = 'function findPair(values: number[], target: number) { for (let a=0;a<values.length;a++) for(let b=a+1;b<values.length;b++) if(values[a]+values[b]===target) return [a,b]; return []; }';

describe('visible and custom test runs', () => {
  it.each(practiceItems)('has a valid documented example for $label', item => {
    expect(getPublicRunCases(item.id)).toHaveLength(1);
    expect(parseRunCases(item.id, getPublicRunCases(item.id))).toHaveLength(1);
  });
  it('treats prototype property names as unsupported problem identifiers', () => {
    expect(getPublicRunCases('constructor')).toEqual([]);
    expect(codeCheckLabels('constructor')).toEqual([]);
    expect(() => parseRunCases('constructor', [{ id: 'x', input: '[]', expected: '' }])).toThrow('does not support');
  });
  it('keeps unfinished JSON as a draft, but refuses execution until it is valid', () => {
    const drafts = [{ id: 'custom', input: '[[1,', expected: '' }];
    expect(isCustomRunCaseDrafts(drafts)).toBe(true);
    expect(() => parseRunCases(problemId, drafts)).toThrow('valid JSON');
  });
  it('runs only the selected cases and shows actual output and learner stdout', () => {
    const cases = parseRunCases(problemId, [{ id: 'custom', input: '[[2,5,9],14]', expected: '[1,2]' }]);
    const request = buildRunExecutionRequest({ problemId, language: 'typescript', source: `console.log('debug');\n${solution}`, cases });
    expect(request.source).not.toContain('uses distinct duplicate positions');
    expect(request.source).not.toContain('[3,3]');
    const stdout = runTs(request.source);
    const result = makeCodeRunResult({ problemId, language: 'typescript', cases, result: { status: 'completed', stdout, stderr: '', durationMs: 10, exitCode: 0, limits: request.limits } });
    expect(result).toMatchObject({ stdout: 'debug', durationMs: 10, cases: [{ id: 'custom', actual: [1,2], expected: [1,2], passed: true }] });
    expect(JSON.stringify(result)).not.toContain(CODE_OUTPUT_MARKER);
  });
  it('runs an editable stateful class trace with a fresh instance and normalized void outputs', () => {
    const id = 'lru-cache-v1';
    const cases = parseRunCases(id, [{
      id: 'custom',
      input: '[{"operations":["LRUCache","put","get"],"arguments":[[1],[7,70],[7]]}]',
      expected: '[null,null,70]',
    }]);
    const request = buildRunExecutionRequest({
      problemId: id,
      language: 'typescript',
      source: 'class LRUCache { values=new Map<number,number>(); constructor(private capacity:number){} put(key:number,value:number){this.values.set(key,value);} get(key:number){return this.values.get(key)??-1;} }',
      cases,
    });
    const result = makeCodeRunResult({ problemId: id, language: 'typescript', cases, result: {
      status: 'completed', stdout: runTs(request.source), stderr: '', durationMs: 2, exitCode: 0, limits: request.limits,
    } });
    expect(result.cases[0]).toMatchObject({ actual: [null, null, 70], expected: [null, null, 70], passed: true });
  });
  it('returns actual output without claiming a pass when expected output is blank', () => {
    const cases = parseRunCases(problemId, [{ id: 'custom', input: '[[2,5],7]', expected: '' }]);
    const request = buildRunExecutionRequest({ problemId, language: 'typescript', source: solution, cases });
    const result = makeCodeRunResult({ problemId, language: 'typescript', cases, result: { status: 'completed', stdout: runTs(request.source), stderr: '', durationMs: 1, exitCode: 0, limits: request.limits } });
    expect(result.cases[0]).toMatchObject({ actual: [0,1], passed: null });
    expect(result.cases[0]).not.toHaveProperty('expected');
  });
  it('accepts another valid pair rather than requiring one arbitrary index ordering', () => {
    const cases = parseRunCases(problemId, getPublicRunCases(problemId));
    const request = buildRunExecutionRequest({ problemId, language: 'typescript', source: 'function findPair() { return [2,1]; }', cases });
    const result = makeCodeRunResult({ problemId, language: 'typescript', cases, result: { status: 'completed', stdout: runTs(request.source), stderr: '', durationMs: 1, exitCode: 0, limits: request.limits } });
    expect(result.cases[0]).toMatchObject({ actual: [2,1], passed: true });
  });
  it('accepts another valid topological order and rejects an incorrect custom expectation', () => {
    const id = 'task-order-v1';
    const cases = parseRunCases(id, [{ id: 'custom', input: '[["A","B","C"],[["A","B"]]]', expected: '["C","B","A"]' }]);
    const request = buildRunExecutionRequest({ problemId: id, language: 'typescript', source: 'function taskOrder() { return ["B","A","C"]; }', cases });
    expect(makeCodeRunResult({ problemId: id, language: 'typescript', cases, result: { status: 'completed', stdout: runTs(request.source), stderr: '', durationMs: 1, exitCode: 0, limits: request.limits } }).cases[0].passed).toBe(true);
    cases[0].expected = ['A','B','C'];
    expect(makeCodeRunResult({ problemId: id, language: 'typescript', cases, result: { status: 'completed', stdout: runTs(request.source), stderr: '', durationMs: 1, exitCode: 0, limits: request.limits } }).cases[0].passed).toBe(false);
  });
  it.each([
    [{ id: 'x', input: '[[1,2],3]', expected: '' }, { id: 'x', input: '[[1,2],3]', expected: '' }],
    [{ id: 'x', input: '[[1,2],"bad"]', expected: '' }],
    [{ id: 'x', input: '[[1],2]', expected: '' }],
    [{ id: 'x', input: '[[1,2],3]', expected: 'x'.repeat(4_001) }],
    Array.from({ length: 9 }, (_, index) => ({ id: `x${index}`, input: '[[1,2],3]', expected: '' })),
  ])('rejects invalid, duplicated or oversized cases', (...cases) => {
    expect(() => parseRunCases(problemId, cases)).toThrow();
  });
  it.each([
    ['max-window-sum-v1', '[[1,2],0]'], ['coin-change-lite-v1', '[[0],2]'],
    ['two-sum-window-v1', '[[3,1],4]'], ['climb-stairs-v1', '[100]'],
    ['island-count-v1', '[[[1],[1,0]]]'], ['task-order-v1', '[["A"],[["A","B"]]]'],
    ['tree-max-depth-v1', '[{"val":"x"}]'],
  ])('rejects unsafe inputs for %s', (id, input) => {
    expect(() => parseRunCases(id, [{ id: 'x', input, expected: '' }])).toThrow('arguments must match');
  });
  it('turns runtime errors into per-case errors and hides the internal report', () => {
    const cases = parseRunCases(problemId, getPublicRunCases(problemId));
    const request = buildRunExecutionRequest({ problemId, language: 'typescript', source: 'function findPair() { throw new Error("helpful debug"); }', cases });
    const result = makeCodeRunResult({ problemId, language: 'typescript', cases, result: { status: 'completed', stdout: runTs(request.source), stderr: '', durationMs: 1, exitCode: 0, limits: request.limits } });
    expect(result.cases[0]).toMatchObject({ passed: false, error: 'helpful debug' });
    expect(result.cases[0]).not.toHaveProperty('actual');
  });
  it('preserves print debugging when execution fails before producing a report', () => {
    const cases = parseRunCases(problemId, getPublicRunCases(problemId));
    const result = makeCodeRunResult({ problemId, language: 'python', cases, result: { status: 'failed', stdout: 'before failure\n', stderr: 'runtime error', durationMs: 1, exitCode: 1, limits: { timeoutMs: 3000, memoryMb: 256, outputBytes: 50000 } } });
    expect(result).toMatchObject({ stdout: 'before failure', stderr: 'runtime error', cases: [{ passed: false, error: expect.any(String) }] });
  });
  it('reports non-finite numbers instead of silently changing their output to null', () => {
    const cases = parseRunCases(problemId, getPublicRunCases(problemId));
    const request = buildRunExecutionRequest({ problemId, language: 'typescript', source: 'function findPair() { return Infinity; }', cases });
    const result = makeCodeRunResult({ problemId, language: 'typescript', cases, result: { status: 'completed', stdout: runTs(request.source), stderr: '', durationMs: 1, exitCode: 0, limits: request.limits } });
    expect(result.cases[0]).toMatchObject({ passed: false, error: 'Return a JSON-compatible result' });
  });
  it('rejects forged passed flags and performs all comparisons outside the submitted process', () => {
    const request = buildGradedExecutionRequest({ problemId: 'climb-stairs-v1', language: 'typescript', source: 'function climbStairs() { return 0; }' });
    expect(request.source).not.toContain('expected');
    expect(request.source).not.toContain('passedCount');
    expect(gradeExecutionOutputs('climb-stairs-v1', runTs(request.source))).toMatchObject({ passed: false, passedCount: 0 });
    const forged = CODE_GRADING_MARKER + JSON.stringify({ problemId, version: CODE_GRADING_VERSION, passed: true, passedCount: 4, totalCount: 4, tests: codeCheckLabels(problemId).map(name => ({ name, passed: true })) });
    expect(gradeExecutionOutputs(problemId, forged)).toBeNull();
  });
  it('does not expose private runtime messages in Submit grades', () => {
    const request = buildGradedExecutionRequest({ problemId, language: 'typescript', source: 'function findPair(values) { throw new Error(JSON.stringify(values)); }' });
    const grade = gradeExecutionOutputs(problemId, runTs(request.source));
    expect(grade).toMatchObject({ passed: false, passedCount: 0 });
    expect(JSON.stringify(grade)).not.toContain('[3,3]');
  });
  it('does not expose stateful-class errors or private traces in Submit grades', () => {
    const id = 'lru-cache-v1';
    const request = buildGradedExecutionRequest({
      problemId: id,
      language: 'typescript',
      source: 'class LRUCache { constructor(capacity:number){} get(key:number){throw new Error("PRIVATE_CLASS_SENTINEL:"+key);} put(key:number,value:number){throw new Error("PRIVATE_CLASS_SENTINEL:"+value);} }',
    });
    const grade = gradeExecutionOutputs(id, runTs(request.source));
    expect(grade).toMatchObject({ passed: false, passedCount: 0, totalCount: 8 });
    expect(JSON.stringify(grade)).not.toContain('PRIVATE_CLASS_SENTINEL');
    expect(JSON.stringify(grade)).not.toContain('"LRUCache"');
    expect(JSON.stringify(grade)).not.toContain('"arguments"');
    expect(grade?.tests.every(test => !test.passed && test.detail === 'The code raised an error for this check.')).toBe(true);
  });
  it('rejects incomplete, wrong-problem and malformed reports', () => {
    expect(parseExecutionOutputs(CODE_OUTPUT_MARKER + JSON.stringify({ problemId, outputs: [{ passed: true }] }), problemId, 1)).toBeNull();
    expect(parseExecutionOutputs(CODE_OUTPUT_MARKER + JSON.stringify({ problemId: 'other', outputs: [{ actual: 1 }] }), problemId, 1)).toBeNull();
    expect(parseExecutionOutputs(CODE_OUTPUT_MARKER + JSON.stringify({ problemId, outputs: [{ actual: 1 }] }), problemId, 2)).toBeNull();
  });
  it('counts streamed UTF-8 bytes even when Content-Length lies', async () => {
    await expect(decodeCodeExecutionBody(new Request('http://localhost', { method: 'POST', headers: { 'content-length': '1' }, body: JSON.stringify({ source: 'é'.repeat(75_000) }) }))).rejects.toMatchObject({ status: 413 });
    await expect(decodeCodeExecutionBody(new Request('http://localhost', { method: 'POST', headers: { 'content-length': '140001' }, body: '{}' }))).rejects.toMatchObject({ status: 413 });
  });
  it('keeps a finite shared execution budget even with malformed configuration', () => {
    const previous = process.env.EXECUTION_SUBMISSIONS_PER_TEN_MINUTES;
    try {
      for (const invalid of ['NaN', '0', '-1', 'Infinity']) {
        process.env.EXECUTION_SUBMISSIONS_PER_TEN_MINUTES = invalid;
        expect(executionRateLimitOptions()).toEqual({ limit: 10, windowMs: 600000 });
      }
    } finally {
      if (previous === undefined) delete process.env.EXECUTION_SUBMISSIONS_PER_TEN_MINUTES;
      else process.env.EXECUTION_SUBMISSIONS_PER_TEN_MINUTES = previous;
    }
  });
});
