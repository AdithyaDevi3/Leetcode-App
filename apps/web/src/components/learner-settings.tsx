'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useId, useState } from 'react';
import { isLearnerProfile, profileForEditor, profilePayload, type LearnerProfile } from './learner-profile-model';

type SettingsState = 'loading' | 'unauthenticated' | 'onboarding' | 'error' | 'ready';

export function LearnerSettings() {
  const [state, setState] = useState<SettingsState>('loading');
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [message, setMessage] = useState('');
  const notesId = useId();
  useEffect(() => {
    let current = true;
    void fetch('/api/learner/profile').then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!current) return;
        if (response.status === 401) return setState('unauthenticated');
        if (!response.ok) return setState('error');
        if (!body?.profile) return setState('onboarding');
        if (!isLearnerProfile(body.profile)) return setState('error');
        setProfile(profileForEditor(body.profile)); setState('ready');
      }).catch(() => current && setState('error'));
    return () => { current = false; };
  }, []);
  const update = <K extends keyof LearnerProfile>(key: K, value: LearnerProfile[K]) => setProfile((current) => current ? { ...current, [key]: value } : current);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!profile) return;
    setMessage('Saving settings…');
    const response = await fetch('/api/learner/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profilePayload(profile)) });
    const body = await response.json().catch(() => null);
    if (response.ok && isLearnerProfile(body?.profile)) { setProfile(profileForEditor(body.profile)); setMessage('Settings saved.'); return; }
    setMessage(body?.error ?? 'Unable to save settings. Please try again.');
  };
  return <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900"><section className="mx-auto max-w-2xl rounded-xl bg-white p-8 shadow-sm">
    <nav aria-label="Learner navigation" className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link className="font-semibold underline underline-offset-4" href="/">Home</Link><Link className="font-semibold underline underline-offset-4" href="/dashboard">Dashboard</Link><Link className="font-semibold underline underline-offset-4" href="/practice">Practice</Link></nav>
    <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Settings</p><h1 className="mt-2 text-3xl font-bold">Your learning preferences</h1>
    {state === 'loading' ? <p className="mt-6" aria-live="polite">Loading your settings…</p> : null}
    {state === 'unauthenticated' ? <div className="mt-6 space-y-3"><p>Sign in to manage your saved learning preferences.</p><Link className="inline-block rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/api/auth/signin">Sign in</Link></div> : null}
    {state === 'onboarding' ? <div className="mt-6 space-y-3"><p>Complete onboarding before managing learning settings.</p><Link className="inline-block rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/onboarding">Start onboarding</Link></div> : null}
    {state === 'error' ? <div className="mt-6 space-y-3"><p role="alert">We couldn’t load your settings.</p><button className="rounded border border-slate-400 px-4 py-2 font-semibold" type="button" onClick={() => window.location.reload()}>Retry</button></div> : null}
    {state === 'ready' && profile ? <form className="mt-7 space-y-6" onSubmit={save}>
      <fieldset className="space-y-4"><legend className="text-lg font-bold">Learning profile</legend>
        <label className="block">Goal<select className="mt-1 w-full rounded border p-2" value={profile.goal} onChange={(e) => update('goal', e.target.value as LearnerProfile['goal'])}><option value="interview">Interview preparation</option><option value="coursework">Coursework</option><option value="career_change">Career change</option><option value="exploration">Exploration</option></select></label>
        <label className="block">Experience<select className="mt-1 w-full rounded border p-2" value={profile.experience} onChange={(e) => update('experience', e.target.value as LearnerProfile['experience'])}><option value="new">New to algorithms</option><option value="some">Some experience</option><option value="experienced">Experienced</option></select></label>
        <label className="block">Preferred language<select className="mt-1 w-full rounded border p-2" value={profile.preferredLanguage} onChange={(e) => update('preferredLanguage', e.target.value as LearnerProfile['preferredLanguage'])}><option value="typescript">TypeScript</option><option value="python">Python</option></select></label>
        <label className="block">Weekly minutes<input className="mt-1 w-full rounded border p-2" min="30" max="1680" required type="number" value={profile.weeklyMinutes} onChange={(e) => update('weeklyMinutes', Number(e.target.value))} /></label>
        <label className="block">Timezone<input className="mt-1 w-full rounded border p-2" required value={profile.timezone} onChange={(e) => update('timezone', e.target.value)} /></label>
        <label className="block">Target date <span className="text-sm text-slate-500">(optional)</span><input className="mt-1 w-full rounded border p-2" type="date" value={profile.targetDate} onChange={(e) => update('targetDate', e.target.value)} /></label>
      </fieldset>
      <fieldset className="space-y-4 border-t pt-6"><legend className="text-lg font-bold">Learning controls</legend><label className="flex items-start gap-3"><input className="mt-1" checked={profile.diagnosticOptIn} type="checkbox" onChange={(e) => update('diagnosticOptIn', e.target.checked)} /><span>Include an optional diagnostic in my plan.</span></label><label className="flex items-start gap-3"><input className="mt-1" checked={profile.personalizationOptOut ?? false} type="checkbox" onChange={(e) => update('personalizationOptOut', e.target.checked)} /><span><span className="font-medium">Turn off personalization</span><br /><span className="text-sm text-slate-600">Keep your profile, but opt out of personalized learning recommendations.</span></span></label><label className="block" htmlFor={notesId}>Accessibility notes <span className="text-sm text-slate-500">(optional)</span></label><textarea className="w-full rounded border p-2" id={notesId} rows={3} value={profile.accessibilityNotes} onChange={(e) => update('accessibilityNotes', e.target.value)} /></fieldset>
      <button className="rounded bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-60" type="submit">Save settings</button>{message ? <p aria-live="polite" className="text-slate-700">{message}</p> : null}
    </form> : null}
  </section></main>;
}
