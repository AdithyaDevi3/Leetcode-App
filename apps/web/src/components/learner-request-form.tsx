'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

type RequestItem = { id: string; type: 'question' | 'feature'; title: string; description: string; status: string; createdAt: string };

export function LearnerRequestForm() {
  const [type, setType] = useState<'question' | 'feature'>('question');
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [sourceUrl, setSourceUrl] = useState('');
  const [items, setItems] = useState<RequestItem[]>([]); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { void fetch('/api/learner/requests').then((response) => response.ok ? response.json() : null).then((body) => { if (Array.isArray(body?.requests)) setItems(body.requests); }); }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/learner/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, title, description, sourceUrl: sourceUrl || null }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) { setMessage(body?.error ?? 'Could not submit your request.'); return; }
      setItems((current) => [body.request, ...current]); setTitle(''); setDescription(''); setSourceUrl(''); setMessage('Thanks — your request is in the queue.');
    } catch { setMessage('Could not submit your request. Please try again.'); } finally { setSaving(false); }
  };
  return <main className="min-h-screen px-6 py-8 text-[var(--ink)] sm:py-12"><section className="mx-auto max-w-4xl">
    <nav aria-label="Learner navigation" className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-5 text-sm"><Link className="flex items-center gap-2 font-bold" href="/"><span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--mustard)] font-mono text-xs">M</span>Method</Link><div className="flex flex-wrap gap-4 font-semibold text-[var(--moss)]"><Link href="/practice">Practice</Link><Link href="/library">Library</Link><Link href="/dashboard">Dashboard</Link></div></nav>
    <header className="mt-10"><p className="eyebrow">Shape the curriculum</p><h1>Request a question or feature</h1><p className="mt-3 max-w-2xl text-[var(--muted)]">Tell us what would make your practice more useful. Guests can submit ideas now; sign in later to keep your learning history across devices.</p></header>
    <form className="mt-8 border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_18px_50px_rgba(34,46,38,.08)]" onSubmit={submit}><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold">I want to request<select className="mt-2 w-full rounded-md border border-[var(--line)] bg-white p-3" value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="question">A practice question</option><option value="feature">A product feature</option></select></label><label className="text-sm font-semibold">Title<input className="mt-2 w-full rounded-md border border-[var(--line)] bg-white p-3" minLength={3} maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={type === 'question' ? 'e.g. Graph traversal with a visual trace' : 'e.g. Add weekly review reminders'} /></label></div><label className="mt-5 block text-sm font-semibold">Details<textarea className="mt-2 min-h-32 w-full rounded-md border border-[var(--line)] bg-white p-3" minLength={10} maxLength={5000} required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should it help you do? Include constraints, examples, or acceptance criteria." /></label><label className="mt-5 block text-sm font-semibold">Reference link <span className="font-normal text-[var(--muted)]">(optional)</span><input className="mt-2 w-full rounded-md border border-[var(--line)] bg-white p-3" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label><div className="mt-5 flex flex-wrap items-center gap-4"><button className="button" disabled={saving} type="submit">{saving ? 'Submitting…' : 'Submit request'}</button>{message ? <p aria-live="polite" className="text-sm text-[var(--muted)]">{message}</p> : null}</div></form>
    {items.length > 0 ? <section className="mt-10" aria-labelledby="request-history"><div className="flex items-baseline justify-between"><div><p className="eyebrow">Your queue</p><h2 className="text-2xl font-bold" id="request-history">Submitted requests</h2></div><span className="rounded-full bg-[var(--moss-soft)] px-3 py-1 text-sm font-bold text-[var(--moss)]">{items.length}</span></div><ul className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">{items.map((item) => <li className="flex flex-wrap items-start justify-between gap-4 py-4" key={item.id}><div><p className="text-xs font-bold uppercase tracking-wide text-[var(--coral)]">{item.type}</p><h3 className="mt-1 font-bold">{item.title}</h3></div><span className="rounded-full bg-[#fbf5e6] px-3 py-1 text-xs font-bold capitalize text-[var(--ink)]">{item.status}</span></li>)}</ul></section> : null}
  </section></main>;
}
