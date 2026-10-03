import { NextResponse } from 'next/server';

import { exactRecord, instructorGradebookError, requiredString, withInstructorGradebook } from '@/lib/instructor-gradebook';

export const runtime = 'nodejs';

export async function PUT(request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  try {
    const body = exactRecord(await request.json(), ['expectedApplicabilityRevisionId', 'applicability', 'reason', 'requestKey']);
    const applicability = requiredString(body.applicability, 16);
    if (applicability !== 'assigned' && applicability !== 'excused') throw new Error('Unsupported applicability');
    const { recipientId } = await params;
    const revision = await withInstructorGradebook(repository => repository.setRecipientApplicability({
      recipientId,
      expectedApplicabilityRevisionId: requiredString(body.expectedApplicabilityRevisionId, 36),
      applicability,
      reason: requiredString(body.reason, 4000),
      requestKey: requiredString(body.requestKey, 128),
    }));
    return NextResponse.json({ applicability: revision });
  } catch (error) {
    const mapped = instructorGradebookError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
