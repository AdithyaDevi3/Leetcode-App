import { NextResponse } from 'next/server';

import { instructorGradebookError, withInstructorGradebook } from '@/lib/instructor-gradebook';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  try {
    const { recipientId } = await params;
    const submission = await withInstructorGradebook(repository => repository.readRecipient(recipientId));
    return NextResponse.json({ submission });
  } catch (error) {
    const mapped = instructorGradebookError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

