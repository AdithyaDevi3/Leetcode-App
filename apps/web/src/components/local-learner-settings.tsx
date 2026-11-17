'use client';

import { FormEvent, useEffect, useState } from 'react';
import { SiteNavigation } from '@/components/site-navigation';
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
  const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setMessage(writeLocalLearnerProfile(profile) ? 'Settings saved on this device. Your recommendations are updated.' : 'This browser blocked local storage. Update its site-data settings and try again.'); };

  return <main className="min-h-screen bg-[var(--paper)] px-4 py-6 text-[var(--ink)] sm:px-6 sm:py-8"><div className="mx-auto max-w-[90rem]"><SiteNavigation currentPath="/settings" /><section className="mt-6 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]"><aside className="h-fit rounded-xl border border-[var(--line)] bg-white p-3 lg:sticky lg:top-6"><p className="px-3 py-2 text-sm font-bold text-[var(--muted)]">Settings</p><a className="block rounded-md px-3 py-2 text-sm font-bold text-[var(--moss)] hover:bg-[var(--moss-soft)]" href="#local-profile">Learning profile</a><a className="block rounded-md px-3 py-2 text-sm font-bold text-[var(--moss)] hover:bg-[var(--moss-soft)]" href="#local-controls">Learning controls</a></aside><div className="min-w-0"><header className="rounded-xl border border-[var(--line)] bg-white p-6"><p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Settings</p><h1 className="mt-2 text-3xl font-bold">Your learning preferences</h1><p className="mt-2 text-sm text-[var(--muted)]">These settings are saved on this device. Sign in to save settings to your account.</p></header>
    {!loaded ? <p className="mt-6 rounded-xl border border-[var(--line)] bg-white p-6" aria-live="polite">Loading your settings…</p> : <form className="mt-6 space-y-6" onSubmit={save}><fieldset className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-6" id="local-profile"><legend className="text-lg font-bold">Learning profile</legend>
      <label className="block">Goal<select className="mt-1 w-full rounded border p-2" value={profile.goal} onChange={(event) => update('goal', event.target.value as LocalLearnerProfile['goal'])}><option value="interview">Interview preparation</option><option value="coursework">Coursework</option><option value="career_change">Career change</option><option value="exploration">Exploration</option></select></label>
      <label className="block">Experience<select className="mt-1 w-full rounded border p-2" value={profile.experience} onChange={(event) => update('experience', event.target.value as LocalLearnerProfile['experience'])}><option value="new">New to algorithms</option><option value="some">Some experience</option><option value="experienced">Experienced</option></select></label>
      <label className="block">Preferred language<select className="mt-1 w-full rounded border p-2" value={profile.preferredLanguage} onChange={(event) => update('preferredLanguage', event.target.value as LocalLearnerProfile['preferredLanguage'])}><option value="python">Python 3</option><option value="cpp">C++20</option><option value="typescript">TypeScript</option><option value="java">Java</option></select></label>
      <label className="block">Weekly minutes<input className="mt-1 w-full rounded border p-2" min="30" max="1680" required type="number" value={profile.weeklyMinutes} onChange={(event) => update('weeklyMinutes', Number(event.target.value))} /></label>
      <label className="block">Timezone<input className="mt-1 w-full rounded border p-2" required value={profile.timezone} onChange={(event) => update('timezone', event.target.value)} /></label>
    </fieldset><fieldset className="space-y-4 rounded-xl border border-[var(--line)] bg-white p-6" id="local-controls"><legend className="text-lg font-bold">Learning controls</legend><label className="flex items-start gap-3"><input className="mt-1" checked={profile.diagnosticOptIn} type="checkbox" onChange={(event) => update('diagnosticOptIn', event.target.checked)} /><span>Include an optional diagnostic in my plan.</span></label><label className="flex items-start gap-3"><input className="mt-1" checked={profile.personalizationOptOut} type="checkbox" onChange={(event) => update('personalizationOptOut', event.target.checked)} /><span><span className="font-medium">Turn off personalized recommendations</span><br /><span className="text-sm text-[var(--muted)]">Use the standard curriculum order while keeping your profile on this device.</span></span></label></fieldset><div className="flex flex-wrap items-center gap-4"><button className="min-h-11 rounded-md bg-[var(--moss)] px-4 py-2 font-semibold text-white" type="submit">Save settings</button>{message ? <p aria-live="polite" className="text-[var(--ink)]">{message}</p> : null}</div></form>}
  </div></section></div></main>;
}
