import { NextResponse } from 'next/server';

import { instructorGradebookError, InstructorGradebookValidationError, withInstructorGradebook } from '@/lib/instructor-gradebook';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ classId: string }> }) {
  try {
    if ([...new URL(request.url).searchParams.keys()].length) throw new InstructorGradebookValidationError();
    const { classId } = await params;
    return NextResponse.json(await withInstructorGradebook(repository => repository.readClassGradebook(classId)));
  } catch (error) {
    const mapped = instructorGradebookError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
