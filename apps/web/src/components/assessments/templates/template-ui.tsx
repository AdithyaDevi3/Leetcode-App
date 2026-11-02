import Link from 'next/link';
import type { ReactNode } from 'react';
import type { TemplateView, TemplateWorkspace } from '@/lib/assessment-template-api-types';
import { displayAssessmentPoints } from '@/lib/assessment-draft-form';

export const secondary = 'inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-bold text-[var(--moss)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] disabled:cursor-not-allowed disabled:opacity-50';
export const primary = 'inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--moss)] px-5 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] disabled:cursor-not-allowed disabled:opacity-50';
export const field = 'min-h-11 min-w-0 rounded-md border border-[var(--line)] bg-white px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]';
export const libraryPath = (workspace: TemplateWorkspace) => workspace === 'admin' ? '/admin/templates' : '/teach/templates';
export const classPath = (workspace: TemplateWorkspace, id: string) => workspace === 'admin' ? `/admin/classes/${id}` : `/teach/${id}`;
export function TemplateFrame({ workspace, children }: { workspace: TemplateWorkspace; children: ReactNode }) {
  const Container = workspace === 'admin' ? 'div' : 'main';
  return <Container><div className={`mx-auto max-w-6xl space-y-6 ${workspace === 'admin' ? '' : 'px-5 py-6 sm:px-8'}`}>{children}</div></Container>;
}
export function TemplateAccess({ loading, stopped, error, retry, busy = false }: { loading: boolean; stopped: boolean; error: string | null; retry: () => void; busy?: boolean }) {
  return <>{error ? <p role="alert" aria-label="Template access error" className="rounded-lg border border-[var(--coral)] bg-[var(--coral-soft)] p-4 text-sm">{error}</p> : null}<section aria-label="Template access verification" className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5"><p role="status" className="text-sm">{stopped ? 'Account changed. Reopen this workspace to continue.' : loading ? 'Checking your account and private template access…' : 'Recheck access to show the private workspace.'}</p>{!stopped ? <button type="button" className={secondary} disabled={loading || busy} onClick={retry}>Retry template preview</button> : <Link className={secondary} href="/auth">Reopen account workspace</Link>}</section></>;
}
export function TemplateQuestions({ questions, label = 'Template questions' }: { questions: TemplateView['questions']; label?: string }) {
  return <ol className="space-y-3" aria-label={label}>{questions.map((item, index) => <li key={item.questionVersionId} className="min-w-0 rounded-lg border border-[var(--line)] p-4"><h3 className="break-words text-base font-bold">{index + 1}. {item.question?.title ?? 'Unavailable question version'}</h3><p className="text-sm text-[var(--muted)]">{displayAssessmentPoints(item.maxUnits)} points</p>{item.question ? <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-bold underline">Preview question {index + 1}</summary><p className="whitespace-pre-wrap break-words text-sm leading-6">{item.question.prompt}</p><ul className="list-disc space-y-2 pl-5 text-sm">{item.question.options.map(option => <li key={option.id}>{option.text}</li>)}</ul></details> : <p className="text-sm text-[var(--muted)]">Replace this exact version with a reviewed question before making new content.</p>}</li>)}</ol>;
}
