import type { AdministrationAction } from '@leetcode-app/domain';
import { canPerformAdministrationAction } from '@leetcode-app/domain';
import { signOut } from '@/app/auth/actions';
import type { AdministrationPrincipal } from '@/lib/admin/authorization';

/* Full document navigation avoids stale client-router assets after a deployment. */
/* eslint-disable @next/next/no-html-link-for-pages */

const adminLinks: Array<{ href: string; label: string; action: AdministrationAction }> = [
  { href: '/admin', label: 'Overview', action: 'administration.access' },
  { href: '/admin/users', label: 'People & roles', action: 'users.read' },
  { href: '/admin/content', label: 'Content', action: 'content.read' },
  { href: '/admin/operations', label: 'Operations', action: 'operations.read' },
  { href: '/admin/feedback', label: 'Feedback', action: 'support.read' },
  { href: '/admin/privacy', label: 'Privacy', action: 'privacy.read' },
  { href: '/admin/audit', label: 'Audit log', action: 'audit.read' },
];

const roleLabel = (role: string) => role.replaceAll('_', ' ');

export function AdminShell({ principal, children }: { principal: AdministrationPrincipal; children: React.ReactNode }) {
  const links = adminLinks.filter((link) => canPerformAdministrationAction(principal.roles, link.action));
  const displayName = principal.displayName?.trim() || principal.email?.split('@')[0] || 'Operator';

  return <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
    <aside className="border-b border-[#35443a] bg-[var(--ink)] px-5 py-5 text-[#f8f6ef] lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
      <div className="flex items-center justify-between gap-4 lg:block">
        <a className="flex items-center gap-3 font-bold text-white no-underline" href="/admin">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-[var(--mustard)] font-mono text-sm text-[var(--ink)]">M</span>
          <span><span className="block text-lg leading-none">Method</span><span className="mt-1 block text-[10px] uppercase tracking-[0.16em] text-[#aeb8b0]">Administration</span></span>
        </a>
        <a className="text-xs font-bold text-[#cad1cb] underline underline-offset-4 lg:hidden" href="/">Learner app</a>
      </div>

      <nav aria-label="Administration navigation" className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:mt-9 lg:grid lg:gap-1 lg:overflow-visible">
        {links.map((link) => <a className="flex min-h-10 shrink-0 items-center rounded-md px-3 text-sm font-semibold text-[#cad1cb] no-underline hover:bg-[#29372f] hover:text-white" href={link.href} key={link.href}>{link.label}</a>)}
      </nav>

      <div className="mt-5 border-t border-[#35443a] pt-5 lg:absolute lg:inset-x-6 lg:bottom-7">
        <p className="mb-1 truncate text-sm font-bold">{displayName}</p>
        <p className="mb-3 truncate text-xs text-[#aeb8b0]">{principal.roles.map(roleLabel).join(' · ')}</p>
        <div className="flex flex-wrap gap-3 text-xs font-bold">
          <a className="text-[#cad1cb] underline underline-offset-4" href="/">Learner app</a>
          <form action={signOut}><button className="border-0 bg-transparent p-0 text-[#cad1cb] underline underline-offset-4" type="submit">Sign out</button></form>
        </div>
      </div>
    </aside>
    <main className="min-w-0 px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
      <div className="mx-auto w-full max-w-[1280px]">{children}</div>
    </main>
  </div>;
}
