import { SharedCodingRoomWorkspace } from '@/components/classes/shared-coding-rooms';
import { classPortalPageData } from '@/lib/class-portal-page';

export default async function LearnerSharedCodingRoomPage({ params }: { params: Promise<{ classId: string; roomId: string }> }) {
  const { classId, roomId } = await params; const { actorId } = await classPortalPageData('learner', classId);
  return <main className="px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl"><SharedCodingRoomWorkspace roomId={roomId} actorId={actorId} /></div></main>;
}
