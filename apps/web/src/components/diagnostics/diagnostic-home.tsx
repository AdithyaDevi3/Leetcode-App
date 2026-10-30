'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { DiagnosticView } from '@leetcode-app/database';
import { SiteNavigation } from '@/components/site-navigation';
import { quizButton, quizSecondary } from '@/components/assessments/quiz-ui';
import { validDiagnostic } from '@/lib/diagnostic-client';
import { DiagnosticWorkspace } from './diagnostic-workspace';

export function DiagnosticHome({ learnerId, diagnosticId }: { learnerId: string; diagnosticId?: string }) {
  const [diagnostic, setDiagnostic] = useState<DiagnosticView | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const workspaceActive = useRef(false);
  async function load(start = false) {
    if (inFlight.current || changed) return;
    inFlight.current = true; setBusy(true); setMessage(null);
    const currentGeneration = ++generation.current;
    try {
      const response = await fetch(`/api/learner/diagnostics${!start && diagnosticId ? `/${diagnosticId}` : ''}`, {
        method: start ? 'POST' : 'GET', cache: 'no-store', headers: { 'x-diagnostic-owner': learnerId, ...(start ? { 'content-type': 'application/json' } : {}) },
        ...(start ? { body: '{}' } : {}), signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json();
      if (!alive.current || generation.current !== currentGeneration) return;
      if (body.code === 'owner_changed' || response.status === 401 || (body.learnerId && body.learnerId !== learnerId)) { setChanged(true); throw new Error('Your account changed. Reopen the skills check in the intended account.'); }
      if (!response.ok) throw new Error(body.error ?? 'Could not load your skills check. Try again.');
      if (body.learnerId !== learnerId) throw new Error('The response could not be verified. Try again.');
      const view = start || diagnosticId ? body.diagnostic : body.current;
      if (view !== null && !validDiagnostic(view)) throw new Error('The saved skills check could not be verified. Try again.');
      if (diagnosticId && view?.id !== diagnosticId) throw new Error('The saved skills check could not be verified. Try again.');
      workspaceActive.current = Boolean(view); setDiagnostic(view); setReady(true);
    } catch (cause) { if (alive.current && generation.current === currentGeneration) setMessage(cause instanceof Error ? cause.message : 'Skills check unavailable.'); }
    finally { if (generation.current === currentGeneration) { inFlight.current = false; if (alive.current) setBusy(false); } }
  }
  useEffect(() => {
    alive.current = true;
    const timer = window.setTimeout(() => { void load(); }, 0);
    const hide = () => { if (!workspaceActive.current) { generation.current += 1; inFlight.current = false; } };
    const focus = () => { if (!workspaceActive.current) void load(); };
    window.addEventListener('blur', hide); window.addEventListener('focus', focus);
    return () => { alive.current = false; generation.current += 1; window.clearTimeout(timer); window.removeEventListener('blur', hide); window.removeEventListener('focus', focus); };
    // The parent keys this boundary by verified account and requested diagnostic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerId, diagnosticId]);
  if (diagnostic && !changed) return <DiagnosticWorkspace key={`${learnerId}:${diagnostic.id}`} learnerId={learnerId} initial={diagnostic} />;
  return <main className="min-h-screen px-5 py-6 sm:px-8"><div className="mx-auto max-w-3xl space-y-6"><SiteNavigation currentPath="/diagnostic" />
    <header><p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--coral)]">Personal practice</p><h1 className="text-3xl font-bold sm:text-4xl">Find your next practice focus</h1><p className="mt-4 leading-7 text-[var(--muted)]">An optional 10-question skills check, covering one idea from each practice activity. Save and resume across devices, then review explanations after submitting.</p></header>
    <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7"><h2 className="text-xl font-bold">A starting point for your learning plan</h2><p className="text-sm leading-6">Answered questions can inform your account learning plan when personalization is enabled. Skipped questions do not count as weaknesses. This is personal practice and does not create a class grade.</p><p className="text-sm leading-6 text-[var(--muted)]">One saved check is available for this question set. Submission is final; you can revisit your results afterward.</p>
      {message ? <p role="alert">{message}</p> : !ready ? <p role="status">Loading your saved skills check…</p> : null}
      {!changed ? <button className={quizButton} type="button" disabled={busy} onClick={() => load(ready)}>{busy ? 'Loading…' : ready ? 'Begin skills check' : 'Retry loading'}</button> : <Link className={`${quizSecondary} inline-flex items-center`} href="/auth?next=%2Fdiagnostic">Sign in again</Link>}
    </section><Link className="inline-flex min-h-11 items-center font-bold text-[var(--moss)] underline" href="/dashboard">Return to my learning plan</Link>
  </div></main>;
}
