import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ensureApplicationUser, mergeGuestProgressIntoUser } from '@/lib/auth/session';
import { safeAppDestination } from '@/lib/app-url';

export async function GET(request: NextRequest) {
  const destination = safeAppDestination(request.nextUrl.searchParams.get('next'));
  const response = NextResponse.redirect(new URL(destination, request.url));
  const code = request.nextUrl.searchParams.get('code');
  const failedConfirmation = () => {
    const query = new URLSearchParams({ next: destination, error: 'This confirmation link is invalid or expired. Sign in or request a new confirmation email.' });
    return NextResponse.redirect(new URL(`/auth?${query}`, request.url));
  };
  if (!code) return failedConfirmation();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return failedConfirmation();
  if (data.user) {
    await ensureApplicationUser({ id: data.user.id, email: data.user.email, displayName: data.user.user_metadata.display_name ?? null });
    await mergeGuestProgressIntoUser(data.user.id);
  }
  return response;
}
