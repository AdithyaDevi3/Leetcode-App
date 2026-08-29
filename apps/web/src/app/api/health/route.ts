import { headers } from 'next/headers';
import { requestIdHeader } from '@/lib/request-correlation';

export async function GET() {
  const requestHeaders = await headers();
  return Response.json({
    status: 'ok',
    service: 'method-web',
    requestId: requestHeaders.get(requestIdHeader) ?? null,
  });
}
