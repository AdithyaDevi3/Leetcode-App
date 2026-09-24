'use client';

/* eslint-disable @next/next/no-html-link-for-pages */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { BookOpen, Braces, Compass, GraduationCap, History, LayoutDashboard, Menu, X, Settings, MessageSquare, GitBranch, ArrowUpRight } from 'lucide-react';
import { useViewer } from '@/lib/use-viewer';

const ShellContext = createContext(false);
export const useAppShell = () => useContext(ShellContext);
const groups = [
  { label: 'LEARN', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }, { href: '/roadmap', label: 'Roadmap', icon: Compass }, { href: '/learn', label: 'Learning plan', icon: BookOpen }] },
  { label: 'PRACTICE', items: [{ href: '/practice', label: 'Practice', icon: Braces }, { href: '/system-design', label: 'System design', icon: GitBranch }, { href: '/history', label: 'History', icon: History }] },
  { label: 'YOUR SPACE', items: [{ href: '/classes', label: 'Classes', icon: GraduationCap }, { href: '/teach', label: 'Instructor workspace', icon: GraduationCap }, { href: '/library', label: 'Library', icon: BookOpen }] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const viewer = useViewer();
  const [menuOpen, setMenuOpen] = useState(false);
  if (pathname === '/' || pathname === '/auth' || pathname.startsWith('/admin')) return children;
  const title = groups.flatMap(group => group.items).find(item => item.href === pathname)?.label ?? 'Your account';
  return <ShellContext.Provider value={true}><div className="learner-shell">
    <a className="skip-link" href="#page-content">Skip to content</a>
    <header className="shell-mobile-header"><a className="shell-brand" href="/"><span className="shell-mark">M</span>Method</a><button className="shell-menu-button" aria-expanded={menuOpen} aria-controls="learner-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}{menuOpen ? 'Close menu' : 'Menu'}</button></header>
    <aside className={`shell-rail ${menuOpen ? 'is-open' : ''}`} id="learner-navigation">
      <a className="shell-brand" href="/"><span className="shell-mark">M</span>Method<span className="shell-brand-dot">·</span></a>
      <nav aria-label="Primary navigation">
        <a className="shell-home" href="/">Home <ArrowUpRight size={14} /></a>
        {groups.map(group => <div className="shell-nav-group" key={group.label}><p>{group.label}</p>{group.items.map(({ href, label, icon: Icon }) => <a key={href} href={href} aria-current={pathname === href ? 'page' : undefined} onClick={() => setMenuOpen(false)}><Icon size={18} strokeWidth={1.7} />{label}</a>)}</div>)}
      </nav>
      <div className="shell-account"><a href="/settings"><Settings size={17} />Settings</a><a href="/onboarding">Set learning goals</a><a href="/requests"><MessageSquare size={17} />Feedback</a>{viewer?.canAccessAdministration ? <a href="/admin">Administration <ArrowUpRight size={14} /></a> : null}<a className="shell-identity" href={viewer ? '/settings' : '/auth'}><span className="shell-user-icon">{(viewer?.displayName || 'G').slice(0, 1).toUpperCase()}</span><span><strong>{viewer?.displayName || 'Guest learner'}</strong><small>{viewer ? 'Account settings' : 'Sign in to save progress'}</small></span></a></div>
    </aside>
    <div className="shell-body"><div className="shell-pagebar"><span>Workspace <span aria-hidden="true">/</span> <strong>{title}</strong></span><a href="/roadmap">Explore questions <ArrowUpRight size={14} /></a></div><div id="page-content" tabIndex={-1}>{children}</div></div>
    <nav className="shell-bottom-nav" aria-label="Mobile navigation">{[{href:'/dashboard',label:'Dashboard',icon:LayoutDashboard},{href:'/roadmap',label:'Roadmap',icon:Compass},{href:'/practice',label:'Practice',icon:Braces},{href:'/classes',label:'Classes',icon:GraduationCap}].map(({href,label,icon:Icon})=><a key={href} href={href} aria-current={pathname===href?'page':undefined}><Icon size={19}/>{label}</a>)}</nav>
  </div></ShellContext.Provider>;
}
