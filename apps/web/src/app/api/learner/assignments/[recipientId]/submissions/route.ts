import { NextResponse } from 'next/server';
import { createDatabaseClient, databaseConfigFromEnv, PostgresGradebookRepository } from '@leetcode-app/database';

import { parseAssignmentSubmissionBody, mapAssignmentSubmissionError } from '@/lib/assignment-submission';
import { requireAuth } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  let db: ReturnType<typeof createDatabaseClient> | null = null;
  try {
    const session = await requireAuth();
    const input = parseAssignmentSubmissionBody(await request.json().catch(() => null));
    const { recipientId } = await params;
    db = createDatabaseClient(databaseConfigFromEnv());
    const gradebook = new PostgresGradebookRepository(db, { role: 'learner', userId: session.user.id });
    const history = await gradebook.readRecipient(recipientId);
    const attempt = await gradebook.submitAttempt({
      recipientId,
      policyVersionId: history.policy.versionId,
      response: { language: input.language, text: input.source },
      requestKey: input.requestKey,
    });
    const verificationStatus = attempt.verificationStatus ?? (attempt.verificationJobId ? 'queued' : null);
    const pending = verificationStatus === 'queued' || verificationStatus === 'running';
    return NextResponse.json({
      attempt: {
        id: attempt.id,
        responseRevisionId: attempt.responseRevisionId,
        sequence: attempt.sequence,
        verificationJobId: attempt.verificationJobId ?? null,
        status: verificationStatus ?? 'submitted',
      },
    }, { status: pending ? 202 : attempt.verificationJobId ? 200 : 201 });
  } catch (error) {
    const mapped = mapAssignmentSubmissionError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  } finally {
    await db?.close();
  }
}
