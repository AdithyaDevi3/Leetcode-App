import { NextResponse } from 'next/server';

import { exactRecord, instructorGradebookError, requiredString, withInstructorGradebook } from '@/lib/instructor-gradebook';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  try {
    const body = exactRecord(await request.json(), ['expectedDisputeEventId', 'reason', 'requestKey']);
    const { recipientId } = await params;
    const dispute = await withInstructorGradebook(repository => repository.markGradeDisputeInReview({
      recipientId,
      expectedDisputeEventId: requiredString(body.expectedDisputeEventId, 36),
      reason: requiredString(body.reason, 4000),
      requestKey: requiredString(body.requestKey, 128),
    }));
    return NextResponse.json({ dispute });
  } catch (error) {
    const mapped = instructorGradebookError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
