'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { SharedCodingLanguage, SharedCodingRoom, SharedCodingRoomMode, SharedCodingRoomSummary } from '@leetcode-app/database';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ExecutionResult } from '@leetcode-app/domain';

const button = 'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--moss)] disabled:opacity-50';
const primary = `${button} border-transparent bg-[var(--moss)] text-white`;
const field = 'min-h-11 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm';
const languages: SharedCodingLanguage[] = ['python', 'cpp', 'typescript', 'java'];
const interviewStageLabel: Record<SharedCodingRoom['interviewStage'], string> = {
  lobby: 'Lobby', prompt: 'Prompt', workspace: 'Workspace', review: 'Review',
};
const interviewStageGuidance: Record<SharedCodingRoom['interviewStage'], string> = {
  lobby: 'Wait for the interviewer to open the prompt.',
  prompt: 'Read the prompt. The workspace is closed.',
  workspace: 'Use the workspace. Save your work when you are ready.',
  review: 'The interviewer closed the workspace for review.',
};

function message(value: unknown, fallback: string) { return value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string' ? (value as { error: string }).error : fallback; }

export function SharedCodingRooms({ classId, base, canCreate }: { classId: string; base: string; canCreate: boolean }) {
  const [rooms, setRooms] = useState<SharedCodingRoomSummary[] | null>(null);
  const [title, setTitle] = useState(''); const [language, setLanguage] = useState<SharedCodingLanguage>('typescript'); const [mode, setMode] = useState<SharedCodingRoomMode>('collaboration'); const [interviewPrompt, setInterviewPrompt] = useState('');
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null);
  async function load() {
    const response = await fetch(`/api/classes/${classId}/rooms`, { cache: 'no-store' }); const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body?.rooms)) throw new Error(message(body, 'Shared coding rooms are unavailable.'));
    setRooms(body.rooms);
  }
  useEffect(() => { void load().catch(error => setNotice(error instanceof Error ? error.message : 'Shared coding rooms are unavailable.')); }, [classId]);
  async function create() {
    if (!title.trim() || busy) return; setBusy(true); setNotice(null);
    try { const response = await fetch(`/api/classes/${classId}/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roomId: crypto.randomUUID(), title: title.trim(), language, source: '', mode, interviewPrompt: mode === 'interview' ? interviewPrompt : undefined }) });
      const body = await response.json().catch(() => null); if (!response.ok) throw new Error(message(body, 'The room could not be created.'));
      const room = body as SharedCodingRoom; setRooms(previous => [room, ...(previous ?? [])]); setTitle(''); setInterviewPrompt(''); setNotice('Shared draft created. Invite class members before they can open it.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The room could not be created.'); } finally { setBusy(false); }
  }
  return <section className="space-y-5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6" aria-label="Shared coding rooms">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Shared coding rooms</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Rooms hold collaborative practice drafts. They do not submit academic work or award credit.</p></div><button className={button} type="button" disabled={busy} onClick={() => void load().catch(error => setNotice(error instanceof Error ? error.message : 'Shared coding rooms are unavailable.'))}>Refresh rooms</button></div>
    {canCreate ? <form className="grid gap-3 border-t border-[var(--line)] pt-5 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]" onSubmit={event => { event.preventDefault(); void create(); }}><label className="grid gap-1 text-sm font-bold">Room title<input className={field} maxLength={160} value={title} onChange={event => setTitle(event.target.value)} required /></label><label className="grid gap-1 text-sm font-bold">Mode<select className={field} value={mode} onChange={event => setMode(event.target.value as SharedCodingRoomMode)}><option value="collaboration">Collaborate</option><option value="interview">Interview</option></select></label><label className="grid gap-1 text-sm font-bold">Language<select className={field} value={language} onChange={event => setLanguage(event.target.value as SharedCodingLanguage)}>{languages.map(value => <option key={value} value={value}>{value === 'cpp' ? 'C++' : value === 'typescript' ? 'TypeScript' : value === 'python' ? 'Python' : 'Java'}</option>)}</select></label><button className={primary} type="submit" disabled={busy || !title.trim()}>{busy ? 'Creating room…' : 'Create room'}</button>{mode === 'interview' ? <label className="grid gap-1 text-sm font-bold sm:col-span-4">Interview prompt<textarea className={`${field} min-h-28 resize-y`} value={interviewPrompt} onChange={event => setInterviewPrompt(event.target.value)} maxLength={20000} placeholder="Describe the interview task. The interviewee cannot see it until you open the prompt." /></label> : null}</form> : null}
    {notice ? <p role="status" className="rounded-lg border border-[var(--line)] bg-[var(--paper)] p-3 text-sm">{notice}</p> : null}
    {rooms === null ? <p role="status" className="text-sm text-[var(--muted)]">Loading shared coding rooms…</p> : rooms.length ? <ul className="divide-y divide-[var(--line)]">{rooms.map(room => <li className="flex flex-wrap items-center justify-between gap-3 py-4" key={room.id}><div><h2 className="font-bold">{room.title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{room.mode === 'interview' ? 'Interview' : 'Collaboration'} · {room.language} · Revision {room.revision}</p></div><Link className={button} href={`${base}/rooms/${room.id}`}>Open room</Link></li>)}</ul> : <p className="text-sm leading-6 text-[var(--muted)]">No shared coding rooms are available.</p>}
  </section>;
}

export function SharedCodingRoomWorkspace({ roomId, actorId, canManage = false }: { roomId: string; actorId?: string; canManage?: boolean }) {
  const [room, setRoom] = useState<SharedCodingRoom | null>(null); const [source, setSource] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null);
  const [interviewPromptDraft, setInterviewPromptDraft] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting');
  const [learners, setLearners] = useState<{ id: string; displayName: string }[]>([]); const [invitee, setInvitee] = useState(''); const [inviteRole, setInviteRole] = useState<'editor' | 'viewer' | 'interviewee'>('editor');
  const [liveMemberIds, setLiveMemberIds] = useState<readonly string[]>([]);
  const [cursorPositions, setCursorPositions] = useState<Readonly<Record<string, number>>>({});
  const [runResult, setRunResult] = useState<ExecutionResult | null>(null);
  const realtimeChannel = useRef<RealtimeChannel | null>(null);
  const cursorTimer = useRef<number | null>(null);
  async function load() { const response = await fetch(`/api/shared-coding-rooms/${roomId}`, { cache: 'no-store' }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(message(body, 'The shared coding room is unavailable.')); const next = body as SharedCodingRoom; setRoom(next); setSource(next.source); setInterviewPromptDraft(next.interviewPrompt ?? ''); setConnection('connected'); }
  function announceRevision(next: SharedCodingRoom) { void realtimeChannel.current?.send({ type: 'broadcast', event: 'revision', payload: { revision: next.revision, controlRevision: next.controlRevision } }); }
  function shareCursor(position: number) { if (!actorId || cursorTimer.current !== null) return; cursorTimer.current = window.setTimeout(() => { cursorTimer.current = null; void realtimeChannel.current?.send({ type: 'broadcast', event: 'cursor', payload: { userId: actorId, position } }); }, 120); }
  useEffect(() => { void load().catch(error => { setConnection(navigator.onLine ? 'reconnecting' : 'offline'); setNotice(error instanceof Error ? error.message : 'The shared coding room is unavailable.'); }); }, [roomId]);
  useEffect(() => { const online = () => { setConnection('reconnecting'); void load().catch(() => setConnection('reconnecting')); }; const offline = () => setConnection('offline'); window.addEventListener('online', online); window.addEventListener('offline', offline); return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); }; }, [roomId]);
  useEffect(() => {
    if (!actorId || room?.status !== 'open' || !isSupabaseConfigured()) return;
    let channel: RealtimeChannel | null = null;
    try {
      const client = createSupabaseBrowserClient();
      const syncPresence = () => {
        if (!channel) return;
        const states = channel.presenceState<{ userId?: unknown }>();
        const users = Object.values(states).flatMap(entries => entries.map(entry => entry.userId)).filter((userId): userId is string => typeof userId === 'string');
        setLiveMemberIds([...new Set(users)].sort());
      };
      channel = client.channel(`shared-room:${roomId}`, { config: { private: true, presence: { key: actorId } } })
        .on('broadcast', { event: 'revision' }, payload => {
          const notice = payload.payload as { revision?: unknown; controlRevision?: unknown };
          if (!Number.isSafeInteger(notice.revision) || !Number.isSafeInteger(notice.controlRevision)) return;
          void load().catch(() => setConnection('reconnecting'));
        })
        .on('broadcast', { event: 'cursor' }, payload => {
          const cursor = payload.payload as { userId?: unknown; position?: unknown };
          const userId = cursor.userId;
          const position = cursor.position;
          if (typeof userId !== 'string' || typeof position !== 'number' || !Number.isSafeInteger(position) || position < 0 || position > 100_000) return;
          setCursorPositions(previous => ({ ...previous, [userId]: position }));
        })
        .on('presence', { event: 'sync' }, syncPresence)
        .subscribe(status => {
          if (status === 'SUBSCRIBED') void channel?.track({ userId: actorId });
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnection('reconnecting');
        });
      realtimeChannel.current = channel;
    } catch {
      setLiveMemberIds([]);
    }
    return () => {
      if (!channel) return;
      realtimeChannel.current = null;
      if (cursorTimer.current !== null) window.clearTimeout(cursorTimer.current);
      void channel.unsubscribe();
    };
  }, [actorId, room?.status, roomId]);
  useEffect(() => {
    if (!room || busy) return;
    const timer = window.setInterval(() => { void (async () => { try {
      const response = await fetch(`/api/shared-coding-rooms/${roomId}?afterRevision=${room.revision}&afterControlRevision=${room.controlRevision}`, { cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (!response.ok) { setConnection(navigator.onLine ? 'reconnecting' : 'offline'); return; }
      setConnection('connected');
      if (!body || typeof body !== 'object' || !(body as { changed?: unknown }).changed) return;
      const next = (body as { room?: unknown }).room;
      if (!next || typeof next !== 'object') return;
      const updated = next as SharedCodingRoom;
      if (source !== room.source) { setNotice('A newer shared revision is available. Save or refresh your local edits before loading it.'); return; }
      setRoom(updated); setSource(updated.source); setInterviewPromptDraft(updated.interviewPrompt ?? ''); setNotice('A newer shared revision is loaded.');
    } catch { setConnection(navigator.onLine ? 'reconnecting' : 'offline'); } })(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [busy, room, roomId, source]);
  const viewerRole = canManage ? 'owner' : room?.members.find(member => member.userId === actorId)?.role;
  const canControl = canManage || viewerRole === 'owner';
  useEffect(() => { if (!canControl) return; void fetch(`/api/shared-coding-rooms/${roomId}/learners`, { cache: 'no-store' }).then(response => response.json().then(body => ({ response, body }))).then(({ response, body }) => { if (!response.ok || !Array.isArray(body?.learners)) throw new Error(message(body, 'Class members are unavailable.')); setLearners(body.learners); }).catch(error => setNotice(error instanceof Error ? error.message : 'Class members are unavailable.')); }, [canControl, roomId]);
  useEffect(() => { if (room?.mode === 'interview') setInviteRole('interviewee'); else setInviteRole('editor'); }, [room?.mode]);
  async function save() { if (!room || busy) return; setBusy(true); setNotice(null); try { const response = await fetch(`/api/shared-coding-rooms/${roomId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: room.revision, language: room.language, source }) }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(message(body, 'The shared draft could not be saved.')); const next = body as SharedCodingRoom; setRoom(next); setSource(next.source); announceRevision(next); setNotice('Shared draft saved.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'The shared draft could not be saved.'); } finally { setBusy(false); } }
  async function invite() { if (!room || !invitee || busy) return; setBusy(true); setNotice(null); try { const response = await fetch(`/api/shared-coding-rooms/${roomId}/members`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: invitee, role: inviteRole }) }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(message(body, 'The class member could not be invited.')); const next = body as SharedCodingRoom; setRoom(next); announceRevision(next); setInvitee(''); setNotice('Room member access updated.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'The class member could not be invited.'); } finally { setBusy(false); } }
  async function revoke(userId: string) { if (!room || busy || !window.confirm('Remove this member from the room?')) return; setBusy(true); setNotice(null); try { const response = await fetch(`/api/shared-coding-rooms/${roomId}/members`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(message(body, 'The room member could not be removed.')); const next = body as SharedCodingRoom; setRoom(next); announceRevision(next); setNotice('Room member access removed.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'The room member could not be removed.'); } finally { setBusy(false); } }
  async function setStage(stage: SharedCodingRoom['interviewStage'], prompt?: string) { if (!room || busy) return; setBusy(true); try { const response = await fetch(`/api/shared-coding-rooms/${roomId}/interview`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedControlRevision: room.controlRevision, stage, ...(prompt === undefined ? {} : { prompt }) }) }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(message(body, 'The interview stage could not change.')); const next = body as SharedCodingRoom; setRoom(next); setInterviewPromptDraft(next.interviewPrompt ?? ''); announceRevision(next); setNotice(prompt === undefined ? `Interview stage changed to ${interviewStageLabel[stage]}.` : 'Interview prompt saved.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'The interview stage could not change.'); } finally { setBusy(false); } }
  async function closeRoom() { if (!room || busy || !window.confirm('Close this room? Members can still read saved work, but no one can save new changes.')) return; setBusy(true); setNotice(null); try { const response = await fetch(`/api/shared-coding-rooms/${roomId}/close`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedControlRevision: room.controlRevision }) }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(message(body, 'The room could not be closed.')); const next = body as SharedCodingRoom; setRoom(next); announceRevision(next); setNotice('Room closed. Saved work remains available to members.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'The room could not be closed.'); } finally { setBusy(false); } }
  async function runSavedSource() { if (!room || busy) return; if (source !== room.source) { setNotice('Save the shared draft before you run it.'); return; } setBusy(true); setNotice('Running the saved shared draft. This does not create a grade or submission.'); try { const response = await fetch(`/api/shared-coding-rooms/${roomId}/run`, { method: 'POST' }); const body = await response.json().catch(() => null); if (!response.ok || !body?.run) throw new Error(message(body, 'The shared draft could not run.')); setRunResult(body.run as ExecutionResult); setNotice('Run complete. This result is not saved as academic work.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'The shared draft could not run.'); } finally { setBusy(false); } }
  if (!room) return <p role="status" className="text-sm text-[var(--muted)]">Opening shared coding room…</p>;
  const roomClosed = room.status === 'closed';
  const readOnly = viewerRole === 'viewer' || roomClosed;
  const canChangeInterview = canControl && !roomClosed;
  const canRunSavedSource = !roomClosed && (room.mode === 'collaboration' ? !readOnly : viewerRole === 'interviewee' && room.interviewStage === 'workspace');
  return <section className="space-y-5" aria-label="Shared coding draft">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-[var(--muted)]">{room.mode === 'interview' ? `Interview · ${interviewStageLabel[room.interviewStage]}` : 'Shared practice draft'} · {roomClosed ? 'Closed' : connection === 'connected' ? 'Connected' : connection === 'offline' ? 'Offline' : 'Reconnecting'}</p><h1 className="text-3xl font-bold">{room.title}</h1><p className="mt-2 text-sm text-[var(--muted)]">Revision {room.revision} · {room.language}. This room cannot submit academic work.</p></div><div className="flex flex-wrap gap-2"><button className={button} type="button" disabled={busy} onClick={() => void load().catch(error => { setConnection(navigator.onLine ? 'reconnecting' : 'offline'); setNotice(error instanceof Error ? error.message : 'The room could not refresh.'); })}>Refresh draft</button>{canControl && !roomClosed ? <button className={button} type="button" disabled={busy} onClick={() => void closeRoom()}>Close room</button> : null}</div></header>
    {room.mode === 'interview' ? <p role="status" className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 text-sm">{canControl ? `Current stage: ${interviewStageGuidance[room.interviewStage]}` : interviewStageGuidance[room.interviewStage]}</p> : null}
    {room.mode === 'interview' && canChangeInterview ? <section className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4" aria-label="Interview controls"><div><strong className="text-sm">Interview controls</strong><p className="mt-1 text-sm text-[var(--muted)]">Save the prompt before you open it to the interviewee.</p></div><div className="flex flex-wrap gap-2">{(['lobby','prompt','workspace','review'] as const).map(value => <button className={value === room.interviewStage ? primary : button} key={value} type="button" disabled={busy || value === room.interviewStage} onClick={() => void setStage(value)}>{value === 'workspace' ? 'Open workspace' : interviewStageLabel[value]}</button>)}</div><label className="grid gap-1 text-sm font-bold">Private prompt<textarea className={`${field} min-h-32 resize-y`} value={interviewPromptDraft} onChange={event => setInterviewPromptDraft(event.target.value)} maxLength={20000} placeholder="Describe the task and the interview conditions." /></label><button className={button} type="button" disabled={busy || interviewPromptDraft === (room.interviewPrompt ?? '')} onClick={() => void setStage(room.interviewStage, interviewPromptDraft)}>Save prompt</button></section> : null}
    {canRunSavedSource ? <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4" aria-label="Shared room execution"><p className="text-sm text-[var(--muted)]">Run uses the latest saved source. It does not create a grade or submission.</p><button className={button} type="button" disabled={busy || source !== room.source} onClick={() => void runSavedSource()}>{busy ? 'Running shared draft…' : 'Run saved draft'}</button>{runResult ? <p className="w-full text-sm">{runResult.status} · {runResult.durationMs} ms · exit {runResult.exitCode ?? 'none'}</p> : null}{runResult?.stdout ? <pre className="w-full overflow-auto whitespace-pre-wrap text-sm">{runResult.stdout}</pre> : null}{runResult?.stderr ? <pre className="w-full overflow-auto whitespace-pre-wrap text-sm text-red-700">{runResult.stderr}</pre> : null}</section> : null}
    {room.mode === 'interview' && room.interviewStage === 'lobby' && !canControl ? <p role="status" className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-5 text-sm">The interviewer has not opened the prompt.</p> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]"><div className="space-y-3">{room.mode === 'interview' && room.interviewPrompt ? <section className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4"><h2 className="font-bold">Interview prompt</h2><p className="mt-2 whitespace-pre-wrap text-sm">{room.interviewPrompt}</p></section> : null}<label className="grid gap-2 text-sm font-bold">Shared source<textarea className={`${field} min-h-[28rem] resize-y font-mono leading-6`} value={source} disabled={busy || readOnly || room.mode === 'interview' && room.interviewStage !== 'workspace'} readOnly={readOnly || room.mode === 'interview' && room.interviewStage !== 'workspace'} onChange={event => setSource(event.target.value)} onSelect={event => shareCursor(event.currentTarget.selectionStart)} maxLength={100000} spellCheck={false} /></label>{roomClosed ? <p role="status" className="text-sm text-[var(--muted)]">This room is closed. Saved work is read-only.</p> : readOnly ? <p role="status" className="text-sm text-[var(--muted)]">You can read this draft. The room owner must grant editor access before you can save changes.</p> : room.mode === 'interview' && room.interviewStage !== 'workspace' ? <p role="status" className="text-sm text-[var(--muted)]">{room.interviewStage === 'review' ? 'The interviewer closed the workspace for review.' : 'The interviewer must open the workspace before code changes are available.'}</p> : <button className={primary} type="button" disabled={busy || source === room.source} onClick={() => void save()}>{busy ? 'Saving shared draft…' : 'Save shared draft'}</button>}</div><aside className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"><div><h2 className="font-bold">Room members</h2><p className="mt-1 text-sm text-[var(--muted)]">{liveMemberIds.length ? `${liveMemberIds.length} active now` : 'Live presence is unavailable.'}</p><ul className="mt-3 space-y-2 text-sm">{room.members.map(member => <li className="flex items-center justify-between gap-2" key={member.userId}><span>{member.displayName} <span className="text-[var(--muted)]">· {member.role}{liveMemberIds.includes(member.userId) ? ' · active' : ''}{cursorPositions[member.userId] === undefined ? '' : ` · cursor ${cursorPositions[member.userId]}`}</span></span>{canControl && !roomClosed && member.role !== 'owner' ? <button className={button} type="button" disabled={busy} onClick={() => void revoke(member.userId)}>Remove</button> : null}</li>)}</ul></div>{canControl && !roomClosed ? <form className="grid gap-2 border-t border-[var(--line)] pt-4" onSubmit={event => { event.preventDefault(); void invite(); }}><label className="grid gap-1 text-sm font-bold">Class member<select className={field} value={invitee} onChange={event => setInvitee(event.target.value)}><option value="">Select a member</option>{learners.filter(learner => learner.id !== actorId).map(learner => <option key={learner.id} value={learner.id}>{learner.displayName}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Room role<select className={field} value={inviteRole} onChange={event => setInviteRole(event.target.value as 'editor' | 'viewer' | 'interviewee')}>{room.mode === 'collaboration' ? <option value="editor">Editor</option> : <option value="interviewee">Interviewee</option>}<option value="viewer">Viewer</option></select></label><button className={button} type="submit" disabled={busy || !invitee}>Add member</button></form> : null}</aside></div>}
    {notice ? <p role="status" className="rounded-lg border border-[var(--line)] bg-[var(--paper)] p-3 text-sm">{notice}</p> : null}
  </section>;
}
