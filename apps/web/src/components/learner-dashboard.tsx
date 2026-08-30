'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { experienceLabel, goalLabel, isLearnerProfile, type LearnerPlan, type LearnerProfile } from './learner-profile-model';

type DashboardState = 'loading' | 'unauthenticated' | 'onboarding' | 'error' | 'ready';

export function LearnerDashboard() {
  const [state, setState] = useState<DashboardState>('loading');
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [plan, setPlan] = useState<LearnerPlan | null>(null);

  useEffect(() => {
    let current = true;
    void fetch('/api/learner/plan').then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!current) return;
        if (response.status === 401) return setState('unauthenticated');
        if (response.status === 404) return setState('onboarding');
        if (!response.ok || !isLearnerProfile(body?.profile) || !body?.plan) return setState('error');
        setProfile(body.profile); setPlan(body.plan as LearnerPlan); setState('ready');
      }).catch(() => current && setState('error'));
    return () => { current = false; };
  }, []);

  return <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900"><section className="mx-auto max-w-3xl rounded-xl bg-white p-8 shadow-sm">
    <nav aria-label="Learner navigation" className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link className="font-semibold underline underline-offset-4" href="/">Home</Link><Link className="font-semibold underline underline-offset-4" href="/settings">Settings</Link><Link className="font-semibold underline underline-offset-4" href="/practice">Practice</Link></nav>
    <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Learner dashboard</p><h1 className="mt-2 text-3xl font-bold">Your next learning step</h1>
    {state === 'loading' ? <p className="mt-6 text-slate-700" aria-live="polite">Loading your learning plan…</p> : null}
    {state === 'unauthenticated' ? <div className="mt-6 space-y-3"><p>You need to sign in to view your saved plan.</p><Link className="inline-block rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/api/auth/signin">Sign in</Link></div> : null}
    {state === 'onboarding' ? <div className="mt-6 space-y-3"><p>Set your goals first, and we’ll create a focused learning plan.</p><Link className="inline-block rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/onboarding">Start onboarding</Link></div> : null}
    {state === 'error' ? <div className="mt-6 space-y-3"><p role="alert">We couldn’t load your learning plan. Please try again.</p><button className="rounded border border-slate-400 px-4 py-2 font-semibold" type="button" onClick={() => window.location.reload()}>Retry</button></div> : null}
    {state === 'ready' && profile && plan ? <div className="mt-6 space-y-7"><section aria-labelledby="plan-heading"><h2 className="text-xl font-bold" id="plan-heading">This week’s plan</h2><p className="mt-2 text-slate-700">{plan.explanation}</p><p className="mt-2 text-sm text-slate-600">Pace: <span className="font-semibold capitalize">{plan.pace}</span></p><ol className="mt-4 list-decimal space-y-2 pl-5">{plan.suggestedTopics.map((topic) => <li key={topic}>{topic}</li>)}</ol><Link className="mt-5 inline-block rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/practice">Start practice</Link></section><section aria-labelledby="profile-heading" className="border-t pt-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold" id="profile-heading">Profile at a glance</h2><Link className="font-semibold underline underline-offset-4" href="/settings">Edit settings</Link></div><dl className="mt-4 grid gap-4 sm:grid-cols-3"><div><dt className="text-sm text-slate-500">Goal</dt><dd className="font-medium">{goalLabel[profile.goal]}</dd></div><div><dt className="text-sm text-slate-500">Experience</dt><dd className="font-medium">{experienceLabel[profile.experience]}</dd></div><div><dt className="text-sm text-slate-500">Weekly time</dt><dd className="font-medium">{profile.weeklyMinutes} minutes</dd></div></dl></section></div> : null}
  </section></main>;
}
