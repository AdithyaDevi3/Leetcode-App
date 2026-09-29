import { NextResponse } from 'next/server';

import { exactRecord, instructorGradebookError, optionalUuid, requiredString, withInstructorGradebook } from '@/lib/instructor-gradebook';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  try {
    const body = exactRecord(await request.json(), [
      'expectedDisputeEventId', 'outcome', 'replacementGradeRevisionId', 'reason', 'requestKey',
    ]);
    const outcome = requiredString(body.outcome, 16);
    if (outcome !== 'upheld' && outcome !== 'changed') throw new Error('Unsupported dispute outcome');
    const replacementGradeRevisionId = optionalUuid(body.replacementGradeRevisionId);
    if ((outcome === 'changed') !== (replacementGradeRevisionId !== null)) throw new Error('Invalid replacement grade');
    const { recipientId } = await params;
    const dispute = await withInstructorGradebook(repository => repository.resolveGradeDispute({
      recipientId,
      expectedDisputeEventId: requiredString(body.expectedDisputeEventId, 36),
      outcome,
      replacementGradeRevisionId,
      reason: requiredString(body.reason, 4000),
      requestKey: requiredString(body.requestKey, 128),
    }));
    return NextResponse.json({ dispute });
  } catch (error) {
    const mapped = instructorGradebookError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
