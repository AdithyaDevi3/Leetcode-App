import { SharedCodingRoomWorkspace } from '@/components/classes/shared-coding-rooms';
import { notFound, redirect } from 'next/navigation';
import { getAdministrationAccess } from '@/lib/admin/authorization';
import { getSession } from '@/lib/auth/session';
import { readSharedCodingRoomData } from '@/lib/shared-coding-room-access';

export default async function LearnerSharedCodingRoomPage({ params }: { params: Promise<{ classId: string; roomId: string }> }) {
  const { classId, roomId } = await params;
  const [session, roomAccess, administration] = await Promise.all([getSession(), readSharedCodingRoomData(repository => repository.read(roomId)), getAdministrationAccess().catch(() => ({ status: 'forbidden' as const }))]);
  if (!session || roomAccess.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`/classes/${classId}/rooms/${roomId}`)}`);
  if (roomAccess.status !== 'authorized' || roomAccess.data.classId !== classId) notFound();
  return <main className="px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl"><SharedCodingRoomWorkspace roomId={roomId} actorId={session.user.id} canManage={administration.status === 'authorized'} /></div></main>;
}
