import { NextResponse } from 'next/server';
import { createDatabaseClient, databaseConfigFromEnv, PostgresGradebookRepository } from '@leetcode-app/database';

import { requireAuth } from '@/lib/auth/session';
import { learnerGradeDisputeError, parseOpenGradeDisputeBody } from '@/lib/learner-grade-dispute';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  let db: ReturnType<typeof createDatabaseClient> | null = null;
  try {
    const session = await requireAuth();
    const input = parseOpenGradeDisputeBody(await request.json());
    const { recipientId } = await params;
    db = createDatabaseClient(databaseConfigFromEnv());
    const repository = new PostgresGradebookRepository(db, { role: 'learner', userId: session.user.id });
    const dispute = await repository.openGradeDispute({ recipientId, ...input });
    return NextResponse.json({ dispute }, { status: 201 });
  } catch (error) {
    const mapped = learnerGradeDisputeError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  } finally {
    await db?.close();
  }
}
