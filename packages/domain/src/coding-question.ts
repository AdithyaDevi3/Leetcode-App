import type { InterviewCurriculumTopic } from './interview-curriculum.js';

export type CodingQuestionDifficulty = 'foundation' | 'intermediate' | 'advanced';
export type CodingQuestionStatus = 'draft' | 'in_review' | 'reviewed' | 'retired';

export type CodingQuestionExample = Readonly<{
  input: string;
  output: string;
  note: string;
}>;

export type OriginalCodingQuestion = Readonly<{
  id: string;
  topic: InterviewCurriculumTopic;
  difficulty: CodingQuestionDifficulty;
  estimatedMinutes: number;
  title: string;
  prompt: string;
  functionName: string;
  functionSignature: string;
  constraints: readonly string[];
  examples: readonly CodingQuestionExample[];
  starterDraft: string;
  conceptIds: readonly string[];
  provenance: Readonly<{ kind: 'original'; authorId: string; authoredAt: string }>;
  status: CodingQuestionStatus;
  reviewerId: string | null;
}>;

export type CodingQuestionCustomization = Readonly<{
  title?: string;
  prompt?: string;
  estimatedMinutes?: number;
  constraints?: readonly string[];
  examples?: readonly CodingQuestionExample[];
  starterDraft?: string;
}>;

const topics = new Set<InterviewCurriculumTopic>([
  'arrays-hashing', 'two-pointers', 'sliding-window', 'binary-search', 'linked-lists', 'stacks',
  'trees', 'tries', 'backtracking', 'heaps', 'graphs', 'advanced-graphs',
  'dynamic-programming-1d', 'dynamic-programming-2d', 'greedy', 'intervals',
  'bit-manipulation', 'math-geometry',
]);
const idPattern = /^[a-z][a-z0-9-]{2,79}$/;
const functionPattern = /^[A-Za-z_][A-Za-z0-9_]{0,79}$/;

function plainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Use a question object.');
  return value as Record<string, unknown>;
}
function exactObject(value: unknown, fields: readonly string[]): Record<string, unknown> {
  const item = plainObject(value);
  if (Object.keys(item).length !== fields.length || fields.some(field => !Object.hasOwn(item, field))) throw new Error('Question fields are invalid.');
  return item;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) throw new Error('Use bounded nonempty text.');
  return value.trim();
}
function identifier(value: unknown): string {
  const result = text(value, 80);
  if (!idPattern.test(result)) throw new Error('Use a lowercase question identifier.');
  return result;
}
function list(value: unknown, minimum: number, maximum: number, itemMaximum: number): readonly string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error('Use a bounded text list.');
  const result = value.map(item => text(item, itemMaximum));
  if (new Set(result).size !== result.length) throw new Error('List values must be unique.');
  return Object.freeze(result);
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Use an ISO UTC timestamp.');
  return value;
}
function examples(value: unknown): readonly CodingQuestionExample[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) throw new Error('Use one to four examples.');
  return Object.freeze(value.map(example => {
    const item = exactObject(example, ['input', 'output', 'note']);
    return Object.freeze({ input: text(item.input, 2_000), output: text(item.output, 2_000), note: text(item.note, 2_000) });
  }));
}

/** Validate a public, original coding-question version. */
export function freezeOriginalCodingQuestion(value: unknown): OriginalCodingQuestion {
  const item = exactObject(value, ['id', 'topic', 'difficulty', 'estimatedMinutes', 'title', 'prompt', 'functionName', 'functionSignature', 'constraints', 'examples', 'starterDraft', 'conceptIds', 'provenance', 'status', 'reviewerId']);
  const topic = item.topic as InterviewCurriculumTopic;
  if (!topics.has(topic)) throw new Error('Use a supported coding-question topic.');
  const difficulty = item.difficulty as CodingQuestionDifficulty;
  if (!['foundation', 'intermediate', 'advanced'].includes(difficulty)) throw new Error('Use a supported coding-question difficulty.');
  if (typeof item.estimatedMinutes !== 'number' || !Number.isSafeInteger(item.estimatedMinutes) || item.estimatedMinutes < 5 || item.estimatedMinutes > 180) throw new Error('Use an estimated duration from 5 to 180 minutes.');
  const functionName = text(item.functionName, 80);
  if (!functionPattern.test(functionName)) throw new Error('Use a valid function name.');
  const provenance = exactObject(item.provenance, ['kind', 'authorId', 'authoredAt']);
  if (provenance.kind !== 'original') throw new Error('Only original coding questions are allowed.');
  const authorId = text(provenance.authorId, 128);
  const status = item.status as CodingQuestionStatus;
  if (!['draft', 'in_review', 'reviewed', 'retired'].includes(status)) throw new Error('Coding-question status is invalid.');
  const reviewerId = item.reviewerId === null ? null : text(item.reviewerId, 128);
  if ((status === 'reviewed' || status === 'retired') !== Boolean(reviewerId)) throw new Error('Reviewed coding questions require a reviewer.');
  if (reviewerId === authorId) throw new Error('The reviewer must be independent.');
  return Object.freeze({
    id: identifier(item.id), topic, difficulty, estimatedMinutes: item.estimatedMinutes,
    title: text(item.title, 160), prompt: text(item.prompt, 8_000), functionName,
    functionSignature: text(item.functionSignature, 500), constraints: list(item.constraints, 1, 8, 500),
    examples: examples(item.examples), starterDraft: text(item.starterDraft, 8_000),
    conceptIds: list(item.conceptIds, 1, 8, 80),
    provenance: Object.freeze({ kind: 'original', authorId, authoredAt: timestamp(provenance.authoredAt) }),
    status, reviewerId,
  });
}

/** Apply permitted personal edits without changing identity or review ownership. */
export function customizeCodingQuestion(
  source: OriginalCodingQuestion,
  changes: CodingQuestionCustomization,
): OriginalCodingQuestion {
  const question = freezeOriginalCodingQuestion(source);
  const patch = plainObject(changes);
  const permitted = ['title', 'prompt', 'estimatedMinutes', 'constraints', 'examples', 'starterDraft'];
  if (Object.keys(patch).some(key => !permitted.includes(key))) throw new Error('This coding-question field cannot be customized.');
  return freezeOriginalCodingQuestion({ ...question, ...patch, status: 'draft', reviewerId: null });
}
