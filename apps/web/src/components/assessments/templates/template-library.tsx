'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { AdminBadge, AdminPageHeader } from '@/components/admin/admin-ui';
import type { TemplateLibraryResponse, TemplateWorkspace } from '@/lib/assessment-template-api-types';
import { displayAssessmentPoints } from '@/lib/assessment-draft-form';
import { validLibrary } from './template-contract';
import { useOwnerPreview } from './use-owner-preview';
import { field, libraryPath, secondary, TemplateAccess, TemplateFrame } from './template-ui';

export function TemplateLibrary({ workspace, actorId }: { workspace: TemplateWorkspace; actorId: string }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const applied = useRef({ search: '', status: 'active', page: 1 });
  const endpoint = `/api/assessments/templates?workspace=${workspace}`;
  const preview = useOwnerPreview<TemplateLibraryResponse>({ actorId, initialUrl: `${endpoint}&status=active&page=1`, validate: value => validLibrary(value, actorId, applied.current.page) });
  function load(page: number, newFilters = false) {
    if (newFilters) applied.current = { search: search.trim(), status, page: 1 };
    else applied.current = { ...applied.current, page };
    const params = new URLSearchParams({ workspace, search: applied.current.search, status: applied.current.status, page: String(applied.current.page) });
    void preview.read(`/api/assessments/templates?${params}`);
  }
  const data = preview.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return <TemplateFrame workspace={workspace}>
    <Link className={secondary} href={workspace === 'admin' ? '/admin/classes' : '/teach'}>← Back to classes</Link>
    <AdminPageHeader eyebrow="Reusable authoring" title="Your private quiz templates" description="Save reviewed quiz content once, keep its version history, and create private drafts for your classes." action={<button type="button" className={secondary} disabled={preview.loading || preview.stopped} onClick={() => preview.read()}>Refresh library</button>} />
    <section aria-label="Template privacy" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 text-sm leading-6"><p>Only templates you created appear here, including in the administrator workspace. Creating or editing a template assigns nothing.</p><p className="mb-0 text-[var(--muted)]">To start, open a saved quiz and choose Save as private template. Review authored instructions before reusing them with another class.</p></section>
    {!data ? <TemplateAccess loading={preview.loading} stopped={preview.stopped} error={preview.error} retry={() => { void preview.read(); }} /> : <>
      <form aria-label="Filter private templates" className="grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:grid-cols-[1fr_12rem_auto]" onSubmit={event => { event.preventDefault(); load(1, true); }}>
        <label className="grid gap-2 text-sm font-bold">Find a template<input className={field} type="search" maxLength={160} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label className="grid gap-2 text-sm font-bold">Template status<select aria-label="Template status" className={field} value={status} onChange={event => setStatus(event.target.value)}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All templates</option></select></label>
        <button type="submit" className={`${secondary} sm:self-end`}>Apply filters</button>
      </form>
      <section aria-label="Your template library" className="space-y-4"><p role="status" className="text-sm font-bold">{data.total} {data.total === 1 ? 'template' : 'templates'} · Page {data.page} of {pages}</p>{data.items.length ? <ul className="grid gap-4 md:grid-cols-2">{data.items.map(item => <li className="min-w-0 space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" key={item.id}><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="break-words text-xl font-bold">{item.title}</h2><AdminBadge value={item.status} /></div><p className="text-sm text-[var(--muted)]">Version {item.currentVersion} · {item.questionCount} questions · {displayAssessmentPoints(item.maxUnits)} points</p><Link className={secondary} href={`${libraryPath(workspace)}/${item.id}`} onClick={event => { if (!preview.verifiedNow.current) event.preventDefault(); }}>Open template</Link></li>)}</ul> : <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-sm">No private templates match these filters. Adjust the filters, or open a saved class quiz to create your first template.</p>}</section>
      <nav aria-label="Template library pages" className="flex flex-wrap items-center gap-3"><button type="button" className={secondary} disabled={data.page <= 1} onClick={() => load(data.page - 1)}>Previous page</button><button type="button" className={secondary} disabled={data.page >= pages} onClick={() => load(data.page + 1)}>Next page</button></nav>
    </>}
  </TemplateFrame>;
}
