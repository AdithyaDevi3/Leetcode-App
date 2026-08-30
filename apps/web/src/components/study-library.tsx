'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Note = { id: string; contentId: string; body: string; anchor: string | null; updatedAt: string };
type Bookmark = { id: string; contentId: string; label: string | null; createdAt: string };
type LoadState = 'loading' | 'ready' | 'unauthenticated' | 'error';

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
const humanize = (value: string) => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export function StudyLibrary() {
  const [state, setState] = useState<LoadState>('loading');
  const [notes, setNotes] = useState<Note[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setState('loading');
    setMessage(null);
    try {
      const [notesResponse, bookmarksResponse] = await Promise.all([
        fetch('/api/learner/notes'),
        fetch('/api/learner/bookmarks'),
      ]);
      if (notesResponse.status === 401 || bookmarksResponse.status === 401) {
        setState('unauthenticated');
        return;
      }
      const notesBody = await notesResponse.json().catch(() => null) as { notes?: Note[] } | null;
      const bookmarksBody = await bookmarksResponse.json().catch(() => null) as { bookmarks?: Bookmark[] } | null;
      if (!notesResponse.ok || !bookmarksResponse.ok || !Array.isArray(notesBody?.notes) || !Array.isArray(bookmarksBody?.bookmarks)) {
        setState('error');
        return;
      }
      setNotes(notesBody.notes);
      setBookmarks(bookmarksBody.bookmarks);
      setState('ready');
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    // Defer the initial request until after the first paint. This keeps the
    // effect focused on scheduling external I/O and avoids a synchronous
    // state cascade during mount.
    const handle = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  const deleteItem = async (kind: 'notes' | 'bookmarks', id: string) => {
    setMessage('Removing saved item…');
    try {
      const response = await fetch(`/api/learner/${kind}/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed');
      if (kind === 'notes') setNotes((items) => items.filter((item) => item.id !== id));
      else setBookmarks((items) => items.filter((item) => item.id !== id));
      setMessage('Removed from your study library.');
    } catch {
      setMessage('Could not remove that item. Please try again.');
    }
  };

  return <main className="min-h-screen px-6 py-8 text-[var(--ink)] sm:py-12">
    <section className="mx-auto max-w-5xl">
      <nav aria-label="Learner navigation" className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-5 text-sm">
        <Link className="flex items-center gap-2 font-bold" href="/"><span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--mustard)] font-mono text-xs">M</span>Method</Link>
        <div className="flex flex-wrap gap-4 font-semibold text-[var(--moss)]"><Link href="/dashboard">Dashboard</Link><Link href="/history">History</Link><Link href="/practice">Practice</Link></div>
      </nav>
      <header className="mt-10 flex flex-wrap items-end justify-between gap-5">
        <div><p className="eyebrow">Your reference shelf</p><h1>Study library</h1><p className="mt-3 max-w-2xl text-[var(--muted)]">Save patterns, edge cases, and problems worth revisiting. Notes and bookmarks follow your account across devices.</p></div>
        <Link className="button" href="/practice">Continue practice</Link>
      </header>

      {state === 'loading' ? <p className="mt-10 text-[var(--muted)]" aria-live="polite">Loading your saved learning…</p> : null}
      {state === 'unauthenticated' ? <section className="mt-10 border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[0_18px_50px_rgba(34,46,38,.08)]"><h2 className="text-xl font-bold">Sign in to build your library</h2><p className="mt-2 max-w-xl text-[var(--muted)]">Your local drafts still work as a guest. Create an account when you want notes and bookmarks saved across devices.</p><Link className="button mt-5 inline-flex" href="/auth">Sign in or create an account</Link></section> : null}
      {state === 'error' ? <section className="mt-10 border border-[var(--coral)] bg-[var(--coral-soft)] p-6"><h2 className="font-bold">We couldn’t load your study library.</h2><button className="button secondary mt-4" onClick={() => void load()} type="button">Try again</button></section> : null}
      {state === 'ready' ? <>
        {message ? <p className="mt-6 text-sm text-[var(--muted)]" aria-live="polite">{message}</p> : null}
        <div className="mt-9 grid gap-7 lg:grid-cols-2">
          <section className="border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_18px_50px_rgba(34,46,38,.08)]" aria-labelledby="bookmarks-heading">
            <div className="flex items-baseline justify-between gap-4"><div><p className="eyebrow">Return later</p><h2 id="bookmarks-heading" className="text-2xl font-bold">Bookmarks</h2></div><span className="rounded-full bg-[var(--moss-soft)] px-3 py-1 text-sm font-bold text-[var(--moss)]">{bookmarks.length}</span></div>
            {bookmarks.length === 0 ? <EmptyState detail="Bookmark a practice item to keep it in your review queue." /> : <ol className="mt-5 divide-y divide-[var(--line)]">{bookmarks.map((bookmark) => <li className="py-4 first:pt-0" key={bookmark.id}><div className="flex items-start justify-between gap-4"><div><h3 className="font-bold">{bookmark.label || humanize(bookmark.contentId)}</h3><p className="mt-1 text-sm text-[var(--muted)]">Saved {formatDate(bookmark.createdAt)}</p></div><button className="text-button muted" onClick={() => void deleteItem('bookmarks', bookmark.id)} type="button">Remove</button></div><Link className="mt-3 inline-block text-sm font-bold text-[var(--moss)] underline underline-offset-4" href="/practice">Practice again</Link></li>)}</ol>}
          </section>
          <section className="border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_18px_50px_rgba(34,46,38,.08)]" aria-labelledby="notes-heading">
            <div className="flex items-baseline justify-between gap-4"><div><p className="eyebrow">What you learned</p><h2 id="notes-heading" className="text-2xl font-bold">Notes</h2></div><span className="rounded-full bg-[var(--sky)] px-3 py-1 text-sm font-bold text-[var(--ink)]">{notes.length}</span></div>
            {notes.length === 0 ? <EmptyState detail="Write a note beside the reasoning feedback while you practice." /> : <ol className="mt-5 divide-y divide-[var(--line)]">{notes.map((note) => <li className="py-4 first:pt-0" key={note.id}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-[var(--coral)]">{humanize(note.contentId)}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{note.body}</p><p className="mt-2 text-xs text-[var(--muted)]">Updated {formatDate(note.updatedAt)}</p></div><button className="text-button muted shrink-0" onClick={() => void deleteItem('notes', note.id)} type="button">Remove</button></div></li>)}</ol>}
          </section>
        </div>
      </> : null}
    </section>
  </main>;
}

function EmptyState({ detail }: { detail: string }) {
  return <div className="mt-5 border-l-4 border-[var(--mustard)] bg-[#fbf5e6] p-4 text-sm leading-6 text-[var(--muted)]">{detail}</div>;
}
