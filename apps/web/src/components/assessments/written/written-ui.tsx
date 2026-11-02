import Link from 'next/link';
import type { ReactNode } from 'react';
import type { WrittenAssessmentDraft } from '@leetcode-app/database';
import type { WrittenWorkspace } from '@/lib/written-assessment-api-types';
export { field, primary, secondary } from '../templates/template-ui';
import { secondary } from '../templates/template-ui';

export const points = (units: number) => (units / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
export const classPath = (workspace: WrittenWorkspace, classId: string) => workspace === 'admin' ? `/admin/classes/${classId}` : `/teach/${classId}`;
export const authorPath = (workspace: WrittenWorkspace, classId: string) => `${classPath(workspace, classId)}/written`;
export function WrittenFrame({ workspace, children }: { workspace: WrittenWorkspace; children: ReactNode }) {
  const Container = workspace === 'admin' ? 'div' : 'main';
  return <Container><div className={`mx-auto max-w-6xl space-y-6 ${workspace === 'admin' ? '' : 'px-5 py-6 sm:px-8'}`}>{children}</div></Container>;
}
export function WrittenAccess({ loading, stopped, error, retry, busy = false }: { loading: boolean; stopped: boolean; error: string | null; retry: () => void; busy?: boolean }) {
  return <>{error ? <p role="alert" aria-label="Written access error" className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] p-4 text-sm">{error}</p> : null}<section aria-label="Written access verification" className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><p role="status" className="text-sm">{stopped ? 'Account changed. Reopen this assignment to continue.' : loading ? 'Checking your account and assignment access…' : 'Recheck access to show the assignment.'}</p>{stopped ? <Link className={secondary} href="/auth">Reopen account workspace</Link> : <button className={secondary} type="button" disabled={loading || busy} onClick={retry}>Retry assignment preview</button>}</section></>;
}
export function WrittenRubric({ criteria, maxUnits }: { criteria: WrittenAssessmentDraft['criteria']; maxUnits: number }) {
  return <section className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" aria-label="Published rubric"><h2 className="text-xl font-bold">How this work is graded</h2><p className="text-sm text-[var(--muted)]">Your instructor reviews these criteria and releases the grade. Total: {points(maxUnits)} points.</p><ol className="space-y-3">{criteria.map((criterion, index) => <li className="flex flex-wrap justify-between gap-2 rounded-lg border border-[var(--line)] p-3 text-sm" key={criterion.id}><span className="break-words font-bold">{index + 1}. {criterion.label}</span><span>{points(criterion.maxUnits)} points</span></li>)}</ol></section>;
}
