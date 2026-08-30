'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PracticeHistoryItem } from '@/lib/practice-api';
import { practiceItems } from '@/lib/content';
import { readLocalPracticeHistory, type LocalPracticeHistoryEntry } from '@/lib/local-practice-history';

type LoadState = 'loading' | 'ready' | 'local';

const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

const statusLabel = (status: PracticeHistoryItem['session']['status']) => status.replace('_', ' ');
const contentLabel = (contentId: string) => practiceItems.find((item) => item.id === contentId)?.label ?? contentId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function EvaluationSummary({ evaluation }: { evaluation: PracticeHistoryItem['evaluation'] }) {
  if (!evaluation) return <p className="text-sm text-[var(--muted)]">No evaluation requested yet.</p>;
  if (evaluation.status !== 'completed') return <p className="text-sm text-[var(--muted)]">Evaluation {evaluation.status}.</p>;
  const result = evaluation.approved === null ? 'Evaluation completed' : evaluation.approved ? 'Approved' : 'Needs revision';
  return <div className="text-sm text-[var(--muted)]"><p className="font-medium text-[var(--ink)]">{result}{evaluation.score !== null ? ` · ${evaluation.score}/100` : ''}</p>{evaluation.summary ? <p className="mt-1">{evaluation.summary}</p> : null}</div>;
}

function LocalPracticeHistory({ items }: { items: LocalPracticeHistoryEntry[] }) {
  if (items.length === 0) return <section className="border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[0_18px_50px_rgba(34,46,38,.08)]"><h2 className="text-xl font-semibold">No practice sessions yet</h2><p className="mt-2 text-[var(--muted)]">Complete a local practice item and it will appear here.</p><Link className="button mt-5 inline-flex" href="/practice">Start practicing</Link></section>;
  return <><div className="mb-5 border-l-4 border-[var(--mustard)] bg-[#fbf5e6] p-4 text-sm leading-6 text-[var(--muted)]">These sessions are stored only in this browser. <Link className="font-bold text-[var(--moss)] underline underline-offset-4" href="/auth">Sign in</Link> to keep future learning across devices.</div><ol className="space-y-4" aria-label="Local practice sessions">{items.map((item) => <li className="border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_18px_50px_rgba(34,46,38,.08)]" key={item.practiceItemId}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{item.label}</h2><p className="mt-1 text-sm text-[var(--muted)]">Completed {dateTime(item.completedAt)}</p></div><span className="rounded-full bg-[var(--mustard)] px-3 py-1 text-sm font-bold text-[var(--ink)]">On this device</span></div>{item.evaluationScore !== null ? <p className="mt-4 text-sm font-medium text-[var(--ink)]">Evaluation score {item.evaluationScore}/100</p> : null}<Link className="mt-4 inline-block text-sm font-bold text-[var(--moss)] underline underline-offset-4" href="/practice">Practice again</Link></li>)}</ol></>;
}

export function PracticeHistory() {
  const [state, setState] = useState<LoadState>('loading');
  const [items, setItems] = useState<PracticeHistoryItem[]>([]);
  const [localItems, setLocalItems] = useState<LocalPracticeHistoryEntry[]>([]);

  const load = async () => {
    try {
      const response = await fetch('/api/practice/history');
      const body = await response.json().catch(() => null) as { sessions?: PracticeHistoryItem[] } | null;
      if (response.status === 401) { setState('local'); return; }
      if (!response.ok || !Array.isArray(body?.sessions)) { setState('local'); return; }
      setItems(body.sessions);
      setState('ready');
    } catch {
      setState('local');
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalItems(readLocalPracticeHistory());
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (state === 'loading') return <p aria-live="polite" className="text-[var(--muted)]">Loading your practice history…</p>;
  if (state === 'local') return <LocalPracticeHistory items={localItems} />;
  if (items.length === 0) return <section className="border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[0_18px_50px_rgba(34,46,38,.08)]"><h2 className="text-xl font-semibold">No saved sessions yet</h2><p className="mt-2 text-[var(--muted)]">Your drafts, revisions, and evaluation summaries will show up here as you practice.</p><Link className="button mt-5 inline-flex" href="/practice">Start practicing</Link></section>;

  return <ol className="space-y-4" aria-label="Practice sessions">
    {items.map(({ session, revisionCount, latestRevision, evaluation }) => <li className="border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_18px_50px_rgba(34,46,38,.08)]" key={session.id}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Saved practice</p><h2 className="text-lg font-semibold">{contentLabel(session.contentId)}</h2><p className="mt-1 text-sm text-[var(--muted)]">Updated {dateTime(session.updatedAt)}</p></div><span className="rounded-full bg-[var(--moss-soft)] px-3 py-1 text-sm font-bold capitalize text-[var(--moss)]">{statusLabel(session.status)}</span></div>
      <dl className="mt-5 grid gap-3 border-y border-[var(--line)] py-4 text-sm sm:grid-cols-3"><div><dt className="text-[var(--muted)]">Current stage</dt><dd className="mt-1 font-medium capitalize">{session.currentStage}</dd></div><div><dt className="text-[var(--muted)]">Saved revisions</dt><dd className="mt-1 font-medium">{revisionCount}{latestRevision ? ` · latest #${latestRevision.revisionNumber}` : ''}</dd></div><div><dt className="text-[var(--muted)]">Started</dt><dd className="mt-1 font-medium">{dateTime(session.createdAt)}</dd></div></dl>
      <div className="mt-5"><h3 className="text-sm font-semibold text-[var(--ink)]">Latest evaluation</h3><div className="mt-2"><EvaluationSummary evaluation={evaluation} /></div></div><div className="mt-5 flex flex-wrap gap-4"><Link className="text-sm font-bold text-[var(--moss)] underline underline-offset-4" href="/practice">Resume practice</Link><Link className="text-sm font-bold text-[var(--moss)] underline underline-offset-4" href="/library">Open study library</Link></div>
    </li>)}
  </ol>;
}
