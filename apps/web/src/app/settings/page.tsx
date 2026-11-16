import Link from 'next/link';
import { signOut } from '@/app/auth/actions';
import { LearningSettingsBoundary } from '@/components/learning-settings-boundary';
import { getSession } from '@/lib/auth/session';

export default async function SettingsPage() {
  const session = await getSession();
  return <><main className="border-b border-[var(--line)] bg-[var(--surface)] px-6 py-4 text-[var(--ink)]"><div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold">Account</p><p className="text-sm text-[var(--muted)]">{session ? session.user.email : 'Sign in to save settings and join shared workspaces.'}</p></div>{session ? <form action={signOut}><button className="inline-flex min-h-11 items-center rounded-md border border-[var(--line)] px-4 text-sm font-bold text-[var(--moss)]" type="submit">Sign out</button></form> : <Link className="inline-flex min-h-11 items-center rounded-md bg-[var(--moss)] px-4 text-sm font-bold text-white" href="/auth?next=%2Fsettings">Sign in</Link>}</div></main><LearningSettingsBoundary /></>;
}
