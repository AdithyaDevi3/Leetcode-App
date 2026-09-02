import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getOrCreateRequestId, requestIdHeader } from '@/lib/request-correlation';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const requestId = getOrCreateRequestId(requestHeaders.get(requestIdHeader));
  requestHeaders.set(requestIdHeader, requestId);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!isSupabaseConfigured()) {
    response.headers.set(requestIdHeader, requestId);
    return response;
  }

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (values) => { values.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request: { headers: requestHeaders } }); values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); },
  } });
  await supabase.auth.getClaims();
  response.headers.set(requestIdHeader, requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)'],
};
