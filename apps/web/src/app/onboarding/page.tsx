'use client';

import { FormEvent, useEffect, useState } from 'react';

type Profile = { goal: 'interview' | 'coursework' | 'career_change' | 'exploration'; experience: 'new' | 'some' | 'experienced'; preferredLanguage: 'typescript' | 'python'; weeklyMinutes: number; timezone: string; diagnosticOptIn: boolean };
const initialProfile: Profile = { goal: 'interview', experience: 'new', preferredLanguage: 'typescript', weeklyMinutes: 120, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', diagnosticOptIn: false };

export default function OnboardingPage() {
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [message, setMessage] = useState('');
  useEffect(() => { void fetch('/api/learner/profile').then((response) => response.ok ? response.json() : null).then((body) => { if (body?.profile) setProfile((current) => ({ ...current, ...body.profile })); }); }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setMessage('Saving your plan…');
    const response = await fetch('/api/learner/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
    const body = await response.json().catch(() => null) as { plan?: { explanation: string; suggestedTopics: string[] }; error?: string } | null;
    setMessage(response.ok && body?.plan ? `${body.plan.explanation} Start with: ${body.plan.suggestedTopics.join(', ')}.` : body?.error ?? 'Unable to save your profile.');
  };
  return <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900"><form className="mx-auto max-w-xl space-y-6 rounded-xl bg-white p-8 shadow-sm" onSubmit={save}>
    <div><p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Personalize Method</p><h1 className="mt-2 text-3xl font-bold">Build your learning plan</h1></div>
    <label className="block">Goal<select className="mt-1 w-full rounded border p-2" value={profile.goal} onChange={(event) => setProfile({ ...profile, goal: event.target.value as Profile['goal'] })}><option value="interview">Interview preparation</option><option value="coursework">Coursework</option><option value="career_change">Career change</option><option value="exploration">Exploration</option></select></label>
    <label className="block">Experience<select className="mt-1 w-full rounded border p-2" value={profile.experience} onChange={(event) => setProfile({ ...profile, experience: event.target.value as Profile['experience'] })}><option value="new">New to algorithms</option><option value="some">Some experience</option><option value="experienced">Experienced</option></select></label>
    <label className="block">Weekly minutes<input className="mt-1 w-full rounded border p-2" min="30" max="1680" type="number" value={profile.weeklyMinutes} onChange={(event) => setProfile({ ...profile, weeklyMinutes: Number(event.target.value) })} /></label>
    <label className="flex gap-2"><input checked={profile.diagnosticOptIn} type="checkbox" onChange={(event) => setProfile({ ...profile, diagnosticOptIn: event.target.checked })} /> Include an optional diagnostic in my plan</label>
    <button className="rounded bg-slate-900 px-4 py-2 font-semibold text-white" type="submit">Save plan</button>
    {message ? <p aria-live="polite" className="text-slate-600">{message}</p> : null}
  </form></main>;
}
