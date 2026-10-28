import { NextResponse } from 'next/server';
import { buildInitialLearningPlan, validateLearnerProfile, type LearnerProfile } from '@leetcode-app/domain';
import { getSession } from '@/lib/auth/session';
import { createPersonalizationStore } from '@/lib/personalization-store';
import { decodeQuizRequest, QuizInputError } from '@/lib/quiz-assignment-input';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, x-learning-owner' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const ownerChanged = () => json({ error: 'Your signed-in account changed. Reload your learning preferences.', code: 'owner_changed' }, 409);

export async function GET(request: Request) {
  let store: ReturnType<typeof createPersonalizationStore> | undefined;
  try {
    const session = await getSession({ failOnAuthError: true });
    if (!session) return json({ error: 'Authentication required' }, 401);
    const expectedOwner = request.headers.get('x-learning-owner');
    if (expectedOwner !== null && expectedOwner !== session.user.id) return ownerChanged();
    store = createPersonalizationStore();
    const profile = await store.getProfile(session.user.id);
    return json({ learnerId: session.user.id, profile });
  } catch {
    return json({ error: 'Your learning preferences are temporarily unavailable. Please try again.' }, 503);
  } finally { await store?.close().catch(() => undefined); }
}

export async function PUT(request: Request) {
  let store: ReturnType<typeof createPersonalizationStore> | undefined;
  try {
    const session = await getSession({ failOnAuthError: true });
    if (!session) return json({ error: 'Authentication required' }, 401);
    if (request.headers.get('x-learning-owner') !== session.user.id) return ownerChanged();
    const value = await decodeQuizRequest(request, 16_000);
    const allowed = ['goal', 'targetDate', 'experience', 'preferredLanguage', 'weeklyMinutes', 'timezone', 'accessibilityNotes', 'diagnosticOptIn', 'personalizationOptOut'];
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !allowed.includes(key))) return json({ error: 'Use a valid learner profile.' }, 400);
    const profile = value as LearnerProfile;
    const errors = validateLearnerProfile(profile);
    if (errors.length) return json({ error: 'Invalid learner profile', details: errors }, 400);
    store = createPersonalizationStore();
    const saved = await store.upsertProfile(session.user.id, profile);
    return json({ learnerId: session.user.id, profile: saved, plan: buildInitialLearningPlan(saved) });
  } catch (error) {
    if (error instanceof QuizInputError) return json({ error: 'Use a valid learner profile.' }, error.status);
    return json({ error: 'Your learning preferences could not be saved. Please try again.' }, 503);
  } finally { await store?.close().catch(() => undefined); }
}
