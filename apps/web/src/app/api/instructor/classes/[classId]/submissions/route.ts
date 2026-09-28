import { NextResponse } from 'next/server';

import { instructorGradebookError, InstructorGradebookValidationError, withInstructorGradebook } from '@/lib/instructor-gradebook';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some(key => !['status', 'limit', 'cursor'].includes(key))) throw new InstructorGradebookValidationError();
    const rawStatus = url.searchParams.get('status');
    if (rawStatus !== null && !['awaiting_review', 'draft', 'published'].includes(rawStatus)) throw new InstructorGradebookValidationError();
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === null ? undefined : Number(rawLimit);
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)) throw new InstructorGradebookValidationError();
    const cursor = url.searchParams.get('cursor') ?? undefined;
    if (cursor !== undefined && (!cursor || cursor.length > 1000)) throw new InstructorGradebookValidationError();
    const { classId } = await params;
    const result = await withInstructorGradebook(repository => repository.listManualReviewInbox({
      classId,
      ...(rawStatus === null ? {} : { status: rawStatus as 'awaiting_review' | 'draft' | 'published' }),
      ...(limit === undefined ? {} : { limit }),
      ...(cursor === undefined ? {} : { cursor }),
    }));
    return NextResponse.json(result);
  } catch (error) {
    const mapped = instructorGradebookError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

