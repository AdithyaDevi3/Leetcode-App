import { ASSIGNMENT_VERIFIER_VERSION, createDatabaseClient, databaseConfigFromEnv, PostgresGradebookVerificationRepository } from '@leetcode-app/database';
import type { GradebookVerificationJob, GradebookVerificationSummary } from '@leetcode-app/database';
import { createConfiguredSandbox } from '@/lib/sandbox/runtime';
import { executionLimits, sanitizeSandboxOutput } from '@/lib/sandbox/execution-policy';

const errorCode = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'unknown';
  const code = message.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return code || 'verifier-error';
};

type PinnedTest = { input: string; expected: string };

function pinnedTests(value: unknown): PinnedTest[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) throw new Error('Invalid pinned test suite');
  return value.map((test) => {
    if (!test || typeof test !== 'object' || Array.isArray(test)) throw new Error('Invalid pinned test suite');
    const record = test as Record<string, unknown>;
    if (typeof record.input !== 'string' || new TextEncoder().encode(record.input).byteLength > 50_000
      || typeof record.expected !== 'string' || new TextEncoder().encode(record.expected).byteLength > 50_000) {
      throw new Error('Invalid pinned test suite');
    }
    return { input: record.input, expected: record.expected };
  });
}

function validResult(value: unknown): value is { status: 'completed' | 'failed' | 'timed_out'; stdout: string; durationMs: number } {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return ['completed', 'failed', 'timed_out'].includes(String(result.status))
    && typeof result.stdout === 'string'
    && Number.isSafeInteger(result.durationMs)
    && (result.durationMs as number) >= 0
    && (result.durationMs as number) <= 60_000;
}

async function runPinnedTests(job: GradebookVerificationJob): Promise<GradebookVerificationSummary> {
  if (job.verifierVersionId !== ASSIGNMENT_VERIFIER_VERSION) throw new Error('Unsupported verifier version');
  const sandbox = createConfiguredSandbox();
  const tests = pinnedTests(job.pinnedTests);
  let passedTests = 0;
  let durationMs = 0;
  for (const test of tests) {
    const result = await sandbox.execute({ language: job.language, source: job.source, stdin: test.input, limits: executionLimits });
    if (!validResult(result)) throw new Error('Invalid sandbox result');
    durationMs += result.durationMs;
    if (result.status === 'completed' && sanitizeSandboxOutput(result.stdout).trim() === test.expected.trim()) passedTests += 1;
  }
  return { passedTests, totalTests: tests.length, durationMs };
}

export async function processNextVerificationJob() {
  if (process.env.CODE_EXECUTION_ENABLED !== 'true') return null;
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    const verifier = new PostgresGradebookVerificationRepository(db);
    const job = await verifier.claimNext(300_000);
    if (!job) return null;
    try {
      const summary = await runPinnedTests(job);
      const outcome = summary.passedTests === summary.totalTests ? 'passed' as const : 'failed' as const;
      const gradeId = await verifier.resolve({ jobId: job.id, leaseToken: job.leaseToken, outcome, summary });
      return { jobId: job.id, status: gradeId ? outcome : 'stale' as const };
    } catch (error) {
      const status = await verifier.unavailable({ jobId: job.id, leaseToken: job.leaseToken, errorCode: errorCode(error) });
      return { jobId: job.id, status: status ?? 'stale' as const };
    }
  } finally {
    await db.close();
  }
}
