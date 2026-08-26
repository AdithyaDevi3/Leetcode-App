export type TraceCase = { id: string; input: unknown; expected: unknown };
export type TraceResult = { caseId: string; passed: boolean; actual?: unknown; error?: string; steps: number };

export async function executeTraces<T>(cases: TraceCase[], run: (input: unknown, budget: { step: () => void }) => Promise<T> | T, options: { maxSteps?: number; timeoutMs?: number } = {}) {
  const maxSteps = options.maxSteps ?? 10_000;
  const timeoutMs = options.timeoutMs ?? 1_000;
  return Promise.all(cases.map(async (testCase): Promise<TraceResult> => {
    let steps = 0;
    const started = Date.now();
    const budget = { step: () => { steps += 1; if (steps > maxSteps || Date.now() - started > timeoutMs) throw new Error('Trace resource limit exceeded'); } };
    try {
      const actual = await run(testCase.input, budget);
      return { caseId: testCase.id, passed: JSON.stringify(actual) === JSON.stringify(testCase.expected), actual, steps };
    } catch (error) {
      return { caseId: testCase.id, passed: false, error: error instanceof Error ? error.message : 'Trace failed', steps };
    }
  }));
}
