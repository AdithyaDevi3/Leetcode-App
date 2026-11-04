import { GradebookAccessError } from '@leetcode-app/database';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ClassGradebookTable } from '@/app/teach/[classId]/gradebook/class-gradebook-table';
import { AdminAreaDenied } from '@/components/admin/admin-access-denied';
import { AdminMetric, AdminPageHeader } from '@/components/admin/admin-ui';
import { AssignmentReleaseCenter } from '@/components/grades/assignment-release-center';
import { readClassGradebookData } from '@/lib/class-gradebook-access';
import { gradebookAwaitingCellCount } from '@/lib/gradebook-view';

export default async function AdminClassGradesPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)) notFound();
  const access = await readClassGradebookData('admin', async (repository, actor) => ({ gradebook: await repository.readClassGradebook(classId), actorId: actor.id }))
    .catch(error => { if (error instanceof GradebookAccessError) return { status: 'not_found' as const }; throw error; });
  if (access.status === 'unauthenticated') redirect(`/auth?next=${encodeURIComponent(`/admin/classes/${classId}/grades`)}`);
  if (access.status === 'forbidden') return <AdminAreaDenied />;
  if (access.status !== 'authorized') notFound();
  const { gradebook, actorId } = access.data;
  const included = gradebook.learners.filter(item => item.membership === 'included');
  const ranked = gradebook.rows.filter(item => item.rank !== null).length;

  return <div className="mx-auto max-w-[96rem] space-y-7">
    <Link className="inline-flex text-sm font-bold text-[var(--moss)] underline underline-offset-4" href={`/admin/classes/${classId}`}>← Class workspace</Link>
    <AdminPageHeader eyebrow="Class grades" title={gradebook.classroom.name} description="Review class scores, release saved grades, and choose separately whether to share results with classmates." action={<Link className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 font-bold text-[var(--ink)] no-underline" href={`/admin/classes/${classId}/insights`}>Concept insights</Link>} />
    <section aria-label="Gradebook summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <AdminMetric label="Learners" value={included.length} note="Currently enrolled" />
      <AdminMetric label="Assignments" value={gradebook.assignments.length} note="In this comparison set" />
      <AdminMetric label="Ranked" value={ranked} note="All applicable grades published" />
      <AdminMetric label="Needs attention" value={gradebookAwaitingCellCount(gradebook)} note="Draft, review, or unavailable cells" />
    </section>
    <AssignmentReleaseCenter key={`${actorId}:${classId}:admin`} classId={classId} assignments={gradebook.assignments} actorId={actorId} workspace="admin" />
    <ClassGradebookTable key={`${actorId}:${classId}:admin`} gradebook={gradebook} workspace="admin" />
  </div>;
}
