import { SiteNavigation } from '@/components/site-navigation';

/* Full document navigation avoids stale client-router assets after a deployment. */
/* eslint-disable @next/next/no-html-link-for-pages */

export function AdminAccessDenied() {
  return <main className="min-h-screen px-5 py-8 sm:px-8 sm:py-12">
    <div className="mx-auto max-w-5xl">
      <SiteNavigation />
      <section className="mx-auto mt-16 max-w-xl rounded-xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center shadow-[0_18px_50px_rgba(34,46,38,0.08)]">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--coral)]">Restricted workspace</p>
        <h1 className="text-3xl font-bold">Administration access required</h1>
        <p className="mx-auto mt-4 max-w-md leading-7 text-[var(--muted)]">Your account is signed in, but it has no operator role for this workspace. Ask an administrator to assign the appropriate role.</p>
        <a className="mt-7 inline-flex min-h-11 items-center rounded-md bg-[var(--moss)] px-5 font-bold text-white no-underline" href="/">Return to Method</a>
      </section>
    </div>
  </main>;
}

export function AdminAreaDenied() {
  return <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-8">
    <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--coral)]">Permission required</p>
    <h1 className="text-2xl font-bold">This area is not available for your role</h1>
    <p className="mt-3 max-w-xl text-[var(--muted)]">The portal is working, but your current operator assignment does not include this data.</p>
    <a className="mt-6 inline-flex font-bold text-[var(--moss)] underline underline-offset-4" href="/admin">Back to overview</a>
  </section>;
}
