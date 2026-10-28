import { assessmentUuid } from '@/lib/assessment-draft-input';
import { readQuizLearnerData } from '@/lib/quiz-assignment.server';
import { decodeQuizRequest, parseQuizSubmissionRequest } from '@/lib/quiz-assignment-input';
import { quizFailure, quizJson, quizOwnerChanged, quizUnauthorized } from '@/lib/quiz-assignment-http';

export const runtime = 'nodejs';
type Context = { params: Promise<{ recipientId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { recipientId } = await params;
  if (!assessmentUuid.test(recipientId)) return quizJson({ error: 'Choose a valid quiz recipient.' }, 400);
  try {
    const access = await readQuizLearnerData(async (repository, learner) => {
      if (request.headers.get('x-quiz-learner') !== learner.id) return { ownerChanged: true as const };
      const input = parseQuizSubmissionRequest(await decodeQuizRequest(request, 4_000));
      return { submission: await repository.submitQuiz({ recipientId, ...input }) };
    });
    if (access.status !== 'authorized') return quizUnauthorized(access.status);
    return 'ownerChanged' in access.data ? quizOwnerChanged() : quizJson(access.data, 201);
  } catch (error) { return quizFailure(error); }
}
