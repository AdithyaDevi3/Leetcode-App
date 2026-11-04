'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AssignmentGradeReleasePreview, ClassGradebook, GradeReleaseResponseDetail, GradeReleaseRosterRow } from '@leetcode-app/database';
import { AdminBadge, AdminSection } from '@/components/admin/admin-ui';
import { gradeReleaseReceiptMatches, isPendingGradeAction, type PendingGradeAction } from '@/lib/grade-release-client';
import { GradeResponseView, gradePoints } from './grade-response-view';

const button = 'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--moss)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]';
const primary = `${button} !border-[var(--moss)] !bg-[var(--moss)] !text-white`;
type Props = { classId: string; assignments: ClassGradebook['assignments']; actorId: string; workspace: 'admin' | 'teach' };
type Envelope = { actorId?: string; preview?: AssignmentGradeReleasePreview; detail?: GradeReleaseResponseDetail; receipt?: unknown; code?: string; error?: string; message?: string };

export function AssignmentReleaseCenter(props: Props) {
  return <OwnedReleaseCenter key={`${props.actorId}:${props.workspace}:${props.classId}`} {...props} />;
}

function OwnedReleaseCenter({ classId, assignments, actorId, workspace }: Props) {
  const router = useRouter();
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? '');
  const [preview, setPreview] = useState<AssignmentGradeReleasePreview | null>(null);
  const [detail, setDetail] = useState<GradeReleaseResponseDetail | null>(null);
  const [mode, setMode] = useState<'release' | 'share'>('release');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<PendingGradeAction | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [ownerChanged, setOwnerChanged] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [pageNumber, setPageNumber] = useState(0);
  const inFlight = useRef(false);
  const pendingRef = useRef<PendingGradeAction | null>(null);
  const detailRequest = useRef(0);
  const detailRegion = useRef<HTMLElement>(null);
  const key = `method:class-grade-action:${actorId}:${workspace}:${classId}`;
  const endpoint = (id: string) => `/api/class-gradebook/${classId}/assignments/${id}`;
  const headers = { 'content-type': 'application/json', 'x-assessment-author': actorId };
  const storage = (action: PendingGradeAction | null) => {
    pendingRef.current = action; setPending(action);
    try { if (action) window.sessionStorage.setItem(key, JSON.stringify(action)); else window.sessionStorage.removeItem(key); } catch { /* The same command remains recoverable in memory. */ }
  };

  const checkOwner = (body: Envelope) => {
    if (body.code === 'owner_changed' || body.actorId && body.actorId !== actorId) {
      setOwnerChanged(true); setPreview(null); setDetail(null);
      throw new Error('Your account changed. Reopen the class in the intended account.');
    }
  };

  async function load(id: string, keepMessage = false) {
    setBusy(true); setDetail(null); setConfirmed(false); setQuery(''); setPageNumber(0);
    if (!keepMessage) { setMessage(null); setError(false); }
    try {
      const response = await fetch(`${endpoint(id)}?workspace=${workspace}`, { cache: 'no-store', headers, signal: AbortSignal.timeout(15_000) });
      const body = await response.json() as Envelope;
      checkOwner(body);
      if ([401, 403, 404, 409].includes(response.status)) { setPreview(null); setDetail(null); setBlocked(true); }
      if (!response.ok || body.actorId !== actorId || body.preview?.classroom.id !== classId || body.preview.assignment.id !== id || !Array.isArray(body.preview.roster)) throw new Error(body.message ?? 'Could not load saved grades. Try again.');
      setPreview(body.preview); setBlocked(false);
      setSelected(body.preview.roster.filter(row => mode === 'release' ? row.ready : Boolean(row.shareTarget)).flatMap(row => row.recipientId ? [row.recipientId] : []));
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Could not load the assignment.'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem(key);
        const saved: unknown = raw ? JSON.parse(raw) : null;
        if (isPendingGradeAction(saved)) {
          pendingRef.current = saved; setPending(saved); setAssignmentId(saved.assignmentId);
          setMode(saved.kind === 'release' ? 'release' : 'share');
          setMessage('An earlier request needs confirmation. Retry the original request to recover its receipt.');
        } else if (raw) window.sessionStorage.removeItem(key);
      } catch { /* Server records remain available without browser storage. */ }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key]);

  async function act(action: PendingGradeAction) {
    if (inFlight.current || blocked || ownerChanged) return;
    inFlight.current = true; setBusy(true); setError(false); setMessage(null);
    storage(action);
    try {
      const response = await fetch(`${endpoint(action.assignmentId)}/${action.kind === 'release' ? 'releases' : 'sharing'}?workspace=${workspace}`, {
        method: 'POST', headers, body: JSON.stringify(action.body), signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json().catch(() => null) as Envelope | null;
      if (body) checkOwner(body);
      if (!response.ok || body?.actorId !== actorId || !gradeReleaseReceiptMatches(body?.receipt, action, classId, actorId)) {
        if ([400, 401, 403, 404, 409, 413].includes(response.status)) setBlocked(true);
        throw new Error(body?.message ?? 'Could not confirm the request. Retry the same request safely.');
      }
      storage(null); setConfirmed(false);
      setMessage(action.kind === 'release' ? `${action.body.targets.length} ${action.body.targets.length === 1 ? 'grade released' : 'grades released'} privately to learners.`
        : action.kind === 'share' ? 'Class-sharing request confirmed. The current sharing state is shown below.' : 'Revocation request confirmed. The current sharing state is shown below. Individual released grades remain private to their learners.');
      router.refresh();
      await load(action.assignmentId, true);
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Could not confirm grade release.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function viewResponse(row: GradeReleaseRosterRow) {
    if (!row.recipientId || busy) return;
    const request = ++detailRequest.current;
    setBusy(true); setError(false);
    try {
      const response = await fetch(`/api/class-gradebook/${classId}/recipients/${row.recipientId}?workspace=${workspace}`, { cache: 'no-store', headers, signal: AbortSignal.timeout(15_000) });
      const body = await response.json() as Envelope;
      if (request !== detailRequest.current) return;
      checkOwner(body);
      if (!response.ok || body.actorId !== actorId || body.detail?.recipientId !== row.recipientId || body.detail.classroom.id !== classId || body.detail.assignment.id !== preview?.assignment.id) throw new Error(body.message ?? 'Could not open the submitted response.');
      setDetail(body.detail);
      window.requestAnimationFrame(() => detailRegion.current?.focus());
    } catch (cause) { setError(true); setMessage(cause instanceof Error ? cause.message : 'Could not open the response.'); }
    finally { setBusy(false); }
  }

  const eligible = preview?.roster.filter(row => mode === 'release' ? row.ready : Boolean(row.shareTarget)) ?? [];
  const selectedRows = eligible.filter(row => row.recipientId && selected.includes(row.recipientId));
  const normalized = query.trim().toLocaleLowerCase();
  const roster = (preview?.roster ?? []).filter(row => !normalized || row.learner.displayName.toLocaleLowerCase().includes(normalized))
    .sort((left, right) => (right.earnedUnits ?? -1) - (left.earnedUnits ?? -1) || left.learner.displayName.localeCompare(right.learner.displayName));
  const pages = Math.max(1, Math.ceil(roster.length / 50));
  const currentPage = Math.min(pageNumber, pages - 1);
  const visible = roster.slice(currentPage * 50, currentPage * 50 + 50);
  const locked = busy || Boolean(pending) || ownerChanged || blocked;
  const reviewHref = (recipientId: string) => workspace === 'admin' ? `/admin/classes/${classId}/grades/recipients/${recipientId}`
    : preview?.assignment.kind === 'quiz' ? `/teach/${classId}/assessments/recipients/${recipientId}` : `/teach/${classId}/submissions/${recipientId}`;
  const prepareRelease = (rows: GradeReleaseRosterRow[]) => {
    if (!confirmed || rows.length < 1 || rows.length > 500 || locked) return;
    void act({ assignmentId, kind: 'release', body: { targets: rows.flatMap(row => row.releaseTarget ? [row.releaseTarget] : []), requestKey: crypto.randomUUID() } });
  };

  return <AdminSection title="Release and share scores" description="Review an assignment's roster and submitted work. Private grade release and class-wide sharing are separate actions.">
    <div className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 flex-1 gap-2 text-sm font-bold" htmlFor="release-assignment">Assignment to review<select id="release-assignment" className="min-h-11 min-w-0 rounded-md border border-[var(--line)] bg-white px-3 font-normal" disabled={!ready || locked || !assignments.length} value={assignmentId} onChange={event => { setAssignmentId(event.target.value); setPreview(null); setDetail(null); setConfirmed(false); setMessage(null); }}>
          {!assignments.length ? <option value="">No assignments yet</option> : assignments.map(assignment => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
        </select></label>
        <button className={button} type="button" disabled={!ready || busy || ownerChanged || Boolean(pending) || !assignmentId} onClick={() => void load(assignmentId)}>{busy ? 'Loading…' : preview ? 'Refresh saved grades' : 'Review scores and responses'}</button>
      </div>
      {message ? <p role={error ? 'alert' : 'status'} aria-label="Grade release status" className={`rounded-lg border p-4 text-sm leading-6 ${error ? 'border-[var(--coral)] bg-[var(--coral-soft)]' : 'border-[var(--moss)] bg-[var(--moss-soft)]'}`}>{message}</p> : null}
      {pending ? <div className="space-y-3 rounded-lg border border-[var(--line)] p-4"><p className="text-sm">Original {pending.kind === 'release' ? `release of ${pending.body.targets.length} grades` : pending.kind === 'share' ? 'class-sharing request' : 'sharing revocation'} is retained for recovery.</p><button className={button} type="button" disabled={busy || ownerChanged || blocked} onClick={() => void act(pendingRef.current!)}>{busy ? 'Confirming…' : 'Retry original request'}</button>{blocked && !ownerChanged ? <button className={`${button} ml-2`} type="button" disabled={busy} onClick={() => { storage(null); setBlocked(false); void load(assignmentId); }}>Review latest saved grades</button> : null}</div> : null}
      {preview && !ownerChanged ? <>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Score publication mode">{([{ value: 'release', label: 'Private grade release' }, { value: 'share', label: 'Class sharing' }] as const).map(item => <button key={item.value} className={`${button} ${mode === item.value ? 'border-[var(--moss)] bg-[var(--moss-soft)]' : ''}`} type="button" aria-pressed={mode === item.value} disabled={locked} onClick={() => { setMode(item.value); setConfirmed(false); setSelected(preview.roster.filter(row => item.value === 'release' ? row.ready : Boolean(row.shareTarget)).flatMap(row => row.recipientId ? [row.recipientId] : [])); }}>{item.label}</button>)}</div>
        <p className="text-sm leading-6 text-[var(--muted)]">{mode === 'release' ? `${eligible.length} ready to release. Missing, ungraded, excused and withdrawn records are kept separate.` : 'Select already released records to share names, scores and submitted answers with current members of this class. New attempts and corrections require a new sharing action.'}</p>
        {mode === 'share' ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--paper)] p-4 text-sm"><p className="mb-0 font-bold">{preview.sharing?.shared ? `${preview.sharing.recipientCount} records shared with this class` : 'Class results are private'}</p>{preview.sharing?.shared ? <><button className={button} type="button" onClick={() => { const url = `${window.location.origin}/classes/${classId}/results/${assignmentId}`; if (!navigator.clipboard) { setError(false); setMessage(`Student results link: ${url}`); return; } void navigator.clipboard.writeText(url).then(() => { setError(false); setMessage('Student results link copied. Current class members can open it.'); }).catch(() => { setError(false); setMessage(`Student results link: ${url}`); }); }}>Copy student results link</button><button className={button} type="button" disabled={locked} onClick={() => void act({ assignmentId, kind: 'revoke', body: { action: 'revoke', expectedSharingSequence: preview.sharing?.sequence ?? 0, requestKey: crypto.randomUUID() } })}>Revoke class sharing</button></> : null}</div> : null}
        <div className="flex flex-wrap items-end justify-between gap-3"><label className="grid gap-2 text-sm font-bold">Find a student<input type="search" className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal" value={query} onChange={event => { setQuery(event.target.value); setPageNumber(0); }} /></label><button className={button} type="button" disabled={locked || !eligible.length} onClick={() => { setSelected(selectedRows.length === eligible.length ? [] : eligible.flatMap(row => row.recipientId ? [row.recipientId] : [])); setConfirmed(false); }}>{selectedRows.length === eligible.length && eligible.length ? 'Clear selection' : mode === 'release' ? 'Select all ready grades' : 'Select all released records'}</button></div>
        <div className="max-h-[32rem] overflow-auto rounded-lg border border-[var(--line)]" role="region" aria-label="Assignment score roster" tabIndex={0}>
          <table className="w-full min-w-[42rem] border-collapse text-left text-sm"><caption className="sr-only">{preview.assignment.title}: saved scores and release readiness, highest score first</caption><thead className="sticky top-0 bg-[var(--paper)]"><tr>{['Select', 'Student', 'Saved score', 'Status', 'Submitted work', 'Release'].map(label => <th key={label} scope="col" className="border-b border-[var(--line)] px-3 py-3 font-bold">{label}</th>)}</tr></thead><tbody>{visible.map(row => {
            const canSelect = mode === 'release' ? row.ready : Boolean(row.shareTarget);
            return <tr key={row.learner.id}><td className="border-b border-[var(--line)] p-3"><input aria-label={`Select ${row.learner.displayName} for ${mode === 'release' ? 'release' : 'class sharing'}`} type="checkbox" checked={Boolean(row.recipientId && selected.includes(row.recipientId))} disabled={locked || !canSelect} onChange={event => { setSelected(current => event.target.checked ? [...current, row.recipientId!] : current.filter(id => id !== row.recipientId)); setConfirmed(false); }} /></td><th scope="row" className="border-b border-[var(--line)] p-3 font-bold">{row.learner.displayName}{row.membership === 'withdrawn' ? <span className="mt-1 block text-xs font-normal text-[var(--muted)]">Withdrawn</span> : null}</th><td className="border-b border-[var(--line)] p-3 font-mono tabular-nums">{row.earnedUnits === null ? '—' : `${gradePoints(row.earnedUnits)} / ${gradePoints(row.maxUnits)}`}</td><td className="border-b border-[var(--line)] p-3"><AdminBadge value={row.ready ? 'ready' : row.state} />{row.reason ? <span className="mt-2 block max-w-52 text-xs leading-5 text-[var(--muted)]">{row.reason}</span> : null}</td><td className="border-b border-[var(--line)] p-3">{row.recipientId ? <button className="min-h-11 text-left font-bold text-[var(--moss)] underline" aria-label={`View ${row.learner.displayName}'s questions and answer`} type="button" disabled={busy} onClick={() => void viewResponse(row)}>View response</button> : 'Not assigned'}</td><td className="border-b border-[var(--line)] p-3">{mode === 'release' && row.ready ? <button className={button} type="button" disabled={locked || !confirmed} onClick={() => prepareRelease([row])} aria-label={`Release ${row.learner.displayName}'s grade`}>Release grade</button> : row.state === 'published' ? 'Released' : '—'}</td></tr>;
          })}</tbody></table>
          {!visible.length ? <p className="p-4 text-sm">No students match this view.</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="mb-0" aria-live="polite">{roster.length} students · {selectedRows.length} selected · Page {currentPage + 1} of {pages}</p>{pages > 1 ? <div className="flex gap-2"><button className={button} type="button" disabled={currentPage === 0} onClick={() => setPageNumber(currentPage - 1)}>Previous students</button><button className={button} type="button" disabled={currentPage + 1 === pages} onClick={() => setPageNumber(currentPage + 1)}>Next students</button></div> : null}</div>
        {selectedRows.length > 500 ? <p className="text-sm">Select up to 500 records per action. All selected records are processed together.</p> : null}
        <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input className="mt-1" type="checkbox" checked={confirmed} disabled={locked || preview.archived || !selectedRows.length || selectedRows.length > 500} onChange={event => setConfirmed(event.target.checked)} />{mode === 'release' ? 'I reviewed the saved scores and want to release the selected grades privately to those learners.' : 'I want current class members to see these selected students’ names, released scores, questions and submitted answers.'}</label>
        <button className={primary} type="button" disabled={!confirmed || locked || preview.archived || !selectedRows.length || selectedRows.length > 500} onClick={() => {
          if (mode === 'release') prepareRelease(selectedRows);
          else void act({ assignmentId, kind: 'share', body: { action: 'publish', targets: selectedRows.flatMap(row => row.shareTarget ? [row.shareTarget] : []), expectedSharingSequence: preview.sharing?.sequence ?? 0, requestKey: crypto.randomUUID() } });
        }}>{mode === 'release' ? selectedRows.length === eligible.length ? `Release all ready grades (${selectedRows.length})` : `Release selected grades (${selectedRows.length})` : preview.sharing?.shared ? `Update shared class results (${selectedRows.length})` : `Share class results (${selectedRows.length})`}</button>
        {detail ? <section ref={detailRegion} tabIndex={-1} aria-label={`Response for ${detail.learner.displayName}`} className="space-y-5 rounded-xl border border-[var(--line)] p-5 focus-visible:outline-2 focus-visible:outline-[var(--moss)]"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">{detail.learner.displayName} · {detail.assignment.title}</h3><button className={button} type="button" onClick={() => setDetail(null)}>Close response</button></div><p className="font-mono font-bold">{detail.grade ? `${gradePoints(detail.grade.earnedUnits)} / ${gradePoints(detail.grade.maxUnits)} · ${detail.grade.published ? 'Released' : 'Private saved grade'}` : 'No saved grade'}</p><GradeResponseView content={detail.content} response={detail.response} /><Link className="inline-flex min-h-11 items-center font-bold text-[var(--moss)] underline" href={reviewHref(detail.recipientId)}>Open grading review</Link></section> : null}
      </> : null}
    </div>
  </AdminSection>;
}
