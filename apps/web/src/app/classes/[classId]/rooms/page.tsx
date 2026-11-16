import { SharedCodingRooms } from '@/components/classes/shared-coding-rooms';
import { notFound, redirect } from 'next/navigation';
import { readSharedCodingRoomData } from '@/lib/shared-coding-room-access';

export default async function LearnerSharedCodingRoomsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const access = await readSharedCodingRoomData(repository => repository.list(classId));
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`/classes/${classId}/rooms`)}`);
  if (access.status !== 'authorized') notFound();
  return <main className="px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl"><SharedCodingRooms classId={classId} base={`/classes/${classId}`} canCreate /></div></main>;
}
