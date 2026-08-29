import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateRequestId, requestIdHeader } from '@/lib/request-correlation';

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const requestId = getOrCreateRequestId(requestHeaders.get(requestIdHeader));
  requestHeaders.set(requestIdHeader, requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(requestIdHeader, requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)'],
};
