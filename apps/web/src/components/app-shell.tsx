'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import Link from 'next/link';
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
  if (pathname === '/practice') return <ShellContext.Provider value={true}><a className="skip-link" href="#page-content">Skip to content</a><div id="page-content" tabIndex={-1}>{children}</div></ShellContext.Provider>;
  if (pathname === '/' || pathname === '/auth' || pathname.startsWith('/admin')) return children;
  const title = groups.flatMap(group => group.items).find(item => item.href === pathname)?.label ?? 'Your account';
  return <ShellContext.Provider value={true}><div className="learner-shell">
    <a className="skip-link" href="#page-content">Skip to content</a>
    <header className="shell-mobile-header"><Link className="shell-brand" href="/" onNavigate={() => setMenuOpen(false)}><span className="shell-mark">M</span>Method</Link><button className="shell-menu-button" aria-expanded={menuOpen} aria-controls="learner-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}{menuOpen ? 'Close menu' : 'Menu'}</button></header>
    <aside className={`shell-rail ${menuOpen ? 'is-open' : ''}`} id="learner-navigation">
      <Link className="shell-brand" href="/" onNavigate={() => setMenuOpen(false)}><span className="shell-mark">M</span>Method<span className="shell-brand-dot">·</span></Link>
      <nav aria-label="Primary navigation">
        <Link className="shell-home" href="/" onNavigate={() => setMenuOpen(false)}>Home <ArrowUpRight size={14} /></Link>
        {groups.map(group => <div className="shell-nav-group" key={group.label}><p>{group.label}</p>{group.items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined} onNavigate={() => setMenuOpen(false)}><Icon size={18} strokeWidth={1.7} />{label}</Link>)}</div>)}
      </nav>
      <div className="shell-account"><Link href="/settings" onNavigate={() => setMenuOpen(false)}><Settings size={17} />Settings</Link><Link href="/onboarding" onNavigate={() => setMenuOpen(false)}>Set learning goals</Link><Link href="/requests" onNavigate={() => setMenuOpen(false)}><MessageSquare size={17} />Feedback</Link>{viewer?.canAccessAdministration ? <Link href="/admin" onNavigate={() => setMenuOpen(false)}>Administration <ArrowUpRight size={14} /></Link> : null}<Link className="shell-identity" href={viewer ? '/settings' : '/auth'} onNavigate={() => setMenuOpen(false)}><span className="shell-user-icon">{(viewer?.displayName || 'G').slice(0, 1).toUpperCase()}</span><span><strong>{viewer?.displayName || 'Guest learner'}</strong><small>{viewer ? 'Account settings' : 'Sign in to save progress'}</small></span></Link></div>
    </aside>
    <div className="shell-body"><div className="shell-pagebar"><span>Workspace <span aria-hidden="true">/</span> <strong>{title}</strong></span><Link href="/roadmap">Explore questions <ArrowUpRight size={14} /></Link></div><div id="page-content" tabIndex={-1}>{children}</div></div>
    <nav className="shell-bottom-nav" aria-label="Mobile navigation">{[{href:'/dashboard',label:'Dashboard',icon:LayoutDashboard},{href:'/roadmap',label:'Roadmap',icon:Compass},{href:'/practice',label:'Practice',icon:Braces},{href:'/classes',label:'Classes',icon:GraduationCap}].map(({href,label,icon:Icon})=><Link key={href} href={href} aria-current={pathname===href?'page':undefined} onNavigate={() => setMenuOpen(false)}><Icon size={19}/>{label}</Link>)}</nav>
  </div></ShellContext.Provider>;
}
