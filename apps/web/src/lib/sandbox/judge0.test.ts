import { describe, expect, it, vi } from 'vitest';
import { createJudge0Sandbox } from './judge0';

const request = { language: 'typescript' as const, source: 'console.log(1)', limits: { timeoutMs: 1000, memoryMb: 128, outputBytes: 10_000 } };

describe('Judge0 sandbox adapter', () => {
  it('sends bounded execution inputs and maps completed output', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ stdout: '1\n', status: { id: 3 }, exit_code: 0, time: '0.01' }), { status: 201 }));
    const sandbox = createJudge0Sandbox({ endpoint: 'https://judge.example/', token: 'secret', languageIds: { typescript: 74, python: 71, cpp: 54, java: 62 }, fetcher });
    await expect(sandbox.execute(request)).resolves.toMatchObject({ status: 'completed', stdout: '1\n', durationMs: 10 });
    expect(fetcher.mock.calls[0][0]).toBe('https://judge.example/submissions?base64_encoded=false&wait=true');
  });
  it('maps sandbox timeout responses', async () => {
    const sandbox = createJudge0Sandbox({ endpoint: 'https://judge.example', token: 'secret', languageIds: { typescript: 74, python: 71, cpp: 54, java: 62 }, fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: { id: 5 } }), { status: 201 })) });
    await expect(sandbox.execute(request)).resolves.toMatchObject({ status: 'timed_out' });
  });
  it('does not mark a nonzero exit as successful when stderr is empty', async () => {
    const sandbox = createJudge0Sandbox({ endpoint: 'https://judge.example', token: 'secret', languageIds: { typescript: 74, python: 71, cpp: 54, java: 62 }, fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: { id: 11 }, exit_code: 1 }), { status: 201 })) });
    await expect(sandbox.execute(request)).resolves.toMatchObject({ status: 'failed', exitCode: 1 });
  });
  it('treats provider-internal statuses as unavailable', async () => {
    const sandbox = createJudge0Sandbox({ endpoint: 'https://judge.example', token: 'secret', languageIds: { typescript: 74, python: 71, cpp: 54, java: 62 }, fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: { id: 13 } }), { status: 201 })) });
    await expect(sandbox.execute(request)).rejects.toThrow('Sandbox provider returned an unavailable status');
  });
  it('sends Java to the configured compiler with bounded limits and returns compiler errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: { id: 6 }, compile_output: 'Main.java:1: error: invalid syntax',
    }), { status: 201 }));
    const sandbox = createJudge0Sandbox({
      endpoint: 'https://judge.example', token: 'secret', languageIds: { typescript: 74, python: 71, cpp: 54, java: 62 }, fetcher,
    });
    await expect(sandbox.execute({ ...request, language: 'java', source: 'class Main {' })).resolves.toMatchObject({
      status: 'failed', stderr: 'Main.java:1: error: invalid syntax',
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      language_id: 62, cpu_time_limit: 1, memory_limit: 131072, max_file_size: 10,
    });
  });
  it('rejects an invalid language mapping before sending source to the provider', async () => {
    const fetcher = vi.fn();
    const sandbox = createJudge0Sandbox({
      endpoint: 'https://judge.example', token: 'secret', languageIds: { typescript: 74, python: 71, cpp: 54, java: NaN }, fetcher,
    });
    await expect(sandbox.execute({ ...request, language: 'java', source: 'class Main {}' })).rejects.toThrow('Sandbox language is not configured');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
