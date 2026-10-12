import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { practiceItems } from '@/lib/content';
import { createReviewStore } from '@/lib/review-store';

const activityForConcept = (conceptId: string) =>
  practiceItems.find((item) => item.conceptIds.includes(conceptId));

export async function GET() {
  const store = createReviewStore();
  try {
    const session = await requireAuth();
    const reviews = await store.list(session.user.id);
    return NextResponse.json({ reviews: reviews.map((review) => {
      const activity = activityForConcept(review.conceptId);
      return {
        ...review,
        practiceItemId: activity?.id ?? null,
        label: activity?.label ?? review.conceptId.replace(/[-_]+/g, ' '),
      };
    }) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to load reviews' }, { status: 500 });
  } finally {
    await store.close();
  }
}

export async function POST(request: Request) {
  const store = createReviewStore();
  try {
    const session = await requireAuth();
    const body = await request.json().catch(() => null) as { reviewId?: unknown; snoozeDays?: unknown } | null;
    if (!body || typeof body.reviewId !== 'string' || ![1, 3, 7].includes(body.snoozeDays as number)) {
      return NextResponse.json({ error: 'reviewId and supported snoozeDays are required' }, { status: 400 });
    }
    const review = await store.snooze(session.user.id, body.reviewId, body.snoozeDays as 1 | 3 | 7);
    if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    return NextResponse.json({ review });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to snooze review' }, { status: 500 });
  } finally {
    await store.close();
  }
}
