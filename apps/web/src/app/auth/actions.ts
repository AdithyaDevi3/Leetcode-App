'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ensureApplicationUser, mergeGuestProgressIntoUser } from '@/lib/auth/session';
import { applicationUrl, safeAppDestination } from '@/lib/app-url';

const destination = (formData: FormData) => safeAppDestination(formData.get('next'));

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/auth?error=${encodeURIComponent('Invalid email or password.')}`);
  if (data.user) {
    await ensureApplicationUser({ id: data.user.id, email: data.user.email, displayName: data.user.user_metadata.display_name ?? null });
    await mergeGuestProgressIntoUser(data.user.id);
  }
  redirect(destination(formData));
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (password.length < 8) redirect(`/auth?error=${encodeURIComponent('Use a password of at least 8 characters.')}`);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${applicationUrl()}/auth/confirm` } });
  if (error) redirect(`/auth?error=${encodeURIComponent(error.message)}`);
  redirect('/auth?message=Check your email to confirm your account.');
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/');
}
