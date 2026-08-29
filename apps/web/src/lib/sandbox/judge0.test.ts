import { describe, expect, it, vi } from 'vitest';
import { createJudge0Sandbox } from './judge0';

const request = { language: 'typescript' as const, source: 'console.log(1)', limits: { timeoutMs: 1000, memoryMb: 128, outputBytes: 10_000 } };

describe('Judge0 sandbox adapter', () => {
  it('sends bounded execution inputs and maps completed output', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ stdout: '1\n', status: { id: 3 }, exit_code: 0, time: '0.01' }), { status: 201 }));
    const sandbox = createJudge0Sandbox({ endpoint: 'https://judge.example/', token: 'secret', languageIds: { typescript: 74, python: 71 }, fetcher });
    await expect(sandbox.execute(request)).resolves.toMatchObject({ status: 'completed', stdout: '1\n', durationMs: 10 });
    expect(fetcher.mock.calls[0][0]).toBe('https://judge.example/submissions?base64_encoded=false&wait=true');
  });
  it('maps sandbox timeout responses', async () => {
    const sandbox = createJudge0Sandbox({ endpoint: 'https://judge.example', token: 'secret', languageIds: { typescript: 74, python: 71 }, fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: { id: 5 } }), { status: 201 })) });
    await expect(sandbox.execute(request)).resolves.toMatchObject({ status: 'timed_out' });
  });
});
