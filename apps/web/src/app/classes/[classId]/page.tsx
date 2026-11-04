import Link from 'next/link';
import { PostgresClassroomRepository } from '@leetcode-app/database';
import { AssignedTaskCards } from '@/components/assessments/assigned-task-cards';
import { classPortalPageData } from '@/lib/class-portal-page';

const card = 'rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6';
const link = 'inline-flex min-h-11 items-center font-bold text-[var(--moss)] underline underline-offset-4';

export default async function LearnerClassHome({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const { classroom, value } = await classPortalPageData('learner', classId, async (repository, actor, db) => {
    const classrooms = new PostgresClassroomRepository(db);
    const [classes, assignments, announcements] = await Promise.all([
      classrooms.listStudentClasses(actor.id), classrooms.listStudentAssignments(actor.id, classId),
      repository.listAnnouncements(classId, { limit: 3 }),
    ]);
    return { classes, assignments, announcements };
  });
  const { classes, assignments, announcements } = value!;
  const nextWork = assignments.filter(task => !task.completed).slice(0, 3);

  return <main className="px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl space-y-7">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 max-w-3xl"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--moss)]">My class</p><h1 className="break-words text-3xl font-bold sm:text-4xl">{classroom.name}</h1>{classroom.description ? <p className="mt-3 whitespace-pre-wrap break-words leading-7 text-[var(--muted)]">{classroom.description}</p> : null}<p className="mt-3 text-sm text-[var(--muted)]">Instructor: {classroom.instructorName}</p></div>
      {classes.length > 1 ? <details className={`${card} w-full sm:w-auto`}><summary className="cursor-pointer text-sm font-bold">Switch class</summary><ul className="mt-3 space-y-2">{classes.map(item => <li key={item.id}><Link className={link} aria-current={item.id === classId ? 'page' : undefined} href={`/classes/${item.id}`}>{item.name}</Link></li>)}</ul><Link className={link} href="/classes?view=all">Join another class</Link></details> : <Link className={link} href="/classes?view=all">Join another class</Link>}
    </header>
    <section aria-labelledby="class-next-work" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="class-next-work" className="text-xl font-bold">Next assigned work</h2><Link className={link} href={`/classes/${classId}/assignments`}>All assignments ({assignments.length})</Link></div>
      {nextWork.length ? <AssignedTaskCards assignments={nextWork} /> : <p className={`${card} text-sm leading-6 text-[var(--muted)]`}>{assignments.length ? 'You have completed the work shown here. Open assignments to review your submissions.' : 'No assignments yet. New class work will appear here.'}</p>}
    </section>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className={card} aria-labelledby="class-announcements"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="class-announcements" className="text-xl font-bold">Announcements</h2><Link className={link} href={`/classes/${classId}/announcements`}>Read announcements</Link></div>{announcements.items.length ? <ul className="mt-4 divide-y divide-[var(--line)]">{announcements.items.map(item => <li key={item.id} className="py-4"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-bold">{item.title}</h3>{item.unread ? <span className="rounded-full bg-[var(--moss-soft)] px-2 py-1 text-xs font-bold text-[var(--moss)]">Unread</span> : null}</div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--muted)]">{item.excerpt}</p></li>)}</ul> : <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Your class has no published announcements yet.</p>}</section>
      <section className={card} aria-labelledby="class-feedback"><h2 id="class-feedback" className="text-xl font-bold">Grades and feedback</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Review released scores, rubric feedback and grade reviews for this class.</p><div className="mt-3 flex flex-col items-start gap-2"><Link className={link} href={`/classes/${classId}/grades`}>My grades</Link><Link className={link} href={`/classes/${classId}/results`}>Shared class results</Link><Link className={link} href={`/classes/${classId}/people`}>Class people</Link></div></section>
    </div>
  </div></main>;
}
