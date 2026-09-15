import type { ReactNode } from 'react';

export function AdminPageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
    <div className="max-w-3xl">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--coral)]">{eyebrow}</p>
      <h1 className="mb-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mb-0 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">{description}</p>
    </div>
    {action}
  </header>;
}

export function AdminMetric({ label, value, note }: { label: string; value: number | string; note: string }) {
  return <article className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_30px_rgba(34,46,38,0.05)]">
    <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
    <p className="mb-2 font-mono text-3xl font-bold text-[var(--ink)]">{value}</p>
    <p className="mb-0 text-sm text-[var(--muted)]">{note}</p>
  </article>;
}

export function AdminSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_10px_30px_rgba(34,46,38,0.05)]">
    <div className="border-b border-[var(--line)] px-5 py-4 sm:px-6">
      <h2 className="mb-1 text-lg font-bold">{title}</h2>
      {description ? <p className="mb-0 text-sm text-[var(--muted)]">{description}</p> : null}
    </div>
    {children}
  </section>;
}

export function AdminEmptyState({ children }: { children: ReactNode }) {
  return <div className="px-5 py-12 text-center text-sm text-[var(--muted)] sm:px-6">{children}</div>;
}

const badgeStyles: Record<string, string> = {
  published: 'bg-[var(--moss-soft)] text-[var(--moss)]',
  completed: 'bg-[var(--moss-soft)] text-[var(--moss)]',
  resolved: 'bg-[var(--moss-soft)] text-[var(--moss)]',
  active: 'bg-[var(--moss-soft)] text-[var(--moss)]',
  submitted: 'bg-[var(--sky)] text-slate-800',
  queued: 'bg-[var(--sky)] text-slate-800',
  requested: 'bg-[var(--sky)] text-slate-800',
  processing: 'bg-amber-100 text-amber-900',
  running: 'bg-amber-100 text-amber-900',
  in_review: 'bg-amber-100 text-amber-900',
  failed: 'bg-[var(--coral-soft)] text-red-900',
  rejected: 'bg-[var(--coral-soft)] text-red-900',
  canceled: 'bg-slate-200 text-slate-700',
  archived: 'bg-slate-200 text-slate-700',
  draft: 'bg-amber-100 text-amber-900',
};

export function AdminBadge({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${badgeStyles[value] ?? 'bg-slate-100 text-slate-700'}`}>
    {value.replaceAll('_', ' ')}
  </span>;
}

export function AdminTable({ children, label }: { children: ReactNode; label: string }) {
  return <div className="w-full overflow-x-auto"><table aria-label={label} className="w-full min-w-[680px] border-collapse text-left text-sm">{children}</table></div>;
}

export const adminTableHeadClass = 'border-b border-[var(--line)] bg-[#f0eee7] px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted)]';
export const adminTableCellClass = 'border-b border-[var(--line)] px-5 py-4 align-top last:border-b-0';

export function formatAdminDate(value: string | null): string {
  if (!value) return 'None';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
