'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AnnouncementList, AnnouncementView, ClassPortalWorkspace } from '@leetcode-app/database';
import {
  announcementReceiptMatches, announcementTextValid, isAnnouncementList, isAnnouncementView,
  isPendingAnnouncementAction, portalUuid, type PendingAnnouncementAction,
} from '@/lib/class-portal-client';

const buttonBase = 'inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-bold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]';
const button = `${buttonBase} border-[var(--line)] bg-[var(--surface)] text-[var(--moss)]`;
const primary = `${buttonBase} border-transparent bg-[var(--moss)] text-white`;
const field = 'min-h-11 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]';
type Editor = { announcementId: string; sequence: number; title: string; body: string; revisionId: string | null; baselineTitle: string; baselineBody: string };
const editorValid = (value: unknown): value is Editor => Boolean(value && typeof value === 'object' && !Array.isArray(value)
  && portalUuid((value as Editor).announcementId) && Number.isSafeInteger((value as Editor).sequence) && (value as Editor).sequence >= 0
  && ['title', 'body', 'baselineTitle', 'baselineBody'].every(key => typeof (value as Record<string, unknown>)[key] === 'string')
  && (value as Editor).title.length <= 160 && (value as Editor).body.length <= 20_000
  && (value as Editor).baselineTitle.length <= 160 && (value as Editor).baselineBody.length <= 20_000
  && ((value as Editor).revisionId === null || portalUuid((value as Editor).revisionId)));
const labelDate = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Private draft';

export function AnnouncementManager({ classId, actorId, workspace }: { classId: string; actorId: string; workspace: 'teach' | 'admin' }) {
  return <AnnouncementWorkspace key={`${classId}:${actorId}:${workspace}`} classId={classId} actorId={actorId} workspace={workspace} />;
}

export function AnnouncementReader({ classId, actorId }: { classId: string; actorId: string }) {
  return <AnnouncementWorkspace key={`${classId}:${actorId}:learner`} classId={classId} actorId={actorId} workspace="learner" />;
}

