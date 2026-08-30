import Link from 'next/link';
import { signInWithPassword, signUpWithPassword } from './actions';

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const { error, message, next } = await searchParams;
  return <main className="mx-auto flex min-h-screen max-w-md items-center px-6"><form className="w-full space-y-5 rounded-xl border border-slate-700 bg-slate-900 p-7 text-slate-100">
    <h1 className="text-2xl font-bold">Save your progress</h1><p className="text-sm text-slate-300">Create an account, or sign in to continue where you left off.</p>
    {error && <p className="rounded bg-red-950 p-3 text-sm text-red-200">{error}</p>}{message && <p className="rounded bg-cyan-950 p-3 text-sm text-cyan-100">{message}</p>}
    <input type="hidden" name="next" value={next ?? '/practice'} /><label className="block text-sm">Email<input required name="email" type="email" autoComplete="email" className="mt-1 w-full rounded bg-slate-800 p-3" /></label>
    <label className="block text-sm">Password<input required name="password" type="password" minLength={8} autoComplete="current-password" className="mt-1 w-full rounded bg-slate-800 p-3" /></label>
    <div className="grid grid-cols-2 gap-3"><button formAction={signInWithPassword} className="rounded bg-cyan-300 p-3 font-semibold text-slate-950">Sign in</button><button formAction={signUpWithPassword} className="rounded border border-slate-500 p-3">Create account</button></div>
    <Link className="block text-center text-sm underline" href="/practice">Continue as guest</Link>
  </form></main>;
}
