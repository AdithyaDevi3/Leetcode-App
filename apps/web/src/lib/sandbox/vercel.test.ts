import { describe, expect, it, vi } from 'vitest';

import { createVercelSandbox } from './vercel';

const request = {
  language: 'typescript' as const,
  source: 'const answer: number = 2; console.log(answer);',
  stdin: '',
  limits: { timeoutMs: 1_000, memoryMb: 256, outputBytes: 10_000 },
};

function fakeSandbox(files: Record<string, string>) {
  return {
    writeFiles: vi.fn().mockResolvedValue(undefined),
    runCommand: vi.fn().mockResolvedValue({ exitCode: 0 }),
    readFileToBuffer: vi.fn().mockImplementation(async ({ path }: { path: string }) =>
      Buffer.from(files[path] ?? '', 'utf8')),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Vercel Sandbox adapter', () => {
  it('transpiles TypeScript and executes it in an ephemeral network-denied microVM', async () => {
    const sandbox = fakeSandbox({
      '/vercel/sandbox/stdout.txt': '2\n',
      '/vercel/sandbox/exit-code.txt': '0',
    });
    const createSandbox = vi.fn().mockResolvedValue(sandbox);

    await expect(createVercelSandbox({ createSandbox }).execute(request)).resolves.toMatchObject({
      status: 'completed',
      stdout: '2\n',
      exitCode: 0,
    });

    expect(createSandbox).toHaveBeenCalledWith(expect.objectContaining({
      persistent: false,
      networkPolicy: 'deny-all',
      resources: { vcpus: 1 },
    }));
    const source = sandbox.writeFiles.mock.calls[0][0][0].content.toString('utf8');
    expect(source).toContain('const answer = 2');
    expect(source).not.toContain(': number');
    expect(sandbox.runCommand).toHaveBeenCalledWith('bash', expect.any(Array), { timeoutMs: 3_000 });
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });

  it('runs Python with stdin and maps the command timeout sentinel', async () => {
    const sandbox = fakeSandbox({
      '/vercel/sandbox/stderr.txt': 'Terminated\n',
      '/vercel/sandbox/exit-code.txt': '124',
    });
    const createSandbox = vi.fn().mockResolvedValue(sandbox);

    const result = await createVercelSandbox({ createSandbox }).execute({
      ...request,
      language: 'python',
      source: 'print(input())',
      stdin: 'hello',
    });

    expect(result).toMatchObject({ status: 'timed_out', exitCode: 124 });
    expect(sandbox.writeFiles.mock.calls[0][0][1].content.toString('utf8')).toBe('hello');
    expect(sandbox.runCommand.mock.calls[0][1][1]).toContain('python3 /vercel/sandbox/submission.py');
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });

  it('always stops the sandbox after infrastructure errors', async () => {
    const sandbox = fakeSandbox({});
    sandbox.runCommand.mockRejectedValue(new Error('provider unavailable'));
    const createSandbox = vi.fn().mockResolvedValue(sandbox);

    await expect(createVercelSandbox({ createSandbox }).execute(request)).rejects.toThrow('provider unavailable');
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });

  it('maps provider timeout errors without leaking provider details', async () => {
    const sandbox = fakeSandbox({});
    sandbox.runCommand.mockRejectedValue(new Error('command timeout exceeded'));
    const createSandbox = vi.fn().mockResolvedValue(sandbox);

    await expect(createVercelSandbox({ createSandbox }).execute(request)).resolves.toMatchObject({
      status: 'timed_out',
      stderr: 'Execution timed out.',
    });
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });
});
