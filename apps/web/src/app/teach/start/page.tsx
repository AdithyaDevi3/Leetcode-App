import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { enableInstructor } from './actions';

export default async function InstructorStartPage() {
  if (!await getSession()) redirect('/auth?next=%2Fteach%2Fstart&account=instructor');
  return <main><div className="mx-auto max-w-xl rounded-xl border border-[var(--line)] bg-white p-8">
    <p className="eyebrow">Teach with Method</p><h1 className="mt-3">Your instructor workspace</h1>
    <p className="my-6 text-[var(--muted)]">Create your own classes, share join codes, assign practice, and follow your learners’ progress. You can keep using your learner account too.</p>
    <form action={enableInstructor}><button className="button" type="submit">Enable my instructor workspace</button></form>
  </div></main>;
}
