import { listAppeals, resolveAppeal, submitAppeal, type EvaluationAppeal } from './evaluation-appeals';
import { createEvaluationAppealStore } from './evaluation-appeals-postgres';

const usePostgres = () => process.env.EVALUATION_JOB_STORE === 'postgres';
let postgresStore: ReturnType<typeof createEvaluationAppealStore> | undefined;
const getPostgresStore = () => (postgresStore ??= createEvaluationAppealStore());

export async function submitRuntimeAppeal(input: Pick<EvaluationAppeal, 'jobId' | 'userId' | 'findingId' | 'context'>) {
  if (usePostgres()) return getPostgresStore().submit(input);
  return submitAppeal(input);
}
export async function listRuntimeAppeals(jobId: string, userId: string) {
  if (usePostgres()) return getPostgresStore().listOwned(jobId, userId);
  return listAppeals().filter((appeal) => appeal.jobId === jobId && appeal.userId === userId);
}
export async function resolveRuntimeAppeal(id: string, input: { reviewerId: string; approved: boolean; reason: string }) {
  if (usePostgres()) return getPostgresStore().resolve(id, input);
  return resolveAppeal(id, input);
}
