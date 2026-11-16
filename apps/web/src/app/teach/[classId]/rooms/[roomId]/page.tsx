import { notFound, redirect } from 'next/navigation';
import { ClassroomNotFoundError } from '@leetcode-app/database';
import { SharedCodingRoomWorkspace } from '@/components/classes/shared-coding-rooms';
import { readInstructorData } from '@/lib/instructor-access';

export default async function InstructorSharedCodingRoomPage({ params }: { params: Promise<{ classId: string; roomId: string }> }) {
  const { classId, roomId } = await params;
  const access = await readInstructorData(async repository => {
    try { return await repository.getClassDetail(classId); }
    catch (error) { if (error instanceof ClassroomNotFoundError) return null; throw error; }
  });
  if (access.status === 'unauthenticated') redirect('/auth?next=%2Fteach');
  if (access.status === 'forbidden') redirect('/teach/start');
  if (!access.data) notFound();
  return <main><div className="mx-auto max-w-6xl"><SharedCodingRoomWorkspace roomId={roomId} canManage /></div></main>;
}