function AnnouncementWorkspace({ classId, actorId, workspace }: { classId: string; actorId: string; workspace: ClassPortalWorkspace }) {
  const router = useRouter();
  const learner = workspace === 'learner';
  const base = `/api/class-portal/${classId}/announcements`;
  const key = `method:class-announcements:${actorId}:${workspace}:${classId}`;
  const textHint = useId();
  const [list, setList] = useState<AnnouncementList | null>(null);
  const [view, setView] = useState<AnnouncementView | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [recovery, setRecovery] = useState<Editor | null>(null);
  const [pending, setPending] = useState<PendingAnnouncementAction | null>(null);
  const [rejected, setRejected] = useState(false);
  const [filter, setFilter] = useState<'current' | 'archived' | 'all'>('current');
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);
  const selected = useRef<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const pendingRef = useRef<PendingAnnouncementAction | null>(null);
  const blocked = useRef(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const listVersion = useRef(0);
  const viewVersion = useRef(0);
  const currentList = useRef<AnnouncementList | null>(null);
  const currentFilter = useRef<'current' | 'archived' | 'all'>('current');
  const rejectedNeedsRead = useRef(false);
  const detailRegion = useRef<HTMLElement>(null);
  const listRegion = useRef<HTMLElement>(null);
  const dirty = Boolean(editor && (editor.sequence === 0 || editor.title !== editor.baselineTitle || editor.body !== editor.baselineBody));
  const stale = Boolean(editor && view?.announcement.id === editor.announcementId && view.announcement.sequence !== editor.sequence);
  const reading = learner && Boolean(view?.announcement.published);
  useEffect(() => { currentList.current = list; currentFilter.current = filter; }, [list, filter]);

  function storage(suffix: string, value: unknown) {
    try {
      if (value === null) window.sessionStorage.removeItem(`${key}:${suffix}`);
      else window.sessionStorage.setItem(`${key}:${suffix}`, JSON.stringify(value));
      return true;
    } catch { return false; }
  }
  function changeEditor(value: Editor | null) {
    editorRef.current = value; setEditor(value); storage('editor', value); setPublishConfirmed(false);
  }
  function canReadSelected() {
    const action = pendingRef.current;
    // A first save may not have reached the server. Its normal missing detail
    // must not prevent retrying the original create command after reload.
    if (action?.kind === 'save' && action.body.expectedSequence === 0) return false;
    return Boolean(selected.current && (editorRef.current?.sequence !== 0 || action));
  }
  function deny() {
    blocked.current = true; listVersion.current += 1; viewVersion.current += 1;
    setUnavailable(true); setList(null); setView(null); setEditor(null); setRecovery(null);
  }
  async function request(path: string, action?: PendingAnnouncementAction) {
    const response = await fetch(`${path}${path.includes('?') ? '&' : '?'}workspace=${workspace}`, {
      cache: 'no-store', headers: { 'x-assessment-author': actorId, ...(action ? { 'content-type': 'application/json' } : {}) },
      ...(action ? { method: 'POST', body: JSON.stringify(action.body) } : {}), signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => null);
    if (!mounted.current || blocked.current) throw new Error('Reopen this class to continue.');
    if ([401, 403, 404].includes(response.status) || body?.code === 'owner_changed' || body?.actorId && body.actorId !== actorId) {
      deny(); throw new Error('Your account or class access changed. Reopen the class in the intended account.');
    }
    if (!response.ok) {
      if (action && [400, 409, 413, 415].includes(response.status)) { setRejected(true); rejectedNeedsRead.current = response.status === 409; }
      throw new Error(typeof body?.message === 'string' ? body.message : 'This request could not be completed. Retry its original request safely.');
    }
    if (!body || body.actorId !== actorId) throw new Error('The server response could not be confirmed. Retry the original request.');
    return body;
  }
  async function loadList(append = false, state = currentFilter.current) {
    if (blocked.current) return;
    const version = ++listVersion.current;
    setLoading(true);
    const cursor = append ? currentList.current?.nextCursor : null;
    const query = new URLSearchParams({ limit: '25', state });
    if (cursor) { query.set('beforeAt', cursor.at); query.set('beforeId', cursor.id); }
    try {
      const body = await request(`${base}?${query}`);
      if (!isAnnouncementList(body.list, classId, workspace)) throw new Error('The announcement list could not be confirmed. Refresh to try again.');
      if (version !== listVersion.current || blocked.current) return;
      setList(previous => append && previous ? { ...body.list, items: [...previous.items, ...body.list.items.filter((item: { id: string }) => !previous.items.some(old => old.id === item.id))] } : body.list);
    } catch (cause) {
      if (mounted.current) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Could not open class announcements.'); }
    } finally { if (version === listVersion.current) setLoading(false); }
  }
  async function loadView(announcementId: string, replaceEditor = true, focus = false) {
    if (blocked.current) return;
    const version = ++viewVersion.current;
    selected.current = announcementId;
    try {
      const body = await request(`${base}/${announcementId}`);
      if (!isAnnouncementView(body.view, classId, announcementId, workspace)) throw new Error('The saved announcement could not be confirmed. Refresh to try again.');
      if (version !== viewVersion.current || blocked.current) return;
      const next: AnnouncementView = body.view;
      setView(next); setPublishConfirmed(false); setArchiveConfirmed(false);
      if (!learner && replaceEditor && next.announcement.draft) {
        const draft = next.announcement.draft;
        changeEditor({ announcementId, sequence: next.announcement.sequence, title: draft.title, body: draft.body, revisionId: draft.revisionId, baselineTitle: draft.title, baselineBody: draft.body });
      }
      if (focus) window.requestAnimationFrame(() => detailRegion.current?.focus());
    } catch (cause) {
      if (mounted.current) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Could not open the announcement.'); }
    }
  }

  useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(() => {
      let restored: Editor | null = null;
      try {
        const saved: unknown = JSON.parse(window.sessionStorage.getItem(`${key}:pending`) ?? 'null');
        if (isPendingAnnouncementAction(saved) && (learner ? saved.kind === 'read' : saved.kind !== 'read')) {
          pendingRef.current = saved; setPending(saved); selected.current = saved.announcementId;
          setMessage('An earlier request needs confirmation. Retry the original request before starting another.');
        } else if (saved) { setRejected(true); setMessage('The saved request could not be recovered. Review the latest class state before continuing.'); }
        const draft: unknown = JSON.parse(window.sessionStorage.getItem(`${key}:editor`) ?? 'null');
        if (!learner && editorValid(draft)) { restored = draft; editorRef.current = draft; setEditor(draft); selected.current = draft.announcementId; }
        const copy: unknown = JSON.parse(window.sessionStorage.getItem(`${key}:recovery`) ?? 'null');
        if (!learner && editorValid(copy)) setRecovery(copy);
      } catch { setRejected(true); setMessage('Browser recovery is unavailable. Review the latest class state before continuing.'); }
      void Promise.all([loadList(), canReadSelected() ? loadView(selected.current!, !restored) : Promise.resolve()])
        .finally(() => { if (mounted.current) setChecking(false); });
    }, 0);
    const refresh = () => {
      if (blocked.current) return;
      setChecking(true);
      void Promise.all([loadList(), canReadSelected() ? loadView(selected.current!, false) : Promise.resolve()])
        .finally(() => { if (mounted.current) setChecking(false); });
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('practice-owner-changed', refresh);
    const identityStorage = (event: StorageEvent) => { if (!event.key || event.key.startsWith('sb-')) refresh(); };
    window.addEventListener('storage', identityStorage);
    return () => {
      window.clearTimeout(timer); mounted.current = false; listVersion.current += 1; viewVersion.current += 1;
      window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh);
      window.removeEventListener('practice-owner-changed', refresh); window.removeEventListener('storage', identityStorage);
    };
    // Each mounted instance belongs to one actor/workspace/class. Refresh never replaces unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function act(action: PendingAnnouncementAction) {
    if (inFlight.current || blocked.current || rejected || !isPendingAnnouncementAction(action)) return;
    inFlight.current = true; setBusy(true); setError(false); setMessage(null);
    pendingRef.current = action; setPending(action);
    const stored = storage('pending', action);
    try {
      const route = { save: 'draft', publish: 'publications', archive: 'archive', read: 'read' }[action.kind];
      const body = await request(`${base}/${action.announcementId}/${route}`, action);
      if (!announcementReceiptMatches(body.receipt, action, classId, actorId)) throw new Error('The returned receipt could not be confirmed. Retry the original request.');
      if (!mounted.current || blocked.current) return;
      pendingRef.current = null; setPending(null); storage('pending', null); setRejected(false);
      setMessage(action.kind === 'save' ? 'Original save confirmed. Review the latest saved preview before publishing.'
        : action.kind === 'publish' ? 'Original publication confirmed. The current class state is shown below.'
        : action.kind === 'archive' ? 'Original archive confirmed. The current class state is shown below.'
        : 'Original read request confirmed. A newer publication, if any, remains unread.');
      await Promise.all([loadList(), loadView(action.announcementId, !learner)]);
      if (mounted.current && !blocked.current) router.refresh();
    } catch (cause) {
      if (mounted.current) { setError(true); setMessage(`${cause instanceof Error ? cause.message : 'Could not confirm the request.'}${stored ? '' : ' Browser recovery storage is unavailable; keep this tab open to retry the exact request.'}`); }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  function newAnnouncement() {
    selected.current = null; viewVersion.current += 1; setView(null); setMessage(null); setPublishConfirmed(false); setArchiveConfirmed(false);
    const announcementId = crypto.randomUUID(); selected.current = announcementId;
    changeEditor({ announcementId, sequence: 0, title: '', body: '', revisionId: null, baselineTitle: '', baselineBody: '' });
  }
  function returnToList() {
    viewVersion.current += 1;
    selected.current = null;
    setView(null);
    window.requestAnimationFrame(() => {
      listRegion.current?.focus({ preventScroll: true });
      listRegion.current?.scrollIntoView({ block: 'start' });
    });
  }
  async function reviewLatest() {
    inFlight.current = true; setBusy(true);
    const old = editorRef.current;
    if (old) { setRecovery(old); storage('recovery', old); }
    pendingRef.current = null; setPending(null); storage('pending', null); setRejected(false); setMessage(old ? 'Latest state loaded. Earlier edits are preserved below.' : 'Review the latest published announcement before marking it read.'); setError(false);
    try {
      await loadList();
      if (selected.current && (!old || old.sequence > 0 || rejectedNeedsRead.current)) await loadView(selected.current);
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const locked = busy || Boolean(pending) || rejected || stale || unavailable || checking;
  if (unavailable) return <p role="alert" className="rounded-xl border border-[var(--coral)] bg-[var(--coral-soft)] p-5 text-sm">{message ?? 'Class access changed. Reopen this class in the intended account.'}</p>;
  if (checking) return <p role="status" className="p-4 text-sm text-[var(--muted)]">Opening class announcements…</p>;

  return <section className="space-y-6" aria-label={learner ? 'Class announcements' : 'Manage class announcements'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="mb-0 max-w-2xl text-sm leading-7 text-[var(--muted)]">{learner ? 'Read updates published for your current class. New publications are marked unread.' : 'Save privately, review the saved version, then publish it for current class members. Editing a draft keeps the previous publication visible.'}</p>
      <div className="flex flex-wrap gap-2"><button className={button} type="button" disabled={loading || busy} onClick={() => void Promise.all([loadList(), canReadSelected() ? loadView(selected.current!, false) : Promise.resolve()])}>Refresh announcements</button>{!learner ? <button className={primary} type="button" disabled={locked || dirty} onClick={newAnnouncement}>New announcement</button> : null}</div>
    </div>
    {message ? <p role={error ? 'alert' : 'status'} className="rounded-lg border border-[var(--line)] bg-[var(--paper)] p-4 text-sm leading-6">{message}</p> : null}
    {pending ? <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"><p className="text-sm">Original {pending.kind} request is retained for recovery.</p><button className={button} type="button" disabled={busy || rejected} onClick={() => void act(pendingRef.current!)}>Retry original {pending.kind} request</button></div> : null}
    {stale && !pending ? <p role="status" className="rounded-lg bg-[var(--paper)] p-4 text-sm leading-6">This saved announcement changed. Your edits are retained; review the latest draft before making another change.</p> : null}
    {rejected || stale && !pending ? <button className={button} type="button" disabled={busy} onClick={() => void reviewLatest()}>{rejected ? 'Discard rejected request and review latest state' : 'Review latest saved draft'}</button> : null}
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(15rem,.7fr)_minmax(0,1.3fr)]">
      <section ref={listRegion} tabIndex={-1} className={`min-w-0 scroll-mt-24 space-y-4 ${reading ? 'hidden lg:block' : ''}`} aria-label="Announcement list">
        {!learner ? <label className="grid gap-2 text-sm font-bold">Show announcements<select aria-label="Show announcements" className={field} value={filter} disabled={loading || busy} onChange={event => { const state = event.target.value as typeof filter; setFilter(state); void loadList(false, state); }}><option value="current">Current</option><option value="archived">Archived</option><option value="all">All</option></select></label> : null}
        {list?.items.length ? list.items.map(item => <article className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4" key={item.id}>
          <div className="mb-2 flex flex-wrap gap-2 text-xs font-bold text-[var(--moss)]">{item.unread ? <span className="rounded-full bg-[var(--moss-soft)] px-2 py-1">Unread</span> : null}{item.authorState ? <span>{item.authorState.status}{item.authorState.hasUnpublishedChanges ? ' · Unpublished changes' : ''}</span> : null}<span>{labelDate(item.publishedAt)}</span></div>
          <h2 className="mb-2 break-words text-lg font-bold">{item.title}</h2><p className="mb-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--muted)]">{item.excerpt}</p>
          <button className={button} type="button" disabled={locked || !learner && dirty} aria-label={`${learner ? 'Read' : 'Open'} announcement: ${item.title}`} onClick={() => { setMessage(null); setError(false); setView(null); void loadView(item.id, true, true); }}>{learner ? 'Read announcement' : 'Open announcement'}</button>
        </article>) : <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 text-sm leading-6 text-[var(--muted)]">{loading ? 'Loading announcements…' : learner ? 'No announcements have been published for this class.' : 'No announcements in this view. Create a private draft to get started.'}</p>}
        {list?.nextCursor ? <button className={button} type="button" disabled={loading || busy} onClick={() => void loadList(true)}>Load more announcements</button> : null}
      </section>
      <section ref={detailRegion} tabIndex={-1} aria-label={learner ? 'Published announcement' : 'Announcement editor'} className={`min-w-0 space-y-5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 ${learner && !reading ? 'hidden lg:block' : ''}`}>
        {learner ? view?.announcement.published ? <>
          <button className={`${button} lg:hidden`} type="button" aria-label="Back to announcements" disabled={busy} onClick={returnToList}>← Back to announcements</button>
          <div><p className="text-xs font-bold text-[var(--moss)]">Published {labelDate(view.announcement.published.publishedAt)}</p><h2 className="break-words text-2xl font-bold">{view.announcement.published.content.title}</h2><p className="text-sm text-[var(--muted)]">By {view.announcement.published.content.authorName}</p></div>
          <p className="whitespace-pre-wrap break-words text-sm leading-7">{view.announcement.published.content.body}</p>
          {view.announcement.unread ? <button className={primary} type="button" disabled={locked} onClick={() => void act({ announcementId: view.announcement.id, kind: 'read', revisionId: view.announcement.published!.content.revisionId, body: { publicationSequence: view.announcement.published!.sequence, requestKey: crypto.randomUUID() } })}>Mark this publication read</button> : <p className="text-sm font-bold text-[var(--moss)]">Read</p>}
        </> : <p className="text-sm leading-7 text-[var(--muted)]">Choose an announcement to read its published text.</p> : editor ? <>
          <div><p className="text-xs font-bold text-[var(--moss)]">{editor.sequence ? 'Saved draft' : 'New private draft'}{dirty ? ' · Unsaved edits' : ''}</p><h2 className="text-xl font-bold">Announcement draft</h2></div>
          <label className="grid gap-2 text-sm font-bold">Announcement title<input className={field} maxLength={160} value={editor.title} disabled={locked} onChange={event => changeEditor({ ...editor, title: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-bold">Announcement text<textarea aria-label="Announcement text" aria-describedby={textHint} className={`${field} min-h-52 resize-y`} maxLength={20_000} value={editor.body} disabled={locked} onChange={event => changeEditor({ ...editor, body: event.target.value })} /><span id={textHint} className="text-xs font-normal text-[var(--muted)]">{editor.body.length.toLocaleString()} / 20,000 characters · Plain text</span></label>
          <div className="flex flex-wrap gap-3"><button className={primary} type="button" disabled={locked || !dirty || !announcementTextValid(editor.title.trim(), editor.body)} onClick={() => void act({ announcementId: editor.announcementId, kind: 'save', body: { expectedSequence: editor.sequence, title: editor.title.trim(), body: editor.body, requestKey: crypto.randomUUID() } })}>{busy ? 'Confirming request…' : 'Save private draft'}</button>{dirty ? <button className={button} type="button" disabled={locked} onClick={() => { if (editor.sequence === 0) { changeEditor(null); selected.current = null; setView(null); } else changeEditor({ ...editor, title: editor.baselineTitle, body: editor.baselineBody }); }}>Discard unsaved edits</button> : null}</div>
          {view?.announcement.draft && view.announcement.id === editor.announcementId ? <>
            <section className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--paper)] p-4" aria-label="Saved announcement preview"><p className="text-xs font-bold text-[var(--moss)]">Saved revision {view.announcement.draft.revisionNumber} · {view.announcement.status}</p><h3 className="break-words text-lg font-bold">{view.announcement.draft.title}</h3><p className="whitespace-pre-wrap break-words text-sm leading-7">{view.announcement.draft.body}</p></section>
            {dirty ? <p className="text-sm text-[var(--muted)]">Save your edits before publishing. The preview above is the saved version.</p> : null}
            <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input className="mt-1" type="checkbox" checked={publishConfirmed} disabled={locked || dirty} onChange={event => setPublishConfirmed(event.target.checked)} />I want current class members to read the saved announcement shown above.</label>
            <button className={primary} type="button" disabled={locked || dirty || !publishConfirmed || view.announcement.status === 'published' && view.announcement.published?.content.revisionId === view.announcement.draft.revisionId} onClick={() => void act({ announcementId: editor.announcementId, kind: 'publish', body: { expectedSequence: editor.sequence, revisionId: view.announcement.draft!.revisionId, requestKey: crypto.randomUUID() } })}>Publish saved announcement</button>
            {view.announcement.published ? <details className="rounded-lg border border-[var(--line)] p-4"><summary className="cursor-pointer text-sm font-bold">Previously published text</summary><h3 className="mt-3 break-words text-lg font-bold">{view.announcement.published.content.title}</h3><p className="whitespace-pre-wrap break-words text-sm leading-7">{view.announcement.published.content.body}</p></details> : null}
            {view.announcement.status !== 'archived' ? <div className="space-y-3 border-t border-[var(--line)] pt-4"><label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input className="mt-1" type="checkbox" checked={archiveConfirmed} disabled={locked || dirty} onChange={event => setArchiveConfirmed(event.target.checked)} />Archive this announcement. Class members will no longer have access to any published text.</label><button className={button} type="button" disabled={locked || dirty || !archiveConfirmed} onClick={() => void act({ announcementId: editor.announcementId, kind: 'archive', body: { expectedSequence: editor.sequence, requestKey: crypto.randomUUID() } })}>Archive announcement</button></div> : <p className="text-sm text-[var(--muted)]">Archived announcements stay private until you explicitly publish a saved revision again.</p>}
          </> : null}
        </> : <p className="text-sm leading-7 text-[var(--muted)]">Open an announcement or create a new private draft.</p>}
      </section>
    </div>
    {!learner && recovery ? <details className="rounded-xl border border-[var(--line)] p-4"><summary className="cursor-pointer text-sm font-bold">Preserved earlier edits</summary><h3 className="mt-3 break-words text-lg font-bold">{recovery.title}</h3><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">{recovery.body}</pre><button className={button} type="button" disabled={locked || !editor || dirty} onClick={() => { if (editor) changeEditor({ ...editor, title: recovery.title, body: recovery.body }); }}>Restore as unsaved edits</button></details> : null}
  </section>;
}
