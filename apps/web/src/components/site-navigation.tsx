"use client";

/* Full document navigation avoids stale client-router assets after a deployment. */
/* eslint-disable @next/next/no-html-link-for-pages */

import { useAppShell } from "@/components/app-shell";
import { useViewer } from '@/lib/use-viewer';

const navigationItems = [
  { href: "/practice", label: "Practice" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/teach", label: "Teach" },
] as const;

type SiteNavigationProps = {
  currentPath?: string;
};

export function SiteNavigation({ currentPath }: SiteNavigationProps) {
  const viewer = useViewer();
  const inShell = useAppShell();
  if (inShell) return null;
  const items = viewer
    ? [...navigationItems, ...(viewer.canAccessAdministration ? [{ href: '/admin', label: 'Admin' }] : [])]
    : [...navigationItems, { href: '/auth', label: 'Sign in' }];
  return (
    <nav
      aria-label="Primary navigation"
      className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[var(--line)] pb-4"
    >
      <a
        aria-current={currentPath === "/" ? "page" : undefined}
        className="flex shrink-0 items-center gap-2 font-bold text-[var(--ink)] no-underline"
        href="/"
      >
        <span className="grid h-8 w-8 place-items-center rounded-md bg-[var(--mustard)] font-mono text-sm">M</span>
        Method
      </a>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1 max-sm:basis-full max-sm:justify-start">
        {items.map((item) => {
          const active = currentPath === item.href;
          return (
            <a
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-semibold no-underline transition ${active ? "bg-[var(--moss)] text-white" : "text-[var(--moss)] hover:bg-[var(--moss-soft)]"}`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          );
        })}
        {viewer ? <span className="px-2.5 py-2 text-sm font-semibold text-[var(--muted)]" aria-label="Signed-in learner">
          {viewer.displayName?.trim() || viewer.email?.split('@')[0] || 'Signed in'}
        </span> : null}
      </div>
    </nav>
  );
}
