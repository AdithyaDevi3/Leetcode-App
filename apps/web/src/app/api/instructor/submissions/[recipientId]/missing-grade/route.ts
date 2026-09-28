import { NextResponse } from 'next/server';

import { exactRecord, instructorGradebookError, optionalUuid, requiredString, withInstructorGradebook } from '@/lib/instructor-gradebook';

export const runtime = 'nodejs';

export async function PUT(request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  try {
    const body = exactRecord(await request.json(), ['expectedGradeRevisionId', 'requestKey']);
    const { recipientId } = await params;
    const grade = await withInstructorGradebook(repository => repository.appendGrade({
      recipientId,
      attemptId: null,
      expectedGradeRevisionId: optionalUuid(body.expectedGradeRevisionId),
      kind: 'missing_zero',
      criterionScores: {},
      learnerFeedback: '',
      privateNote: '',
      reason: 'Instructor finalized missing work after the assignment closed',
      requestKey: requiredString(body.requestKey, 128),
    }));
    return NextResponse.json({ grade }, { status: 201 });
  } catch (error) {
    const mapped = instructorGradebookError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
