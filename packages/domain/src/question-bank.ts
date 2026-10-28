/** Answers and review metadata belong behind an authorized server boundary. */
export const MULTIPLE_CHOICE_SCORING_VERSION = 'multiple-choice-v1';
export type QuestionDifficulty = 'foundation' | 'intermediate' | 'advanced';
export type QuestionStatus = 'draft' | 'in_review' | 'reviewed' | 'retired';
export type QuestionOption = Readonly<{ id: string; text: string; misconceptionTags: readonly string[] }>;
export type QuestionReview = Readonly<{ reviewerId: string; reviewedAt: string; notes: string }>;
export type QuestionVersion = Readonly<{
  questionId: string;
  version: number;
  versionId: string;
  kind: 'multiple_choice';
  status: QuestionStatus;
  title: string;
  prompt: string;
  difficulty: QuestionDifficulty;
  activityIds: readonly string[];
  conceptIds: readonly string[];
  options: readonly QuestionOption[];
  correctOptionId: string;
  explanation: string;
  provenance: Readonly<{ kind: 'original'; authorId: string; authoredAt: string }>;
  review: QuestionReview | null;
}>;

/** An explicit learner projection; never spread a private question into a response. */
export type LearnerQuestion = Readonly<{
  questionId: string; version: number; versionId: string;
  kind: 'multiple_choice'; title: string; prompt: string; difficulty: QuestionDifficulty;
  activityIds: readonly string[]; conceptIds: readonly string[];
  options: readonly Readonly<{ id: string; text: string }>[];
}>;
export type QuizQuestionSelection = Readonly<{ question: QuestionVersion; maxUnits: number }>;
export type QuizAnswers = Readonly<Record<string, string | null>>;
export type MultipleChoiceAssignmentResponse = Readonly<{ kind: 'multiple_choice'; answers: QuizAnswers; text?: never; language?: never }>;
export type MultipleChoiceQuizSnapshot = Readonly<{
  scoringVersion: typeof MULTIPLE_CHOICE_SCORING_VERSION;
  maxUnits: number;
  questions: readonly QuizQuestionSelection[];
}>;
export type MultipleChoiceQuizScore = Readonly<{
  scoringVersion: typeof MULTIPLE_CHOICE_SCORING_VERSION;
  earnedUnits: number; maxUnits: number; answeredCount: number; correctCount: number; totalQuestions: number;
  items: readonly Readonly<{
    questionVersionId: string; selectedOptionId: string | null; correct: boolean;
    earnedUnits: number; maxUnits: number; misconceptionTags: readonly string[];
  }>[];
}>;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Expected a plain object');
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(candidate, key))) {
    throw new Error('Unexpected or missing question fields');
  }
  return candidate;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error('A bounded nonempty string is required');
  return value.trim();
}
function slug(value: unknown, maximum = 80): string {
  const result = text(value, maximum);
  if (!slugPattern.test(result)) throw new Error('Use lowercase hyphenated identifiers');
  return result;
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error('Use an ISO UTC timestamp');
  }
  return value;
}
function tags(value: unknown, minimum: number, maximum: number): readonly string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error('Invalid number of tags');
  const result = value.map(item => slug(item));
  if (new Set(result).size !== result.length) throw new Error('Tags must be unique');
  return Object.freeze(result);
}
function positiveUnits(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 1_000_000) {
    throw new Error('Question points must be positive integer units');
  }
  return value;
}

export function questionVersionKey(questionId: string, version: number): string {
  const id = slug(questionId);
  if (!/^[a-z][a-z0-9-]{2,79}$/.test(id)) throw new Error('Question IDs must be 3–80 characters and begin with a letter');
  if (!Number.isSafeInteger(version) || version < 1 || version > 999_999) throw new Error('Invalid question version');
  return `${id}@${version}`;
}

