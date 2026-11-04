import { AnnouncementReader } from '@/components/classes/announcement-reader';
import { classPortalPageData } from '@/lib/class-portal-page';

export default async function ClassAnnouncementsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const { classroom, actorId } = await classPortalPageData('learner', classId, undefined, 'announcements');
  return <main className="px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl space-y-6"><header><p className="mb-2 text-sm text-[var(--muted)]">{classroom.name}</p><h1 className="text-3xl font-bold">Announcements</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Updates published by your class staff. New corrections appear as unread.</p></header><AnnouncementReader classId={classId} actorId={actorId} /></div></main>;
}
