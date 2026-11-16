import 'server-only';
import {
  freezeOriginalInterviewExercise,
  validateInterviewCore250Catalog,
  type InterviewCurriculumTopic,
  type OriginalInterviewExercise,
  type QuestionVersion,
} from '@leetcode-app/domain';
import { interviewCore250SeedQuestions } from './questions';
import { interviewCore250Batch2Questions } from './questions-batch-2';
import { interviewCore250Batch3Questions } from './questions-batch-3';
import { interviewCore250Batch4Questions } from './questions-batch-4';
import { interviewCore250Batch5Questions } from './questions-batch-5';
import { interviewCore250Batch6Questions } from './questions-batch-6';
import { interviewCore250Batch7Questions } from './questions-batch-7';
import { interviewCore250Batch8Questions } from './questions-batch-8';
import { interviewCore250Batch9Questions } from './questions-batch-9';
import { interviewCore250Batch10Questions } from './questions-batch-10';
import { interviewCore250Batch11Questions } from './questions-batch-11';
import { interviewCore250Batch12Questions } from './questions-batch-12';
import { interviewCore250Batch13Questions } from './questions-batch-13';

/** Unpublished original material. Add batches here only after their local checks pass. */
export const interviewCore250QuestionCandidates: readonly QuestionVersion[] = Object.freeze([
  ...interviewCore250SeedQuestions,
  ...interviewCore250Batch2Questions,
  ...interviewCore250Batch3Questions,
  ...interviewCore250Batch4Questions,
  ...interviewCore250Batch5Questions,
  ...interviewCore250Batch6Questions,
  ...interviewCore250Batch7Questions,
  ...interviewCore250Batch8Questions,
  ...interviewCore250Batch9Questions,
  ...interviewCore250Batch10Questions,
  ...interviewCore250Batch11Questions,
  ...interviewCore250Batch12Questions,
  ...interviewCore250Batch13Questions,
]);

export function validateInterviewCore250QuestionCandidates(items = interviewCore250QuestionCandidates): readonly QuestionVersion[] {
  if (new Set(items.map(item => item.questionId)).size !== items.length) throw new Error('Curriculum question IDs must be unique.');
  if (!items.every(item => item.status === 'in_review' && item.review === null && item.provenance.kind === 'original')) throw new Error('Curriculum questions must remain original and review-gated.');
  return items;
}

const curriculumTopics = new Set<InterviewCurriculumTopic>([
  'arrays-hashing', 'two-pointers', 'sliding-window', 'binary-search', 'linked-lists', 'stacks',
  'trees', 'tries', 'backtracking', 'heaps', 'graphs', 'advanced-graphs',
  'dynamic-programming-1d', 'dynamic-programming-2d', 'greedy', 'intervals',
  'bit-manipulation', 'math-geometry',
]);

const estimatedMinutes = (difficulty: QuestionVersion['difficulty']): number =>
  difficulty === 'foundation' ? 8 : difficulty === 'intermediate' ? 12 : 18;

/** Metadata-only catalog. Question keys remain in the server-only question modules. */
export const interviewCore250ExerciseCatalog: readonly OriginalInterviewExercise[] = Object.freeze(
  validateInterviewCore250Catalog(interviewCore250QuestionCandidates.map(question => {
    const topic = question.conceptIds.find((concept): concept is InterviewCurriculumTopic => curriculumTopics.has(concept as InterviewCurriculumTopic));
    if (!topic) throw new Error(`Curriculum question ${question.questionId} has no supported topic.`);
    const primarySkillId = question.conceptIds.find(concept => concept !== topic) ?? topic;
    const misconceptionIds = [...new Set(question.options.flatMap(option => option.misconceptionTags))].slice(0, 8);
    return freezeOriginalInterviewExercise({
      id: question.questionId,
      topic,
      primarySkillId,
      difficulty: question.difficulty,
      estimatedMinutes: estimatedMinutes(question.difficulty),
      format: 'multiple_choice',
      prerequisiteIds: [],
      misconceptionIds,
      provenance: question.provenance,
      status: 'in_review',
      reviewerId: null,
    });
  })),
);