/** Validate external JSON and return an isolated, deeply frozen version snapshot. */
export function freezeQuestionVersion(value: unknown): QuestionVersion {
  const candidate = record(value, ['questionId', 'version', 'versionId', 'kind', 'status', 'title', 'prompt', 'difficulty',
    'activityIds', 'conceptIds', 'options', 'correctOptionId', 'explanation', 'provenance', 'review']);
  const questionId = slug(candidate.questionId);
  const versionId = questionVersionKey(questionId, candidate.version as number);
  if (candidate.versionId !== versionId || candidate.kind !== 'multiple_choice') throw new Error('Question identity mismatch');
  if (!['draft', 'in_review', 'reviewed', 'retired'].includes(candidate.status as string)) throw new Error('Invalid question status');
  if (!['foundation', 'intermediate', 'advanced'].includes(candidate.difficulty as string)) throw new Error('Invalid question difficulty');
  const provenance = record(candidate.provenance, ['kind', 'authorId', 'authoredAt']);
  if (provenance.kind !== 'original') throw new Error('Question provenance must identify original authorship');
  const authorId = text(provenance.authorId, 128);
  const authoredAt = timestamp(provenance.authoredAt);
  let review: QuestionReview | null = null;
  if (candidate.review !== null) {
    const input = record(candidate.review, ['reviewerId', 'reviewedAt', 'notes']);
    const reviewerId = text(input.reviewerId, 128);
    const reviewedAt = timestamp(input.reviewedAt);
    if (reviewerId === authorId || reviewedAt < authoredAt) throw new Error('Review must be independently attributed after authorship');
    review = Object.freeze({ reviewerId, reviewedAt, notes: text(input.notes, 2_000) });
  }
  if ((candidate.status === 'reviewed' || candidate.status === 'retired') !== (review !== null)) {
    throw new Error('Only reviewed or retired questions carry completed review');
  }
  if (!Array.isArray(candidate.options) || candidate.options.length < 2 || candidate.options.length > 6) throw new Error('Use two to six options');
  const correctOptionId = slug(candidate.correctOptionId, 48);
  const options = candidate.options.map(value => {
    const option = record(value, ['id', 'text', 'misconceptionTags']);
    const id = slug(option.id, 48);
    const misconceptionTags = tags(option.misconceptionTags, id === correctOptionId ? 0 : 1, 8);
    if (id === correctOptionId && misconceptionTags.length) throw new Error('Correct options cannot declare a misconception');
    return Object.freeze({ id, text: text(option.text, 2_000), misconceptionTags });
  });
  if (new Set(options.map(option => option.id)).size !== options.length
    || new Set(options.map(option => option.text.toLowerCase())).size !== options.length
    || !options.some(option => option.id === correctOptionId)) throw new Error('Options must be distinct and include the answer');
  return Object.freeze({
    questionId, version: candidate.version as number, versionId, kind: 'multiple_choice', status: candidate.status as QuestionStatus,
    title: text(candidate.title, 160), prompt: text(candidate.prompt, 6_000), difficulty: candidate.difficulty as QuestionDifficulty,
    activityIds: tags(candidate.activityIds, 1, 4), conceptIds: tags(candidate.conceptIds, 1, 8), options: Object.freeze(options),
    correctOptionId, explanation: text(candidate.explanation, 6_000),
    provenance: Object.freeze({ kind: 'original', authorId, authoredAt }), review,
  });
}

export function submitQuestionForReview(input: QuestionVersion): QuestionVersion {
  const question = freezeQuestionVersion(input);
  if (question.status !== 'draft') throw new Error('Only drafts can enter review');
  return freezeQuestionVersion({ ...question, status: 'in_review' });
}
export function reviewQuestionVersion(input: QuestionVersion, review: QuestionReview): QuestionVersion {
  const question = freezeQuestionVersion(input);
  if (question.status !== 'in_review') throw new Error('Only submitted questions can be reviewed');
  return freezeQuestionVersion({ ...question, status: 'reviewed', review });
}
export function retireQuestionVersion(input: QuestionVersion): QuestionVersion {
  const question = freezeQuestionVersion(input);
  if (question.status !== 'reviewed') throw new Error('Only reviewed questions can be retired');
  return freezeQuestionVersion({ ...question, status: 'retired' });
}
export function toLearnerQuestion(input: QuestionVersion): LearnerQuestion {
  const question = freezeQuestionVersion(input);
  return Object.freeze({
    questionId: question.questionId, version: question.version, versionId: question.versionId,
    kind: question.kind, title: question.title, prompt: question.prompt, difficulty: question.difficulty,
    activityIds: question.activityIds, conceptIds: question.conceptIds,
    options: Object.freeze(question.options.map(option => Object.freeze({ id: option.id, text: option.text }))),
  });
}

