import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('Vercel Sandbox adapter', () => {
  it.each(['typescript', 'python', 'cpp', 'java'] as const)('keeps a configured %s snapshot execution ephemeral and network-denied', async language => {
    const sandbox = fakeSandbox({ '/vercel/sandbox/exit-code.txt': '0' });
    const createSandbox = vi.fn().mockResolvedValue(sandbox);
    await createVercelSandbox({ createSandbox, snapshotId: 'snap_test_toolchain' }).execute({ ...request, language });
    expect(createSandbox).toHaveBeenCalledExactlyOnceWith({
      source: { type: 'snapshot', snapshotId: 'snap_test_toolchain' },
      persistent: false, networkPolicy: 'deny-all', timeout: 15000,
      resources: { vcpus: 1 }, tags: { workload: 'code-grading' },
    });
    const options = createSandbox.mock.calls[0][0];
    expect(options).not.toHaveProperty('env');
    expect(options).not.toHaveProperty('runtime');
    expect(options).not.toHaveProperty('image');
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });

  it('reads the snapshot only from server configuration', async () => {
    vi.stubEnv('VERCEL_SANDBOX_SNAPSHOT_ID', 'snap_server_toolchain');
    const sandbox = fakeSandbox({ '/vercel/sandbox/exit-code.txt': '0' });
    const createSandbox = vi.fn().mockResolvedValue(sandbox);
    await createVercelSandbox({ createSandbox }).execute(request);
    expect(createSandbox).toHaveBeenCalledWith(expect.objectContaining({ source: { type: 'snapshot', snapshotId: 'snap_server_toolchain' } }));
  });

  it('lets explicit trusted configuration override the environment', async () => {
    vi.stubEnv('VERCEL_SANDBOX_SNAPSHOT_ID', 'snap_environment_toolchain');
    const sandbox = fakeSandbox({ '/vercel/sandbox/exit-code.txt': '0' });
    const createSandbox = vi.fn().mockResolvedValue(sandbox);
    await createVercelSandbox({ createSandbox, snapshotId: 'snap_config_toolchain' }).execute(request);
    expect(createSandbox).toHaveBeenCalledWith(expect.objectContaining({ source: { type: 'snapshot', snapshotId: 'snap_config_toolchain' } }));
  });

  it('uses the default source only when no snapshot is configured', async () => {
    vi.stubEnv('VERCEL_SANDBOX_SNAPSHOT_ID', '');
    const sandbox = fakeSandbox({ '/vercel/sandbox/exit-code.txt': '0' });
    const createSandbox = vi.fn().mockResolvedValue(sandbox);
    await createVercelSandbox({ createSandbox }).execute(request);
    expect(createSandbox).toHaveBeenCalledOnce();
    expect(createSandbox.mock.calls[0][0]).not.toHaveProperty('source');
    expect(createSandbox.mock.calls[0][0]).toMatchObject({ persistent: false, networkPolicy: 'deny-all' });
  });

  it.each([' ', 'not-a-snapshot', 'https://example.com/toolchain', 'snap_bad/../value', 'snap_bad\nvalue', `snap_${'x'.repeat(196)}`])('rejects malformed snapshot configuration before creating a sandbox', snapshotId => {
    const createSandbox = vi.fn();
    expect(() => createVercelSandbox({ createSandbox, snapshotId })).toThrow('must be a valid snapshot identifier');
    expect(createSandbox).not.toHaveBeenCalled();
  });

  it('does not fall back when the configured snapshot is missing or inaccessible', async () => {
    const createSandbox = vi.fn().mockRejectedValue(new Error('snapshot is unavailable'));
    await expect(createVercelSandbox({ createSandbox, snapshotId: 'snap_test_toolchain' }).execute(request)).rejects.toThrow('snapshot is unavailable');
    expect(createSandbox).toHaveBeenCalledOnce();
    expect(createSandbox).toHaveBeenCalledWith(expect.objectContaining({ source: { type: 'snapshot', snapshotId: 'snap_test_toolchain' }, networkPolicy: 'deny-all' }));
  });

  it('stops a late snapshot creation after its deadline without trying another image', async () => {
    vi.useFakeTimers();
    const sandbox = fakeSandbox({});
    let finish!: (value: typeof sandbox) => void;
    const createSandbox = vi.fn().mockReturnValue(new Promise<typeof sandbox>(resolve => { finish = resolve; }));
    const pending = createVercelSandbox({ createSandbox, snapshotId: 'snap_test_toolchain' }).execute(request);
    const rejection = expect(pending).rejects.toThrow('Sandbox creation timed out');
    await vi.advanceTimersByTimeAsync(11001);
    await rejection;
    finish(sandbox);
    await vi.advanceTimersByTimeAsync(0);
    expect(createSandbox).toHaveBeenCalledOnce();
    expect(sandbox.stop).toHaveBeenCalledOnce();
    expect(sandbox.writeFiles).not.toHaveBeenCalled();
    expect(sandbox.runCommand).not.toHaveBeenCalled();
  });

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
    expect(sandbox.runCommand.mock.calls[0][1][1]).toMatch(/timeout[^\n]+bash -lc 'ulimit -v/);
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });

  it('compiles and runs C++20 in the isolated microVM', async () => {
    const sandbox = fakeSandbox({
      '/vercel/sandbox/stdout.txt': '2\n',
      '/vercel/sandbox/exit-code.txt': '0',
    });
    const createSandbox = vi.fn().mockResolvedValue(sandbox);

    await expect(createVercelSandbox({ createSandbox }).execute({
      ...request,
      language: 'cpp',
      source: '#include <iostream>\nint main() { std::cout << 2 << "\\n"; }',
    })).resolves.toMatchObject({ status: 'completed', stdout: '2\n' });

    expect(sandbox.writeFiles.mock.calls[0][0][0].path).toBe('/vercel/sandbox/submission.cpp');
    expect(sandbox.runCommand.mock.calls[0][1][1]).toContain('g++ -std=c++20 -O2 -pipe');
    expect(sandbox.runCommand.mock.calls[0][1][1]).toContain('/vercel/sandbox/submission-bin');
    expect(sandbox.runCommand.mock.calls[0][1][1]).toMatch(/timeout[^\n]+bash -lc 'if g\+\+/);
  });

  it('always stops the sandbox after infrastructure errors', async () => {
    const sandbox = fakeSandbox({});
    sandbox.runCommand.mockRejectedValue(new Error('provider unavailable'));
    const createSandbox = vi.fn().mockResolvedValue(sandbox);

    await expect(createVercelSandbox({ createSandbox }).execute(request)).rejects.toThrow('provider unavailable');
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });

  it('compiles Java Main.java and runs the JVM inside the same bounded command', async () => {
    const sandbox = fakeSandbox({
      '/vercel/sandbox/stdout.txt': 'hello\n',
      '/vercel/sandbox/exit-code.txt': '0',
    });
    const createSandbox = vi.fn().mockResolvedValue(sandbox);
    await expect(createVercelSandbox({ createSandbox }).execute({
      ...request,
      language: 'java',
      source: 'public class Main { public static void main(String[] args) { System.out.println("hello"); } }',
    })).resolves.toMatchObject({ status: 'completed', stdout: 'hello\n', exitCode: 0 });
    expect(sandbox.writeFiles.mock.calls[0][0][0].path).toBe('/vercel/sandbox/Main.java');
    const command = sandbox.runCommand.mock.calls[0][1][1];
    expect(command).toMatch(/timeout[^\n]+bash -lc 'if ! command -v javac/);
    expect(command).toContain('javac -J-Xms16m -J-Xmx128m -encoding UTF-8 -d /vercel/sandbox /vercel/sandbox/Main.java');
    expect(command).toContain('exec java -Xms16m -Xmx128m');
    expect(command).toContain('-XX:MaxMetaspaceSize=64m');
    expect(command).toContain('-cp /vercel/sandbox Main');
    expect(command).not.toMatch(/curl|wget|apt-get|yum|dnf/);
    expect(createSandbox).toHaveBeenCalledWith(expect.objectContaining({ persistent: false, networkPolicy: 'deny-all' }));
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });

  it('reports missing Java compiler and always closes the execution sandbox', async () => {
    const sandbox = fakeSandbox({
      '/vercel/sandbox/stderr.txt': 'Java compiler is unavailable in this execution environment.\n',
      '/vercel/sandbox/exit-code.txt': '127',
    });
    await expect(createVercelSandbox({ createSandbox: vi.fn().mockResolvedValue(sandbox) }).execute({
      ...request, language: 'java', source: 'class Main {}',
    })).resolves.toMatchObject({ status: 'failed', exitCode: 127, stderr: 'Java compiler is unavailable in this execution environment.\n' });
    expect(sandbox.stop).toHaveBeenCalledOnce();
  });

  it('maps a timeout that required SIGKILL to timed_out', async () => {
    const sandbox = fakeSandbox({ '/vercel/sandbox/exit-code.txt': '137' });
    await expect(createVercelSandbox({ createSandbox: vi.fn().mockResolvedValue(sandbox) }).execute({
      ...request, language: 'java', source: 'class Main {}',
    })).resolves.toMatchObject({ status: 'timed_out', exitCode: 137 });
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
