import { assessmentUuid } from '@/lib/assessment-draft-input';
import { readQuizLearnerData } from '@/lib/quiz-assignment.server';
import { decodeQuizRequest, parseQuizAnswerSaveRequest } from '@/lib/quiz-assignment-input';
import { quizFailure, quizJson, quizOwnerChanged, quizUnauthorized } from '@/lib/quiz-assignment-http';

export const runtime = 'nodejs';
type Context = { params: Promise<{ recipientId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { recipientId } = await params;
  if (!assessmentUuid.test(recipientId)) return quizJson({ error: 'Choose a valid quiz recipient.' }, 400);
  try {
    const access = await readQuizLearnerData(async (repository, learner) => {
      const expectedLearner = request.headers.get('x-quiz-learner');
      if (expectedLearner !== null && expectedLearner !== learner.id) return { ownerChanged: true as const };
      return { learnerId: learner.id, assignment: await repository.readLearnerQuiz(recipientId) };
    });
    if (access.status !== 'authorized') return quizUnauthorized(access.status);
    return 'ownerChanged' in access.data ? quizOwnerChanged() : quizJson(access.data);
  } catch (error) { return quizFailure(error); }
}

export async function POST(request: Request, { params }: Context) {
  const { recipientId } = await params;
  if (!assessmentUuid.test(recipientId)) return quizJson({ error: 'Choose a valid quiz recipient.' }, 400);
  try {
    const access = await readQuizLearnerData(async (repository, learner) => {
      if (request.headers.get('x-quiz-learner') !== learner.id) return { ownerChanged: true as const };
      const input = parseQuizAnswerSaveRequest(await decodeQuizRequest(request, 16_000));
      return repository.saveAnswers({ recipientId, ...input });
    });
    if (access.status !== 'authorized') return quizUnauthorized(access.status);
    return 'ownerChanged' in access.data ? quizOwnerChanged() : quizJson(access.data);
  } catch (error) { return quizFailure(error); }
}
