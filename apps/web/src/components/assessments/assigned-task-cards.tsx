import type { StudentAssignment } from '@leetcode-app/database';
import Link from 'next/link';
import { quizDate } from './quiz-ui';

const dueDate = (task: StudentAssignment) => task.assignmentKind === 'quiz' && task.dueAt
  ? quizDate(task.dueAt)
  : task.dueOn ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${task.dueOn}T00:00:00Z`)) : 'No due date';
const quizLabels = { not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted · awaiting grade release', published: 'Grade released' };

export function AssignedTaskCards({ assignments }: { assignments: readonly StudentAssignment[] }) {
  return <div className="grid gap-3">{assignments.map(task => {
    const quiz = task.assignmentKind === 'quiz';
    const href = quiz ? `/classes/${task.classId}/assignments/${task.recipientId}` : `/practice?problem=${encodeURIComponent(task.activitySlug)}${task.recipientId ? `&assignment=${encodeURIComponent(task.recipientId)}` : ''}`;
    return <article className="flex flex-col gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:flex-row sm:items-center sm:justify-between" key={task.id}>
      <div className="min-w-0"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--moss)]">{task.className} · {dueDate(task)}</p><h3 className="mb-1 text-lg font-bold">{task.title}</h3>{task.instructions ? <p className="mb-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--muted)]">{task.instructions}</p> : null}<span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${task.completed ? 'bg-[var(--moss-soft)] text-[var(--moss)]' : 'bg-[var(--sky)] text-slate-800'}`}>{quiz ? quizLabels[task.quizStatus ?? 'not_started'] : task.completed ? 'Completed' : 'To do'}</span></div>
      <Link className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-[var(--moss)] px-4 font-bold text-[var(--moss)] no-underline hover:bg-[var(--moss-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" href={href}>{quiz ? task.completed ? 'Review submission' : 'Open quiz' : task.completed ? 'Review activity' : 'Start task'} →</Link>
    </article>;
  })}</div>;
}
