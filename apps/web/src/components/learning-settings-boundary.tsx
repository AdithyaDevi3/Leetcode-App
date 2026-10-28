'use client';

import { useEffect, useRef, useState } from 'react';
import { LearnerSettings } from './learner-settings';
import { LocalLearnerSettings } from './local-learner-settings';

/** Retain the original form owner and edits through same-account focus checks. */
export function LearningSettingsBoundary() {
  const [owner, setOwner] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'changed'>('loading');
  const original = useRef<string | null | undefined>(undefined);
  const checkAgain = useRef<(() => void) | null>(null);

  useEffect(() => {
    let alive = true;
    let active: AbortController | null = null;
    const check = async () => {
      active?.abort();
      setStatus(previous => previous === 'changed' ? previous : 'loading');
      const controller = new AbortController(); active = controller;
      try {
        const response = await fetch('/api/viewer', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        const body = await response.json().catch(() => null);
        if (!alive || controller.signal.aborted) return;
        if (!response.ok || !body || !Object.hasOwn(body, 'viewer') || (body.viewer !== null && (typeof body.viewer?.id !== 'string' || !body.viewer.id))) throw new Error('Account unavailable');
        const current: string | null = body.viewer?.id ?? null;
        if (original.current === undefined) { original.current = current; setOwner(current); }
        if (current !== original.current) setStatus('changed');
        else setStatus(previous => previous === 'changed' ? previous : 'ready');
      } catch {
        if (alive && !controller.signal.aborted) setStatus(previous => previous === 'changed' ? previous : 'error');
      }
    };
    checkAgain.current = () => void check();
    const focus = () => void check();
    const visible = () => { if (document.visibilityState === 'visible') void check(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visible);
    void check();
    return () => { alive = false; active?.abort(); checkAgain.current = null; window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visible); };
  }, []);

  return <>
    <div hidden={status !== 'ready'}>{owner === undefined || status === 'changed' ? null : owner === null ? <LocalLearnerSettings /> : <LearnerSettings key={owner} expectedOwner={owner} />}</div>
    {status !== 'ready' ? <main className="min-h-screen bg-[var(--paper)] px-6 py-12 text-[var(--ink)]"><section className="mx-auto max-w-2xl space-y-4 rounded-xl bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold">Your learning preferences</h1>
      {status === 'loading' ? <p role="status">Checking your signed-in account…</p> : status === 'changed' ? <><p role="alert">Your signed-in account changed. Reload settings before editing its preferences.</p><a className="inline-block rounded border px-4 py-2 font-semibold" href="/settings">Reload settings</a></> : <><p role="alert">We could not verify your signed-in account. Retry to load the correct settings.</p><button className="rounded border px-4 py-2 font-semibold" type="button" onClick={() => checkAgain.current?.()}>Retry account check</button></>}
    </section></main> : null}
  </>;
}
