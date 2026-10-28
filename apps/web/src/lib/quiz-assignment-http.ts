import { NextResponse } from 'next/server';
import { QuizAssignmentAccessError, QuizAssignmentConflictError, QuizAssignmentValidationError } from '@leetcode-app/database';
import type { AssessmentWorkspace } from '@/lib/assessment-author';
import { QuizInputError } from './quiz-assignment-input';

export const quizJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export function quizWorkspace(request: Request): AssessmentWorkspace | null {
  const workspace = new URL(request.url).searchParams.get('workspace');
  return workspace === 'admin' || workspace === 'teach' ? workspace : null;
}
export const quizOwnerChanged = () => quizJson({ code: 'owner_changed', error: 'Your account changed. Reopen this workspace to continue; your entries stay in this tab.' }, 409);
export const quizUnauthorized = (status: 'unauthenticated' | 'forbidden') => quizJson({ error: status === 'unauthenticated' ? 'Sign in to access this quiz.' : 'Quiz permission is required.' }, status === 'unauthenticated' ? 401 : 403);
export function quizFailure(error: unknown) {
  if (error instanceof QuizInputError) return quizJson({ error: error.message }, error.status);
  if (error instanceof QuizAssignmentAccessError) return quizJson({ error: 'Quiz not found or not available.' }, 404);
  if (error instanceof QuizAssignmentConflictError) return quizJson({ code: 'quiz_conflict', reason: error.code, error: error.message }, 409);
  if (error instanceof QuizAssignmentValidationError) return quizJson({ error: error.message }, 400);
  return quizJson({ error: 'Quiz service is temporarily unavailable. Your entries are preserved; retry the request.' }, 503);
}
