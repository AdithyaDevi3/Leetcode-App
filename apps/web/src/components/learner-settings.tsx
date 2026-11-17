'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { isLearnerProfile, profileForEditor, profilePayload, type LearnerProfile } from './learner-profile-model';

type SettingsState = 'loading' | 'unauthenticated' | 'onboarding' | 'error' | 'ready' | 'changed';

export function LearnerSettings({ expectedOwner }: { expectedOwner: string }) {
  const [state, setState] = useState<SettingsState>('loading');
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(false);
  const saving = useRef(false);
  const notesId = useId();
  useEffect(() => {
    let current = true;
    alive.current = true;
    const controller = new AbortController();
    void fetch('/api/learner/profile', { cache: 'no-store', headers: { 'x-learning-owner': expectedOwner },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) }).then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!current) return;
        if (response.status === 401) return setState('unauthenticated');
        if (response.status === 409 || (response.ok && body?.learnerId !== expectedOwner)) return setState('changed');
        if (!response.ok) return setState('error');
        if (!body?.profile) return setState('onboarding');
        if (!isLearnerProfile(body.profile)) return setState('error');
        setProfile(profileForEditor(body.profile)); setState('ready');
      }).catch(() => current && setState('error'));
    return () => { current = false; alive.current = false; controller.abort(); };
  }, [expectedOwner]);
  const update = <K extends keyof LearnerProfile>(key: K, value: LearnerProfile[K]) => setProfile((current) => current ? { ...current, [key]: value } : current);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!profile || saving.current || state !== 'ready') return;
    saving.current = true; setBusy(true);
    setMessage('Saving settings…');
    try {
      const response = await fetch('/api/learner/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-learning-owner': expectedOwner },
        body: JSON.stringify(profilePayload(profile)), signal: AbortSignal.timeout(15_000) });
      const body = await response.json().catch(() => null);
      if (!alive.current) return;
      if (response.status === 401 || response.status === 409 || (response.ok && body?.learnerId !== expectedOwner)) { setProfile(null); setState('changed'); return; }
      if (response.ok && isLearnerProfile(body?.profile)) { setProfile(profileForEditor(body.profile)); setMessage('Settings saved.'); return; }
      setMessage(typeof body?.error === 'string' ? body.error : 'Unable to save settings. Please try again.');
    } catch {
      if (alive.current) setMessage('Unable to confirm your saved settings. Please retry.');
    } finally { saving.current = false; if (alive.current) setBusy(false); }
  };
  const field = 'mt-1 min-h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2';
  return <main className="min-h-screen bg-[var(--paper)] px-4 py-6 text-[var(--ink)] sm:px-6 sm:py-8"><div className="mx-auto max-w-[90rem]">
    <header className="rounded-xl border border-[var(--line)] bg-white p-5 sm:p-7"><nav aria-label="Learner navigation" className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link className="font-semibold text-[var(--moss)] underline underline-offset-4" href="/dashboard">Dashboard</Link><Link className="font-semibold text-[var(--moss)] underline underline-offset-4" href="/practice">Practice</Link><Link className="font-semibold text-[var(--moss)] underline underline-offset-4" href="/classes">Groups and rooms</Link></nav><p className="mt-7 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Settings</p><h1 className="mt-2 text-3xl font-bold">Your account and learning plan</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Manage the preferences that shape your practice plan. Account actions stay at the top of this page.</p></header>
    <div className="mt-6 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]"><aside className="h-fit rounded-xl border border-[var(--line)] bg-white p-3 lg:sticky lg:top-6"><nav aria-label="Settings sections" className="grid gap-1 text-sm"><a className="rounded-md px-3 py-2 font-bold text-[var(--moss)] hover:bg-[var(--moss-soft)]" href="#learning-profile">Learning profile</a><a className="rounded-md px-3 py-2 font-bold text-[var(--moss)] hover:bg-[var(--moss-soft)]" href="#learning-controls">Learning controls</a><a className="rounded-md px-3 py-2 font-bold text-[var(--moss)] hover:bg-[var(--moss-soft)]" href="#workspace-access">Workspace access</a></nav></aside><section className="min-w-0 space-y-6">
      {state === 'loading' ? <section className="rounded-xl border border-[var(--line)] bg-white p-6" aria-live="polite">Loading your settings…</section> : null}
      {state === 'unauthenticated' ? <section className="rounded-xl border border-[var(--line)] bg-white p-6"><p>Sign in to manage your saved learning preferences.</p><Link className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[var(--moss)] px-4 font-bold text-white" href="/auth">Sign in</Link></section> : null}
      {state === 'onboarding' ? <section className="rounded-xl border border-[var(--line)] bg-white p-6"><p>Complete onboarding before managing learning settings.</p><Link className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[var(--moss)] px-4 font-bold text-white" href="/onboarding">Start onboarding</Link></section> : null}
      {state === 'error' ? <section className="rounded-xl border border-[var(--line)] bg-white p-6"><p role="alert">We could not load your settings.</p><button className="mt-4 min-h-11 rounded-md border border-[var(--line)] px-4 font-bold" type="button" onClick={() => window.location.reload()}>Retry</button></section> : null}
      {state === 'changed' ? <section className="rounded-xl border border-[var(--line)] bg-white p-6"><p role="alert">Your signed-in account changed. Reload settings before editing its preferences.</p><a className="mt-4 inline-flex min-h-11 items-center rounded-md border border-[var(--line)] px-4 font-bold" href="/settings">Reload settings</a></section> : null}
      {state === 'ready' && profile ? <form className="space-y-6" onSubmit={save}>
        <fieldset className="rounded-xl border border-[var(--line)] bg-white p-5 sm:p-6" disabled={busy} id="learning-profile"><legend className="px-1 text-xl font-bold">Learning profile</legend><p className="mt-1 text-sm text-[var(--muted)]">Set your goal, experience, and preferred coding language.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="block font-medium">Goal<select className={field} value={profile.goal} onChange={(e) => update('goal', e.target.value as LearnerProfile['goal'])}><option value="interview">Interview preparation</option><option value="coursework">Coursework</option><option value="career_change">Career change</option><option value="exploration">Exploration</option></select></label><label className="block font-medium">Experience<select className={field} value={profile.experience} onChange={(e) => update('experience', e.target.value as LearnerProfile['experience'])}><option value="new">New to algorithms</option><option value="some">Some experience</option><option value="experienced">Experienced</option></select></label><label className="block font-medium">Preferred language<select className={field} value={profile.preferredLanguage} onChange={(e) => update('preferredLanguage', e.target.value as LearnerProfile['preferredLanguage'])}><option value="python">Python 3</option><option value="cpp">C++20</option><option value="typescript">TypeScript</option><option value="java">Java</option></select></label><label className="block font-medium">Weekly minutes<input className={field} min="30" max="1680" required type="number" value={profile.weeklyMinutes} onChange={(e) => update('weeklyMinutes', Number(e.target.value))} /></label><label className="block font-medium">Timezone<input className={field} required value={profile.timezone} onChange={(e) => update('timezone', e.target.value)} /></label><label className="block font-medium">Target date <span className="text-sm font-normal text-[var(--muted)]">(optional)</span><input className={field} type="date" value={profile.targetDate} onChange={(e) => update('targetDate', e.target.value)} /></label></div></fieldset>
        <fieldset className="rounded-xl border border-[var(--line)] bg-white p-5 sm:p-6" disabled={busy} id="learning-controls"><legend className="px-1 text-xl font-bold">Learning controls</legend><p className="mt-1 text-sm text-[var(--muted)]">Control diagnostics and personalized recommendations.</p><div className="mt-5 space-y-5"><label className="flex items-start gap-3"><input className="mt-1" checked={profile.diagnosticOptIn} type="checkbox" onChange={(e) => update('diagnosticOptIn', e.target.checked)} /><span><span className="font-medium">Use the optional diagnostic</span><br /><span className="text-sm text-[var(--muted)]">Include it when Method builds your learning plan.</span></span></label><label className="flex items-start gap-3"><input className="mt-1" checked={profile.personalizationOptOut ?? false} type="checkbox" onChange={(e) => update('personalizationOptOut', e.target.checked)} /><span><span className="font-medium">Turn off personalization</span><br /><span className="text-sm text-[var(--muted)]">Use the standard curriculum order while keeping your profile.</span></span></label><label className="block font-medium" htmlFor={notesId}>Accessibility notes <span className="text-sm font-normal text-[var(--muted)]">(optional)</span><textarea className={`${field} min-h-28`} id={notesId} rows={3} value={profile.accessibilityNotes} onChange={(e) => update('accessibilityNotes', e.target.value)} /></label></div></fieldset>
        <section className="rounded-xl border border-[var(--line)] bg-white p-5 sm:p-6" id="workspace-access"><h2 className="text-xl font-bold">Workspace access</h2><p className="mt-1 text-sm text-[var(--muted)]">Join a group to access its classes and shared coding rooms.</p><div className="mt-4 flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] px-4 font-bold text-[var(--moss)]" href="/classes">Open groups and rooms</Link><Link className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] px-4 font-bold text-[var(--moss)]" href="/library">Open study library</Link></div></section>
        <div className="flex flex-wrap items-center gap-4"><button className="min-h-11 rounded-md bg-[var(--moss)] px-4 font-bold text-white disabled:opacity-60" disabled={busy} type="submit">{busy ? 'Saving settings…' : 'Save settings'}</button>{message ? <p aria-live="polite" className="text-sm text-[var(--ink)]">{message}</p> : null}</div>
      </form> : null}
    </section></div>
  </div></main>;
}
