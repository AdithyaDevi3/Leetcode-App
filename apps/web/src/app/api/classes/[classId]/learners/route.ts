import { NextResponse } from 'next/server';
import { ClassroomNotFoundError } from '@leetcode-app/database';
import { readInstructorData } from '@/lib/instructor-access';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };

export async function GET(_request: Request, { params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const access = await readInstructorData(async repository => {
    try { return await repository.getClassDetail(classId); }
    catch (error) { if (error instanceof ClassroomNotFoundError) return null; throw error; }
  });
  if (access.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in to view class members.' }, { status: 401, headers });
  if (access.status === 'forbidden') return NextResponse.json({ error: 'You cannot view class members.' }, { status: 403, headers });
  if (!access.data) return NextResponse.json({ error: 'The class is unavailable.' }, { status: 404, headers });
  return NextResponse.json({ learners: access.data.learners.map(learner => ({ id: learner.id, displayName: learner.displayName })) }, { headers });
}
