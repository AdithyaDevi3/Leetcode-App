import type { ExecutionRequest, ExecutionResult } from '@leetcode-app/domain';
import { Sandbox } from '@vercel/sandbox';
import ts from 'typescript';

import { sanitizeSandboxOutput, validateExecutionPolicy } from './execution-policy';

type SandboxCreateOptions = {
  persistent: false;
  networkPolicy: 'deny-all';
  timeout: number;
  resources: { vcpus: 1 };
  tags: { workload: 'code-grading' };
};

type SandboxHandle = {
  writeFiles(files: Array<{ path: string; content: string | Uint8Array }>): Promise<void>;
  runCommand(command: string, args: string[], options: { timeoutMs: number }): Promise<{ exitCode: number }>;
  readFileToBuffer(file: { path: string }): Promise<Buffer | null>;
  stop(): Promise<unknown>;
};

export type VercelSandboxConfig = {
  createSandbox?: (options: SandboxCreateOptions) => Promise<SandboxHandle>;
};

const paths = {
  source: '/vercel/sandbox/submission',
  stdin: '/vercel/sandbox/stdin.txt',
  stdout: '/vercel/sandbox/stdout.txt',
  stderr: '/vercel/sandbox/stderr.txt',
  exitCode: '/vercel/sandbox/exit-code.txt',
} as const;

function transpile(source: string): { source: string; error?: string } {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });
  const diagnostics = result.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ?? [];
  if (!diagnostics.length) return { source: result.outputText };
  return {
    source: '',
    error: diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'),
  };
}

function result(
  request: ExecutionRequest,
  values: Omit<ExecutionResult, 'limits'>,
): ExecutionResult {
  return { ...values, limits: request.limits };
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /timed?\s*out|timeout|deadline|abort/i.test(`${error.name} ${error.message}`);
}

async function readOutput(sandbox: SandboxHandle, path: string): Promise<string> {
  const value = await sandbox.readFileToBuffer({ path });
  return sanitizeSandboxOutput(value?.toString('utf8') ?? '');
}

export function createVercelSandbox(config: VercelSandboxConfig = {}) {
  const createSandbox = config.createSandbox ?? ((options) => Sandbox.create(options));

  return {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      const startedAt = Date.now();
      const policyErrors = validateExecutionPolicy(request);
      if (policyErrors.length) throw new Error(policyErrors.join('; '));

      const compiled = request.language === 'typescript' ? transpile(request.source) : { source: request.source };
      if (compiled.error) {
        return result(request, {
          status: 'failed',
          stdout: '',
          stderr: sanitizeSandboxOutput(compiled.error),
          exitCode: 1,
          durationMs: Date.now() - startedAt,
        });
      }

      const extension = request.language === 'typescript' ? '.js' : '.py';
      const sourcePath = `${paths.source}${extension}`;
      const sandbox = await createSandbox({
        persistent: false,
        networkPolicy: 'deny-all',
        timeout: Math.max(15_000, request.limits.timeoutMs + 10_000),
        resources: { vcpus: 1 },
        tags: { workload: 'code-grading' },
      });

      try {
        await sandbox.writeFiles([
          { path: sourcePath, content: Buffer.from(compiled.source, 'utf8') },
          { path: paths.stdin, content: Buffer.from(request.stdin ?? '', 'utf8') },
        ]);

        const timeoutSeconds = Math.max(0.1, request.limits.timeoutMs / 1000).toFixed(3);
        const outputBlocks = Math.max(1, Math.ceil(request.limits.outputBytes / 1024));
        const memoryKb = request.limits.memoryMb * 1024;
        const runtimeCommand = request.language === 'typescript'
          ? `node --max-old-space-size=${Math.max(32, request.limits.memoryMb - 96)} ${sourcePath}`
          : `ulimit -v ${memoryKb}; python3 ${sourcePath}`;
        const shellScript = [
          'set +e',
          `ulimit -f ${outputBlocks}`,
          `timeout --signal=KILL --kill-after=1s ${timeoutSeconds}s ${runtimeCommand} < ${paths.stdin} > ${paths.stdout} 2> ${paths.stderr}`,
          `printf '%s' "$?" > ${paths.exitCode}`,
          'exit 0',
        ].join('\n');

        await sandbox.runCommand('bash', ['-lc', shellScript], {
          timeoutMs: request.limits.timeoutMs + 2_000,
        });

        const [stdout, stderr, rawExitCode] = await Promise.all([
          readOutput(sandbox, paths.stdout),
          readOutput(sandbox, paths.stderr),
          readOutput(sandbox, paths.exitCode),
        ]);
        const exitCode = Number.parseInt(rawExitCode, 10);
        const normalizedExitCode = Number.isInteger(exitCode) ? exitCode : null;
        const timedOut = normalizedExitCode === 124;

        return result(request, {
          status: timedOut ? 'timed_out' : normalizedExitCode === 0 ? 'completed' : 'failed',
          stdout,
          stderr,
          exitCode: normalizedExitCode,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        if (isTimeoutError(error)) {
          return result(request, {
            status: 'timed_out',
            stdout: '',
            stderr: 'Execution timed out.',
            exitCode: null,
            durationMs: Date.now() - startedAt,
          });
        }
        throw error;
      } finally {
        await sandbox.stop().catch(() => undefined);
      }
    },
  };
}
