import { notFound, redirect } from 'next/navigation';
import { ClassroomNotFoundError } from '@leetcode-app/database';
import { SharedCodingRooms } from '@/components/classes/shared-coding-rooms';
import { readInstructorData } from '@/lib/instructor-access';

export default async function InstructorSharedCodingRoomsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const access = await readInstructorData(async repository => {
    try { return await repository.getClassDetail(classId); }
    catch (error) { if (error instanceof ClassroomNotFoundError) return null; throw error; }
  });
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fteach');
  if (access.status === 'forbidden') redirect('/teach/start');
  if (!access.data) notFound();
  return <main><div className="mx-auto max-w-6xl"><SharedCodingRooms classId={classId} base={`/teach/${classId}`} canCreate /></div></main>;
}
