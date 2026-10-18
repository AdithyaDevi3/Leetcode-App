import type { ClassGradebook } from '@leetcode-app/database';
import { GradebookAccessError } from '@leetcode-app/database';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AdminMetric, AdminPageHeader } from '@/components/admin/admin-ui';
import { ClassGradebookTable } from '@/app/teach/[classId]/gradebook/class-gradebook-table';
import { withInstructorGradebook } from '@/lib/instructor-gradebook';
import { gradebookAwaitingCellCount } from '@/lib/gradebook-view';

export default async function ClassGradebookPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId)) notFound();
  let gradebook: ClassGradebook;
  try { gradebook = await withInstructorGradebook(repository => repository.readClassGradebook(classId)); }
  catch (error) {
    if (error instanceof GradebookAccessError) notFound();
    if (error instanceof Error && 'status' in error && error.status === 401) redirect(`/auth?next=${encodeURIComponent(`/teach/${classId}/gradebook`)}`);
    throw error;
  }
  const included = gradebook.learners.filter(item => item.membership === 'included');
  const ranked = gradebook.rows.filter(item => item.rank !== null).length;
  const awaiting = gradebookAwaitingCellCount(gradebook);

  return <main><div className="mx-auto max-w-[96rem] space-y-7">
    <Link className="inline-flex text-sm font-bold text-[var(--moss)] underline underline-offset-4" href={`/teach/${classId}`}>← Class workspace</Link>
    <AdminPageHeader eyebrow="Class gradebook" title={gradebook.classroom.name} description="Published grades determine totals and rank. Draft or incomplete work stays clearly marked." action={<div className="flex flex-wrap gap-2"><Link className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 font-bold text-[var(--ink)] no-underline" href={`/teach/${classId}/submissions`}>Review submissions</Link><Link className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 font-bold text-[var(--ink)] no-underline" href={`/teach/${classId}/disputes`}>Grade reviews</Link></div>} />
    <section aria-label="Gradebook summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <AdminMetric label="Learners" value={included.length} note="Currently enrolled" />
      <AdminMetric label="Assignments" value={gradebook.assignments.length} note="In this comparison set" />
      <AdminMetric label="Ranked" value={ranked} note="All applicable grades published" />
      <AdminMetric label="Needs attention" value={awaiting} note="Draft, review, or unavailable cells" />
    </section>
    <ClassGradebookTable gradebook={gradebook} />
  </div></main>;
}
