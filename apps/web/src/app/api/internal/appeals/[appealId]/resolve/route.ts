import { NextResponse } from 'next/server';
import { resolveRuntimeAppeal } from '@/lib/evaluation-appeal-runtime';

export async function POST(request: Request, { params }: { params: Promise<{ appealId: string }> }) {
  const token = process.env.EVALUATION_REVIEWER_TOKEN;
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as { reviewerId?: unknown; approved?: unknown; reason?: unknown } | null;
  if (!body || typeof body.reviewerId !== 'string' || typeof body.approved !== 'boolean' || typeof body.reason !== 'string') return NextResponse.json({ error: 'reviewerId, approved, and reason are required' }, { status: 400 });
  try {
    const { appealId } = await params;
    const appeal = await resolveRuntimeAppeal(appealId, { reviewerId: body.reviewerId, approved: body.approved, reason: body.reason });
    if (!appeal) return NextResponse.json({ error: 'Appeal not found or already resolved' }, { status: 404 });
    return NextResponse.json({ appeal });
  } catch (error) {
    if (error instanceof Error && error.message === 'Override reason is required') return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: 'Failed to resolve appeal' }, { status: 500 });
  }
}
