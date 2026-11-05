import { PostgresClassroomRepository } from '@leetcode-app/database';
import { AssignedTaskCards } from '@/components/assessments/assigned-task-cards';
import { classPortalPageData } from '@/lib/class-portal-page';

export default async function ClassAssignmentsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const { classroom, value: assignments } = await classPortalPageData('learner', classId,
    (_repository, actor, db) => new PostgresClassroomRepository(db).listStudentAssignments(actor.id, classId), 'assignments');
  return <main className="px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl space-y-6"><header><p className="mb-2 text-sm text-[var(--muted)]">{classroom.name}</p><h1 className="text-3xl font-bold">Assignments</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Open class work, resume saved answers or review a submitted response.</p></header>{assignments?.length ? <AssignedTaskCards assignments={assignments} /> : <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--muted)]">No assignments yet.</p>}</div></main>;
}
