import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { practiceItems } from '@/lib/content';
import { createReviewStore } from '@/lib/review-store';
import { decodeQuizRequest, QuizInputError } from '@/lib/quiz-assignment-input';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, x-learning-owner' };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });
const changed = () => json({ error: 'Your signed-in account changed. Reload your reviews.', code: 'owner_changed' }, 409);

const activityForConcept = (conceptId: string) =>
  practiceItems.find((item) => item.conceptIds.includes(conceptId));
const withActivity = <Review extends { conceptId: string }>(review: Review) => {
  const activity = activityForConcept(review.conceptId);
  return { ...review, practiceItemId: activity?.id ?? null,
    label: activity?.label ?? review.conceptId.replace(/[-_]+/g, ' ') };
};

export async function GET(request: Request) {
  let store: ReturnType<typeof createReviewStore> | undefined;
  try {
    const session = await getSession({ failOnAuthError: true });
    if (!session) return json({ error: 'Authentication required' }, 401);
    const expected = request.headers.get('x-learning-owner');
    if (expected !== null && expected !== session.user.id) return changed();
    store = createReviewStore();
    const reviews = await store.list(session.user.id);
    return json({ learnerId: session.user.id, reviews: reviews.map(withActivity) });
  } catch {
    return json({ error: 'Failed to load reviews' }, 503);
  } finally {
    await store?.close();
  }
}

export async function POST(request: Request) {
  let store: ReturnType<typeof createReviewStore> | undefined;
  try {
    const session = await getSession({ failOnAuthError: true });
    if (!session) return json({ error: 'Authentication required' }, 401);
    if (request.headers.get('x-learning-owner') !== session.user.id) return changed();
    const body = await decodeQuizRequest(request, 4_000) as { reviewId?: unknown; snoozeDays?: unknown } | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 2 || Object.keys(body).some(key => !['reviewId', 'snoozeDays'].includes(key))
      || typeof body.reviewId !== 'string' || body.reviewId.length < 1 || body.reviewId.length > 128
      || typeof body.snoozeDays !== 'number' || ![1, 3, 7].includes(body.snoozeDays)) {
      return json({ error: 'reviewId and supported snoozeDays are required' }, 400);
    }
    store = createReviewStore();
    const review = await store.snooze(session.user.id, body.reviewId, body.snoozeDays as 1 | 3 | 7);
    if (!review) return json({ error: 'Review not found' }, 404);
    return json({ learnerId: session.user.id, review: withActivity(review) });
  } catch (error) {
    if (error instanceof QuizInputError) return json({ error: 'Use a valid review request.' }, error.status);
    return json({ error: 'Failed to snooze review' }, 503);
  } finally {
    await store?.close();
  }
}
