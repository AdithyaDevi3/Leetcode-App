import { freezeQuizQuestionSelection } from '@leetcode-app/domain';
import { assessmentUuid } from '@/lib/assessment-draft-input';
import { readQuizAuthorData } from '@/lib/quiz-assignment.server';
import { decodeQuizRequest, parseQuizPublicationRequest, QuizInputError } from '@/lib/quiz-assignment-input';
import { quizFailure, quizJson, quizOwnerChanged, quizUnauthorized, quizWorkspace } from '@/lib/quiz-assignment-http';
import { getReviewedQuestionVersion } from '@/lib/question-bank.server';

export const runtime = 'nodejs';
type Context = { params: Promise<{ draftId: string }> };

export async function GET(request: Request, { params }: Context) {
  const workspace = quizWorkspace(request);
  const { draftId } = await params;
  if (!workspace || !assessmentUuid.test(draftId)) return quizJson({ error: 'Choose a valid draft and authoring workspace.' }, 400);
  try {
    const access = await readQuizAuthorData(workspace, async (repository, author) => {
      const expectedAuthor = request.headers.get('x-assessment-author');
      if (expectedAuthor !== null && expectedAuthor !== author.id) return { ownerChanged: true as const };
      const context = await repository.readAuthorDraft(draftId);
      return { ...context, learners: context.learners.map(({ id, displayName }) => ({ id, displayName })) };
    });
    if (access.status !== 'authorized') return quizUnauthorized(access.status);
    return 'ownerChanged' in access.data ? quizOwnerChanged() : quizJson(access.data);
  } catch (error) { return quizFailure(error); }
}

export async function POST(request: Request, { params }: Context) {
  const workspace = quizWorkspace(request);
  const { draftId } = await params;
  if (!workspace || !assessmentUuid.test(draftId)) return quizJson({ error: 'Choose a valid draft and authoring workspace.' }, 400);
  try {
    const access = await readQuizAuthorData(workspace, async (repository, author) => {
      if (request.headers.get('x-assessment-author') !== author.id) return { ownerChanged: true as const };
      const input = parseQuizPublicationRequest(await decodeQuizRequest(request));
      const context = await repository.readAuthorDraft(draftId);
      // A receipt replay must not depend on today's mutable draft or catalog.
      // The repository alone validates replay identity and current authority.
      const snapshot = context.publication ? undefined : freezeQuizQuestionSelection(context.draft.questions.map(selection => {
        const question = getReviewedQuestionVersion(selection.questionVersionId);
        if (!question) throw new QuizInputError('A selected question is unavailable. Update the private draft before assigning.');
        return { question, maxUnits: selection.maxUnits };
      }));
      const publication = await repository.publishDraft({ ...input, draftId, snapshot, reason: 'Author assigned a saved class quiz' });
      return { publication };
    });
    if (access.status !== 'authorized') return quizUnauthorized(access.status);
    return 'ownerChanged' in access.data ? quizOwnerChanged() : quizJson(access.data, 201);
  } catch (error) { return quizFailure(error); }
}
