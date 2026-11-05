import { AnnouncementManager } from '@/components/classes/announcement-manager';
import { classPortalPageData } from '@/lib/class-portal-page';

export default async function TeachingAnnouncementsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const { classroom, actorId } = await classPortalPageData('teach', classId, undefined, 'announcements');
  return <main><div className="mx-auto max-w-6xl space-y-6"><header><p className="mb-2 text-sm text-[var(--muted)]">{classroom.name}</p><h1 className="text-3xl font-bold">Class announcements</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Save a private draft, review it, then publish the saved version to this class.</p></header><AnnouncementManager classId={classId} actorId={actorId} workspace="teach" /></div></main>;
}
