'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ensureApplicationUser, mergeGuestProgressIntoUser } from '@/lib/auth/session';
import { applicationUrl, safeAppDestination } from '@/lib/app-url';

const destination = (formData: FormData) => formData.get('accountType') === 'instructor' ? '/teach' : safeAppDestination(formData.get('next'));

function authNotice(formData: FormData, kind: 'error' | 'message', message: string, next = destination(formData)) {
  return `/auth?${new URLSearchParams({ next, account: formData.get('accountType') === 'instructor' ? 'instructor' : 'learner', [kind]: message })}`;
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(authNotice(formData, 'error', 'Invalid email or password.'));
  if (data.user) {
    await ensureApplicationUser({ id: data.user.id, email: data.user.email, displayName: data.user.user_metadata.display_name ?? null });
    await mergeGuestProgressIntoUser(data.user.id);
  }
  redirect(destination(formData));
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const displayName = String(formData.get('displayName') ?? '').trim().replace(/\s+/g, ' ');
  if (displayName.length < 2 || displayName.length > 80) redirect(authNotice(formData, 'error', 'Enter a name of 2 to 80 characters.'));
  if (password.length < 8) redirect(authNotice(formData, 'error', 'Use a password of at least 8 characters.'));
  const supabase = await createSupabaseServerClient();
  const next = formData.get('accountType') === 'instructor' ? '/teach/start' : destination(formData);
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: `${applicationUrl()}/auth/confirm?next=${encodeURIComponent(next)}` } });
  if (error) redirect(authNotice(formData, 'error', error.message));
  if (data.session && data.user) {
    await ensureApplicationUser({ id: data.user.id, email: data.user.email, displayName: data.user.user_metadata.display_name ?? null });
    await mergeGuestProgressIntoUser(data.user.id);
    redirect(next);
  }
  redirect(authNotice(formData, 'message', 'Check your email to confirm your account, then sign in to continue.', next));
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/');
}
