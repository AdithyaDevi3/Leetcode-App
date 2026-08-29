import { describe, expect, it } from 'vitest';
import { canRunExecution, executionPolicy, sanitizeSandboxOutput, validateExecutionPolicy } from './execution-policy';

const request = { language: 'typescript' as const, source: 'console.log(1)', limits: { timeoutMs: 1000, memoryMb: 128, outputBytes: 10_000 } };
describe('execution policy', () => {
  it('rejects oversized source or output requests', () => {
    expect(validateExecutionPolicy({ ...request, source: 'x'.repeat(executionPolicy.maxSourceBytes + 1), limits: { ...request.limits, outputBytes: executionPolicy.maxOutputBytes + 1 } })).toHaveLength(2);
  });
  it('enforces a rolling run quota and sanitizes terminal control characters', () => {
    const now = 1_000_000;
    expect(canRunExecution(Array.from({ length: 10 }, () => now - 1), now)).toBe(false);
    expect(sanitizeSandboxOutput('ok\u0000\u001b[31m')).toBe('ok[31m');
  });
});