export function freezeQuizQuestionSelection(input: readonly QuizQuestionSelection[]): MultipleChoiceQuizSnapshot {
  if (!Array.isArray(input) || input.length < 1 || input.length > 30) throw new Error('Select one to thirty questions');
  const seen = new Set<string>();
  let maximum = 0;
  const questions = input.map(value => {
    const selection = record(value, ['question', 'maxUnits']);
    const question = freezeQuestionVersion(selection.question);
    if (question.status !== 'reviewed' || seen.has(question.questionId)) throw new Error('Select distinct reviewed questions');
    seen.add(question.questionId);
    const maxUnits = positiveUnits(selection.maxUnits);
    maximum += maxUnits;
    if (maximum > 1_000_000) throw new Error('Quiz points exceed the supported maximum');
    return Object.freeze({ question, maxUnits });
  });
  return Object.freeze({ scoringVersion: MULTIPLE_CHOICE_SCORING_VERSION, maxUnits: maximum, questions: Object.freeze(questions) });
}

/** Server-side scoring input is keyed by pinned version IDs; missing choices score zero. */
export function scoreMultipleChoiceQuiz(snapshot: MultipleChoiceQuizSnapshot, answers: unknown): MultipleChoiceQuizScore {
  const validated = freezeQuizQuestionSelection(snapshot.questions);
  if (snapshot.scoringVersion !== MULTIPLE_CHOICE_SCORING_VERSION || snapshot.maxUnits !== validated.maxUnits) throw new Error('Quiz scoring snapshot mismatch');
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(answers))) throw new Error('Answers must be keyed by question version');
  const choices = answers as Record<string, unknown>;
  const ids = new Set(validated.questions.map(selection => selection.question.versionId));
  if (Object.keys(choices).some(id => !ids.has(id))) throw new Error('Answer references an unassigned question version');
  let earnedUnits = 0, answeredCount = 0, correctCount = 0;
  const items = validated.questions.map(({ question, maxUnits }) => {
    const choice = Object.hasOwn(choices, question.versionId) ? choices[question.versionId] : null;
    const selected = choice === null ? null : question.options.find(option => option.id === choice);
    if (choice !== null && !selected) throw new Error('Answer references an unknown option');
    if (selected) answeredCount += 1;
    const correct = selected?.id === question.correctOptionId;
    const awarded = correct ? maxUnits : 0;
    earnedUnits += awarded;
    if (correct) correctCount += 1;
    return Object.freeze({ questionVersionId: question.versionId, selectedOptionId: selected?.id ?? null, correct,
      earnedUnits: awarded, maxUnits, misconceptionTags: selected?.misconceptionTags ?? Object.freeze([] as string[]) });
  });
  return Object.freeze({ scoringVersion: MULTIPLE_CHOICE_SCORING_VERSION, earnedUnits, maxUnits: validated.maxUnits,
    answeredCount, correctCount, totalQuestions: validated.questions.length, items: Object.freeze(items) });
}

/** Canonical full response for durable saves; omitted answers become explicit nulls. */
export function freezeMultipleChoiceAnswers(snapshot: MultipleChoiceQuizSnapshot, answers: unknown): QuizAnswers {
  const score = scoreMultipleChoiceQuiz(snapshot, answers);
  return Object.freeze(Object.fromEntries(score.items.map(item => [item.questionVersionId, item.selectedOptionId])));
}
