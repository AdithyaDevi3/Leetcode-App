'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import type { ClassPortalWorkspace } from '@leetcode-app/database';

export function ClassNavigation({ classId, workspace }: { classId: string; workspace: ClassPortalWorkspace }) {
  return <Suspense fallback={<div className="min-h-14" />}><Navigation classId={classId} workspace={workspace} /></Suspense>;
}

function Navigation({ classId, workspace }: { classId: string; workspace: ClassPortalWorkspace }) {
  const path = usePathname();
  const query = useSearchParams();
  const learner = workspace === 'learner';
  const selectedView = query.get('view') === 'people' ? 'people'
    : query.get('view') === 'assignments' || query.get('error') || query.get('created') ? 'assignments' : 'overview';
  const base = learner ? `/classes/${classId}` : workspace === 'teach' ? `/teach/${classId}` : `/admin/classes/${classId}`;
  const links = learner ? [
    ['Overview', base], ['Assignments', `${base}/assignments`], ['My grades', `${base}/grades`],
    ['Announcements', `${base}/announcements`], ['Class results', `${base}/results`], ['People', `${base}/people`],
  ] : [
    ['Overview', base], ['Assignments', `${base}?view=assignments`], ['Grades', `${base}/${workspace === 'teach' ? 'gradebook' : 'grades'}`],
    ['Announcements', `${base}/announcements`], ['People', `${base}?view=people`], ['Insights', `${base}/insights`],
  ];
  const active = (href: string, label: string) => {
    if (label === 'Assignments' && (path.startsWith(`${base}/written`) || !learner && path.startsWith(`${base}/assessments`))) return true;
    if (label === 'Grades' && !learner && (path.startsWith(`${base}/submissions`) || path.startsWith(`${base}/disputes`))) return true;
    const [url, search] = href.split('?');
    if (url === base) return path === base && (search ? selectedView === new URLSearchParams(search).get('view') : selectedView === 'overview');
    return path === url || path.startsWith(`${url}/`);
  };
  return <div className="mx-auto max-w-6xl border-b border-[var(--line)] px-4 sm:px-0">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-2 text-xs font-bold text-[var(--muted)]">
      <span>{learner ? 'Your class' : workspace === 'admin' ? 'Administration · Class workspace' : 'Teaching · Class workspace'}</span>
      <Link href={learner ? '/classes?view=all' : workspace === 'teach' ? '/teach' : '/admin/classes'} className="inline-flex min-h-11 items-center text-[var(--moss)] underline underline-offset-4">{learner ? 'Switch or join a class' : 'All classes'}</Link>
    </div>
    <nav aria-label="Class navigation" className="flex max-w-full gap-1 overflow-x-auto pb-2" tabIndex={0}>
      {links.map(([label, href]) => <Link key={label} href={href} aria-current={active(href, label) ? 'page' : undefined}
        className={`inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-bold no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] ${active(href, label) ? 'bg-[var(--moss-soft)] text-[var(--moss)]' : 'text-[var(--muted)] hover:bg-[var(--paper)]'}`}>{label}</Link>)}
    </nav>
  </div>;
}
