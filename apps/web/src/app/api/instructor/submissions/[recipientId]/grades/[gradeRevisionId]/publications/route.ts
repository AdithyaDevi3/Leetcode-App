import { NextResponse } from 'next/server';

import { exactRecord, instructorGradebookError, InstructorGradebookValidationError, requiredString, withInstructorGradebook } from '@/lib/instructor-gradebook';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ recipientId: string; gradeRevisionId: string }> }) {
  try {
    const body = exactRecord(await request.json(), ['expectedPublicationSequence', 'requestKey']);
    if (!Number.isSafeInteger(body.expectedPublicationSequence) || (body.expectedPublicationSequence as number) < 0) {
      throw new InstructorGradebookValidationError();
    }
    const { recipientId, gradeRevisionId } = await params;
    const publication = await withInstructorGradebook(repository => repository.publishGrade({
      recipientId,
      gradeRevisionId,
      expectedPublicationSequence: body.expectedPublicationSequence as number,
      reason: 'Instructor published a manual grade',
      requestKey: requiredString(body.requestKey, 128),
    }));
    return NextResponse.json({ publication }, { status: 201 });
  } catch (error) {
    const mapped = instructorGradebookError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
