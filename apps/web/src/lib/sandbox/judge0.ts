import type { ExecutionRequest, ExecutionResult } from '@leetcode-app/domain';
import { sanitizeSandboxOutput, validateExecutionPolicy } from './execution-policy';

type Judge0Response = { stdout?: string | null; stderr?: string | null; compile_output?: string | null; status?: { id?: number; description?: string }; exit_code?: number | null; time?: string | null };
export type Judge0Config = { endpoint: string; token: string; languageIds: Record<ExecutionRequest['language'], number>; fetcher?: typeof fetch };

export function createJudge0Sandbox(config: Judge0Config) {
  const fetcher = config.fetcher ?? fetch;
  return {
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
      const policyErrors = validateExecutionPolicy(request);
      if (policyErrors.length) throw new Error(policyErrors.join('; '));
      const response = await fetcher(`${config.endpoint.replace(/\/$/, '')}/submissions?base64_encoded=false&wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': config.token },
        body: JSON.stringify({ source_code: request.source, stdin: request.stdin ?? '', language_id: config.languageIds[request.language], cpu_time_limit: request.limits.timeoutMs / 1000, memory_limit: request.limits.memoryMb * 1024, max_file_size: Math.ceil(request.limits.outputBytes / 1024) }),
      });
      if (!response.ok) throw new Error(`Sandbox request failed with status ${response.status}`);
      const result = await response.json() as Judge0Response;
      const durationMs = Math.round(Number(result.time ?? 0) * 1000);
      const stderr = sanitizeSandboxOutput(result.stderr ?? result.compile_output ?? '');
      const timedOut = result.status?.id === 5;
      const nonzeroExit = result.exit_code !== undefined && result.exit_code !== null && result.exit_code !== 0;
      const sandboxFailure = result.status?.id !== undefined && result.status.id !== 3 && !timedOut;
      return { status: timedOut ? 'timed_out' : stderr || nonzeroExit || sandboxFailure ? 'failed' : 'completed', stdout: sanitizeSandboxOutput(result.stdout ?? ''), stderr, exitCode: result.exit_code ?? null, durationMs, limits: request.limits };
    },
  };
}
