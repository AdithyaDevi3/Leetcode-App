'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { buildLocalLearningPlan, readLocalLearnerProfile, type LocalLearnerProfile } from '@/lib/local-learner';

export function LocalLearnerDashboard() {
  const [profile, setProfile] = useState<LocalLearnerProfile | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setProfile(readLocalLearnerProfile()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const plan = profile ? buildLocalLearningPlan(profile) : null;

  return <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900"><section className="mx-auto max-w-3xl rounded-xl bg-white p-8 shadow-sm">
    <nav aria-label="Learner navigation" className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link className="font-semibold underline underline-offset-4" href="/">Home</Link><Link className="font-semibold underline underline-offset-4" href="/settings">Settings</Link><Link className="font-semibold underline underline-offset-4" href="/practice">Practice</Link><Link className="font-semibold underline underline-offset-4" href="/history">History</Link><Link className="font-semibold underline underline-offset-4" href="/library">Study library</Link></nav>
    <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Learner dashboard</p><h1 className="mt-2 text-3xl font-bold">Your next learning step</h1>
    {profile === null ? <div className="mt-6 space-y-3"><p>Set your goals first, and we’ll create a focused learning plan on this device.</p><Link className="inline-block rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/onboarding">Start onboarding</Link></div> : null}
    {profile && plan ? <div className="mt-6 space-y-7"><section aria-labelledby="plan-heading"><h2 className="text-xl font-bold" id="plan-heading">This week’s plan</h2><p className="mt-2 text-slate-700">{plan.explanation}</p><p className="mt-2 text-sm text-slate-600">Pace: <span className="font-semibold capitalize">{plan.pace}</span></p><ol className="mt-4 list-decimal space-y-2 pl-5">{plan.suggestedTopics.map((topic) => <li key={topic}>{topic}</li>)}</ol><Link className="mt-5 inline-block rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/practice">Start practice</Link></section><section aria-labelledby="profile-heading" className="border-t pt-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold" id="profile-heading">Profile at a glance</h2><Link className="font-semibold underline underline-offset-4" href="/settings">Edit settings</Link></div><dl className="mt-4 grid gap-4 sm:grid-cols-3"><div><dt className="text-sm text-slate-500">Goal</dt><dd className="font-medium">{profile.goal.replace('_', ' ')}</dd></div><div><dt className="text-sm text-slate-500">Experience</dt><dd className="font-medium">{profile.experience}</dd></div><div><dt className="text-sm text-slate-500">Weekly time</dt><dd className="font-medium">{profile.weeklyMinutes} minutes</dd></div></dl></section></div> : null}
  </section></main>;
}
