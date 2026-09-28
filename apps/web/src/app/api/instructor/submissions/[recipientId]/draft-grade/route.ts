import { NextResponse } from 'next/server';

import {
  exactRecord,
  instructorGradebookError,
  InstructorGradebookValidationError,
  optionalUuid,
  requiredString,
  withInstructorGradebook,
} from '@/lib/instructor-gradebook';

export const runtime = 'nodejs';

export async function PUT(request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  try {
    const body = exactRecord(await request.json(), [
      'attemptId', 'expectedGradeRevisionId', 'criterionScores', 'learnerFeedback', 'privateNote', 'requestKey',
    ]);
    const attemptId = optionalUuid(body.attemptId);
    if (attemptId === null) throw new InstructorGradebookValidationError();
    const expectedGradeRevisionId = optionalUuid(body.expectedGradeRevisionId);
    const learnerFeedback = typeof body.learnerFeedback === 'string' && body.learnerFeedback.length <= 10_000 ? body.learnerFeedback : null;
    const privateNote = typeof body.privateNote === 'string' && body.privateNote.length <= 10_000 ? body.privateNote : null;
    if (learnerFeedback === null || privateNote === null || !body.criterionScores || typeof body.criterionScores !== 'object' || Array.isArray(body.criterionScores)) {
      throw new InstructorGradebookValidationError();
    }
    const criterionScores = body.criterionScores as Record<string, unknown>;
    if (Object.keys(criterionScores).length > 100 || Object.values(criterionScores).some(value => !Number.isSafeInteger(value))) {
      throw new InstructorGradebookValidationError();
    }
    const { recipientId } = await params;
    const grade = await withInstructorGradebook(repository => repository.appendGrade({
      recipientId,
      attemptId,
      expectedGradeRevisionId,
      kind: 'scored',
      criterionScores: criterionScores as Record<string, number>,
      learnerFeedback,
      privateNote,
      reason: 'Instructor saved a manual grade draft',
      requestKey: requiredString(body.requestKey, 128),
    }));
    return NextResponse.json({ grade }, { status: 201 });
  } catch (error) {
    const mapped = instructorGradebookError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
