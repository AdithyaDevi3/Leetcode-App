'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PracticeHistoryItem } from '@/lib/practice-api';

type LoadState = 'loading' | 'ready' | 'unauthenticated' | 'error';

const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

const statusLabel = (status: PracticeHistoryItem['session']['status']) => status.replace('_', ' ');

function EvaluationSummary({ evaluation }: { evaluation: PracticeHistoryItem['evaluation'] }) {
  if (!evaluation) return <p className="text-sm text-slate-500">No evaluation requested yet.</p>;
  if (evaluation.status !== 'completed') return <p className="text-sm text-slate-500">Evaluation {evaluation.status}.</p>;
  const result = evaluation.approved === null ? 'Evaluation completed' : evaluation.approved ? 'Approved' : 'Needs revision';
  return <div className="text-sm text-slate-600"><p className="font-medium text-slate-800">{result}{evaluation.score !== null ? ` · ${evaluation.score}/100` : ''}</p>{evaluation.summary ? <p className="mt-1">{evaluation.summary}</p> : null}</div>;
}

export function PracticeHistory() {
  const [state, setState] = useState<LoadState>('loading');
  const [items, setItems] = useState<PracticeHistoryItem[]>([]);

  const load = async () => {
    try {
      const response = await fetch('/api/practice/history');
      const body = await response.json().catch(() => null) as { sessions?: PracticeHistoryItem[] } | null;
      if (response.status === 401) { setState('unauthenticated'); return; }
      if (!response.ok || !Array.isArray(body?.sessions)) { setState('error'); return; }
      setItems(body.sessions);
      setState('ready');
    } catch {
      setState('error');
    }
  };

  const retry = () => {
    setState('loading');
    void load();
  };

  useEffect(() => { void load(); }, []);

  if (state === 'loading') return <p aria-live="polite" className="text-slate-600">Loading your practice history…</p>;
  if (state === 'unauthenticated') return <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Sign in to see your history</h2><p className="mt-2 text-slate-600">Practice history is available for your signed-in account.</p><Link className="mt-5 inline-block rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/api/auth/signin">Sign in</Link></section>;
  if (state === 'error') return <section className="rounded-xl border border-amber-200 bg-amber-50 p-6"><h2 className="text-xl font-semibold text-slate-900">We couldn’t load your history</h2><p className="mt-2 text-slate-700">Check your connection and try again.</p><button className="mt-5 rounded bg-slate-900 px-4 py-2 font-semibold text-white" type="button" onClick={retry}>Try again</button></section>;
  if (items.length === 0) return <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">No practice sessions yet</h2><p className="mt-2 text-slate-600">Your saved sessions and evaluation summaries will appear here.</p><Link className="mt-5 inline-block rounded bg-slate-900 px-4 py-2 font-semibold text-white" href="/practice">Start practicing</Link></section>;

  return <ol className="space-y-4" aria-label="Practice sessions">
    {items.map(({ session, revisionCount, latestRevision, evaluation }) => <li className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm" key={session.id}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{session.contentId}</h2><p className="mt-1 text-sm text-slate-500">Updated {dateTime(session.updatedAt)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium capitalize text-slate-700">{statusLabel(session.status)}</span></div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-slate-500">Current stage</dt><dd className="mt-1 font-medium capitalize">{session.currentStage}</dd></div><div><dt className="text-slate-500">Saved revisions</dt><dd className="mt-1 font-medium">{revisionCount}{latestRevision ? ` · latest #${latestRevision.revisionNumber}` : ''}</dd></div><div><dt className="text-slate-500">Started</dt><dd className="mt-1 font-medium">{dateTime(session.createdAt)}</dd></div></dl>
      <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold text-slate-700">Latest evaluation</h3><div className="mt-2"><EvaluationSummary evaluation={evaluation} /></div></div>
    </li>)}
  </ol>;
}
