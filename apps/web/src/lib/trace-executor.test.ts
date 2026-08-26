import { describe, expect, it } from 'vitest';
import { executeTraces } from './trace-executor';

describe('bounded trace execution', () => {
  it('records passing and failing authored cases', async () => {
    const result = await executeTraces([{ id: 'pass', input: 2, expected: 4 }, { id: 'fail', input: 3, expected: 4 }], (input) => Number(input) * 2);
    expect(result.map((item) => item.passed)).toEqual([true, false]);
  });

  it('stops work that exceeds the step budget', async () => {
    const result = await executeTraces([{ id: 'bounded', input: 0, expected: 1 }], (_input, budget) => { while (true) budget.step(); }, { maxSteps: 2 });
    expect(result[0]).toMatchObject({ passed: false, error: 'Trace resource limit exceeded', steps: 3 });
  });
});
