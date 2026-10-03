import { createDatabaseClient, databaseConfigFromEnv, PostgresGradebookVerificationRepository } from '@leetcode-app/database';
import { NextResponse } from 'next/server';

const maxQueueAge = () => {
  const configured = Number(process.env.VERIFICATION_QUEUE_MAX_AGE_MS ?? 60_000);
  return Number.isFinite(configured) && configured >= 0 ? configured : 60_000;
};

export async function GET() {
  if (process.env.CODE_EXECUTION_ENABLED !== 'true') {
    return NextResponse.json({ status: 'disabled', service: 'gradebook-verification-queue' });
  }
  let db: ReturnType<typeof createDatabaseClient> | null = null;
  try {
    db = createDatabaseClient(databaseConfigFromEnv());
    const metrics = await new PostgresGradebookVerificationRepository(db).metrics();
    const status = metrics.oldestQueuedAgeMs > maxQueueAge() || metrics.expiredLeases > 0 ? 'degraded' : 'ok';
    return NextResponse.json({ status, service: 'gradebook-verification-queue', metrics }, { status: status === 'ok' ? 200 : 503 });
  } catch {
    return NextResponse.json({ status: 'unavailable', service: 'gradebook-verification-queue' }, { status: 503 });
  } finally {
    await db?.close();
  }
}
