'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { defaultLocalLearnerProfile, readLocalLearnerProfile, writeLocalLearnerProfile, type LocalLearnerProfile } from '@/lib/local-learner';

export function LocalLearnerSettings() {
  const [profile, setProfile] = useState<LocalLearnerProfile>(defaultLocalLearnerProfile);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => { setProfile(readLocalLearnerProfile() ?? defaultLocalLearnerProfile); setLoaded(true); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const update = <K extends keyof LocalLearnerProfile>(key: K, value: LocalLearnerProfile[K]) => setProfile((current) => ({ ...current, [key]: value }));
  const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); writeLocalLearnerProfile(profile); setMessage('Settings saved on this device.'); };

  return <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900"><section className="mx-auto max-w-2xl rounded-xl bg-white p-8 shadow-sm">
    <nav aria-label="Learner navigation" className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link className="font-semibold underline underline-offset-4" href="/">Home</Link><Link className="font-semibold underline underline-offset-4" href="/dashboard">Dashboard</Link><Link className="font-semibold underline underline-offset-4" href="/practice">Practice</Link></nav>
    <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Settings</p><h1 className="mt-2 text-3xl font-bold">Your learning preferences</h1>
    {!loaded ? <p className="mt-6" aria-live="polite">Loading your settings…</p> : <form className="mt-7 space-y-6" onSubmit={save}><fieldset className="space-y-4"><legend className="text-lg font-bold">Learning profile</legend>
      <label className="block">Goal<select className="mt-1 w-full rounded border p-2" value={profile.goal} onChange={(event) => update('goal', event.target.value as LocalLearnerProfile['goal'])}><option value="interview">Interview preparation</option><option value="coursework">Coursework</option><option value="career_change">Career change</option><option value="exploration">Exploration</option></select></label>
      <label className="block">Experience<select className="mt-1 w-full rounded border p-2" value={profile.experience} onChange={(event) => update('experience', event.target.value as LocalLearnerProfile['experience'])}><option value="new">New to algorithms</option><option value="some">Some experience</option><option value="experienced">Experienced</option></select></label>
      <label className="block">Preferred language<select className="mt-1 w-full rounded border p-2" value={profile.preferredLanguage} onChange={(event) => update('preferredLanguage', event.target.value as LocalLearnerProfile['preferredLanguage'])}><option value="typescript">TypeScript</option><option value="python">Python</option></select></label>
      <label className="block">Weekly minutes<input className="mt-1 w-full rounded border p-2" min="30" max="1680" required type="number" value={profile.weeklyMinutes} onChange={(event) => update('weeklyMinutes', Number(event.target.value))} /></label>
      <label className="block">Timezone<input className="mt-1 w-full rounded border p-2" required value={profile.timezone} onChange={(event) => update('timezone', event.target.value)} /></label>
    </fieldset><fieldset className="border-t pt-6"><label className="flex items-start gap-3"><input className="mt-1" checked={profile.diagnosticOptIn} type="checkbox" onChange={(event) => update('diagnosticOptIn', event.target.checked)} /><span>Include an optional diagnostic in my plan.</span></label></fieldset><button className="rounded bg-slate-900 px-4 py-2 font-semibold text-white" type="submit">Save settings</button>{message ? <p aria-live="polite" className="text-slate-700">{message}</p> : null}</form>}
  </section></main>;
}
