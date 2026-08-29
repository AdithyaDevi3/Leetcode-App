export type ExecutionLanguage = 'typescript' | 'python';
export type ExecutionLimits = { timeoutMs: number; memoryMb: number; outputBytes: number };
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled' | 'timed_out';
export type ExecutionRequest = { language: ExecutionLanguage; source: string; stdin?: string; limits: ExecutionLimits };
export type ExecutionResult = { status: ExecutionStatus; stdout: string; stderr: string; exitCode: number | null; durationMs: number; limits: ExecutionLimits };

export function validateExecutionRequest(request: ExecutionRequest): string[] {
  const errors: string[] = [];
  if (!request.source.trim()) errors.push('Source is required');
  if (!['typescript', 'python'].includes(request.language)) errors.push('Unsupported language');
  if (!Number.isInteger(request.limits.timeoutMs) || request.limits.timeoutMs < 100 || request.limits.timeoutMs > 30_000) errors.push('timeoutMs must be between 100 and 30000');
  if (!Number.isInteger(request.limits.memoryMb) || request.limits.memoryMb < 32 || request.limits.memoryMb > 512) errors.push('memoryMb must be between 32 and 512');
  if (!Number.isInteger(request.limits.outputBytes) || request.limits.outputBytes < 1_024 || request.limits.outputBytes > 1_000_000) errors.push('outputBytes must be between 1024 and 1000000');
  return errors;
}
