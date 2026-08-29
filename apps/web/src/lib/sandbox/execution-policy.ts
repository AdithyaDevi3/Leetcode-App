import type { ExecutionRequest } from '@leetcode-app/domain';

export const executionPolicy = { maxSourceBytes: 100_000, maxOutputBytes: 50_000, maxRunsPerWindow: 10, windowMs: 10 * 60_000 } as const;

export function validateExecutionPolicy(request: ExecutionRequest): string[] {
  const errors: string[] = [];
  if (new TextEncoder().encode(request.source).byteLength > executionPolicy.maxSourceBytes) errors.push('Source exceeds the maximum size');
  if (request.limits.outputBytes > executionPolicy.maxOutputBytes) errors.push('Requested output exceeds the maximum size');
  return errors;
}

export function canRunExecution(recentRunTimes: number[], now = Date.now()): boolean {
  return recentRunTimes.filter((time) => now - time < executionPolicy.windowMs).length < executionPolicy.maxRunsPerWindow;
}

export function sanitizeSandboxOutput(output: string): string {
  return output.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, executionPolicy.maxOutputBytes);
}
