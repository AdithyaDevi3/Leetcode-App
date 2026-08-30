import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ensureApplicationUser, mergeGuestProgressIntoUser } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/practice', request.url));
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return response;
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const { data } = await supabase.auth.exchangeCodeForSession(code);
  if (data.user) {
    await ensureApplicationUser({ id: data.user.id, email: data.user.email, displayName: data.user.user_metadata.display_name ?? null });
    await mergeGuestProgressIntoUser(data.user.id);
  }
  return response;
}
