import { describe, expect, it } from 'vitest';
import { validateExecutionRequest } from './execution';

describe('execution contract', () => {
  it('accepts bounded supported requests', () => {
    expect(validateExecutionRequest({ language: 'typescript', source: 'console.log(1)', limits: { timeoutMs: 1000, memoryMb: 128, outputBytes: 10_000 } })).toEqual([]);
  });
  it('rejects empty source and unsafe or missing limits', () => {
    expect(validateExecutionRequest({ language: 'python', source: ' ', limits: { timeoutMs: 0, memoryMb: 1, outputBytes: 1 } })).toHaveLength(4);
  });
});
