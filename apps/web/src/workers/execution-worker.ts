import { createExecutionJobStore } from '@/lib/execution-jobs-postgres';
import { createJudge0Sandbox } from '@/lib/sandbox/judge0';

const codeExecutionEnabled = () => process.env.CODE_EXECUTION_ENABLED === 'true';
const sandbox = () => {
  const endpoint = process.env.JUDGE0_ENDPOINT;
  const token = process.env.JUDGE0_TOKEN;
  if (!endpoint || !token) throw new Error('Judge0 sandbox configuration is missing');
  return createJudge0Sandbox({ endpoint, token, languageIds: { typescript: Number(process.env.JUDGE0_TYPESCRIPT_LANGUAGE_ID ?? 74), python: Number(process.env.JUDGE0_PYTHON_LANGUAGE_ID ?? 71) } });
};

export async function processNextExecutionJob() {
  if (!codeExecutionEnabled()) return null;
  const store = createExecutionJobStore();
  const job = await store.claimNext();
  if (!job) return null;
  try {
    const result = await sandbox().execute(job.request);
    await store.complete(job.id, result);
    return { jobId: job.id, status: result.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown execution failure';
    await store.fail(job.id, message);
    return { jobId: job.id, status: 'failed' as const, error: message };
  }
}
