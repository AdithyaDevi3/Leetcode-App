import { NextResponse } from 'next/server';

import { exactRecord, instructorGradebookError, InstructorGradebookOwnerError, InstructorGradebookValidationError, requiredString, withInstructorGradebook } from '@/lib/instructor-gradebook';
import { decodeQuizRequest, QuizInputError } from '@/lib/quiz-assignment-input';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ recipientId: string; gradeRevisionId: string }> }) {
  try {
    const body = exactRecord(await decodeQuizRequest(request, 4_000), ['expectedPublicationSequence', 'requestKey']);
    if (!Number.isSafeInteger(body.expectedPublicationSequence) || (body.expectedPublicationSequence as number) < 0) {
      throw new InstructorGradebookValidationError();
    }
    const { recipientId, gradeRevisionId } = await params;
    const publication = await withInstructorGradebook((repository, instructor) => {
      const expectedAuthor = request.headers.get('x-assessment-author');
      if (expectedAuthor !== null && expectedAuthor !== instructor.id) throw new InstructorGradebookOwnerError();
      return repository.publishGrade({
      recipientId,
      gradeRevisionId,
      expectedPublicationSequence: body.expectedPublicationSequence as number,
      reason: 'Instructor published a saved grade',
      requestKey: requiredString(body.requestKey, 128),
      });
    });
    return NextResponse.json({ publication }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof QuizInputError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
    const mapped = instructorGradebookError(error);
    return NextResponse.json(mapped.body, { status: mapped.status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
