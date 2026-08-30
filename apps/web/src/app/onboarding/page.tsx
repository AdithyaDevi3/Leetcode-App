'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { buildLocalLearningPlan, defaultLocalLearnerProfile, readLocalLearnerProfile, writeLocalLearnerProfile, type LocalLearnerProfile } from '@/lib/local-learner';

export default function OnboardingPage() {
  const [profile, setProfile] = useState<LocalLearnerProfile>(defaultLocalLearnerProfile);
  const [message, setMessage] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => { const saved = readLocalLearnerProfile(); if (saved) setProfile(saved); }, 0); return () => window.clearTimeout(timer); }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault(); writeLocalLearnerProfile(profile);
    const plan = buildLocalLearningPlan(profile);
    setMessage(`Saved locally. ${plan.explanation} Start with: ${plan.suggestedTopics.join(', ')}.`);
  };
  return <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900"><form className="mx-auto max-w-xl space-y-6 rounded-xl bg-white p-8 shadow-sm" onSubmit={save}>
    <div><p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Personalize Method</p><h1 className="mt-2 text-3xl font-bold">Build your learning plan</h1></div>
    <label className="block">Goal<select className="mt-1 w-full rounded border p-2" value={profile.goal} onChange={(event) => setProfile({ ...profile, goal: event.target.value as LocalLearnerProfile['goal'] })}><option value="interview">Interview preparation</option><option value="coursework">Coursework</option><option value="career_change">Career change</option><option value="exploration">Exploration</option></select></label>
    <label className="block">Experience<select className="mt-1 w-full rounded border p-2" value={profile.experience} onChange={(event) => setProfile({ ...profile, experience: event.target.value as LocalLearnerProfile['experience'] })}><option value="new">New to algorithms</option><option value="some">Some experience</option><option value="experienced">Experienced</option></select></label>
    <label className="block">Weekly minutes<input className="mt-1 w-full rounded border p-2" min="30" max="1680" type="number" value={profile.weeklyMinutes} onChange={(event) => setProfile({ ...profile, weeklyMinutes: Number(event.target.value) })} /></label>
    <label className="flex gap-2"><input checked={profile.diagnosticOptIn} type="checkbox" onChange={(event) => setProfile({ ...profile, diagnosticOptIn: event.target.checked })} /> Include an optional diagnostic in my plan</label>
    <button className="rounded bg-slate-900 px-4 py-2 font-semibold text-white" type="submit">Save plan</button>
    {message ? <p aria-live="polite" className="text-slate-600">{message}</p> : null}{message ? <Link className="inline-block font-semibold underline" href="/learn">View my learning path</Link> : null}
  </form></main>;
}
