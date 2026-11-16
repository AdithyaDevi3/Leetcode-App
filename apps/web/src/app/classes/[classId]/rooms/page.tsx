import { SharedCodingRooms } from '@/components/classes/shared-coding-rooms';
import { classPortalPageData } from '@/lib/class-portal-page';

export default async function LearnerSharedCodingRoomsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const { classroom } = await classPortalPageData('learner', classId);
  return <main className="px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl"><SharedCodingRooms classId={classroom.id} base={`/classes/${classroom.id}`} canCreate /></div></main>;
}
