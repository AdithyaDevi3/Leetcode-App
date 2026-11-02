'use client';

import Link from 'next/link';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import type { WrittenListResponse, WrittenWorkspace } from '@/lib/written-assessment-api-types';
import { validList } from './written-contract';
import { useWrittenAccess } from './use-written-access';
import { authorPath, classPath, points, primary, secondary, WrittenAccess, WrittenFrame } from './written-ui';

export function WrittenLibrary({ actorId, workspace, classId }: { actorId: string; workspace: WrittenWorkspace; classId: string }) {
  const access = useWrittenAccess<WrittenListResponse>({ actorId, initialUrl: `/api/assessments/written?workspace=${workspace}&classId=${classId}`, validate: (value): value is WrittenListResponse => validList(value, actorId, classId) });
  return <WrittenFrame workspace={workspace}><Link className={secondary} href={classPath(workspace, classId)}>← Class workspace</Link><AdminPageHeader eyebrow="Rubric assignments" title="Written work and pseudocode" description="Save a private prompt and rubric, review the exact audience, then assign a frozen class instance." />
    {!access.data ? <WrittenAccess loading={access.loading} stopped={access.stopped} error={access.error} retry={() => { void access.read(); }} /> : <section aria-label="Written assignment drafts" className="space-y-5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><div className="flex flex-wrap gap-3"><Link className={primary} href={`${authorPath(workspace, classId)}/new`}>Create written assignment</Link><button className={secondary} type="button" onClick={() => { void access.read(); }}>Refresh drafts</button></div><p className="text-sm text-[var(--muted)]">Saving a draft assigns nothing. Published assignments and learner grades retain their own history.</p>{!access.data.drafts.length ? <p className="text-sm">No written drafts yet. Start with a clear prompt and visible grading criteria.</p> : <ul className="space-y-3">{access.data.drafts.map(draft => <li key={draft.id} className="flex flex-col justify-between gap-3 rounded-lg border border-[var(--line)] p-4 sm:flex-row sm:items-center"><div><h2 className="break-words text-lg font-bold">{draft.title}</h2><p className="text-sm text-[var(--muted)]">Revision {draft.revision} · {draft.criteria.length} criteria · {points(draft.maxUnits)} points</p></div><Link className={secondary} href={`${authorPath(workspace, classId)}/${draft.id}`}>Open written draft</Link></li>)}</ul>}</section>}
  </WrittenFrame>;
}
