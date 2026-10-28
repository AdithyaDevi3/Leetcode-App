import { assessmentUuid } from './assessment-draft-input';

export class QuizInputError extends Error {
  constructor(message = 'Use a valid quiz request.', readonly status: 400 | 413 = 400) {
    super(message);
    this.name = 'QuizInputError';
  }
}

const invalid = (message?: string): never => { throw new QuizInputError(message); };

/** A bounded JSON decoder that rejects repeated keys before they can be overwritten. */
function decodeUniqueJson(text: string): unknown {
  let position = 0;
  let nodes = 0;
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[position] ?? '\0')) position += 1; };
  const string = (): string => {
    if (text[position] !== '"') return invalid();
    const start = position++;
    while (position < text.length) {
      const character = text[position++];
      if (character === '\\') { position += 1; continue; }
      if (character === '"') {
        try { return JSON.parse(text.slice(start, position)) as string; } catch { return invalid(); }
      }
    }
    return invalid();
  };
  const value = (depth: number): unknown => {
    if (depth > 32 || ++nodes > 10_000) return invalid('Quiz request is too complex.');
    whitespace();
    const character = text[position];
    if (character === '"') return string();
    if (character === '{') {
      position += 1;
      const object: Record<string, unknown> = Object.create(null);
      whitespace();
      if (text[position] === '}') { position += 1; return object; }
      while (position < text.length) {
        whitespace();
        const key = string();
        if (Object.hasOwn(object, key)) return invalid('Repeated quiz fields are not allowed.');
        whitespace();
        if (text[position++] !== ':') return invalid();
        object[key] = value(depth + 1);
        whitespace();
        const separator = text[position++];
        if (separator === '}') return object;
        if (separator !== ',') return invalid();
      }
      return invalid();
    }
    if (character === '[') {
      position += 1;
      const array: unknown[] = [];
      whitespace();
      if (text[position] === ']') { position += 1; return array; }
      while (position < text.length) {
        array.push(value(depth + 1));
        whitespace();
        const separator = text[position++];
        if (separator === ']') return array;
        if (separator !== ',') return invalid();
      }
      return invalid();
    }
    for (const [token, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(token, position)) { position += token.length; return result; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(position));
    if (!number) return invalid();
    position += number[0].length;
    const result = Number(number[0]);
    if (!Number.isFinite(result)) return invalid();
    return result;
  };
  const result = value(0);
  whitespace();
  if (position !== text.length) return invalid();
  return result;
}

export async function decodeQuizRequest(request: Request, maximumBytes = 128_000): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > maximumBytes) throw new QuizInputError('Quiz request is too large.', 413);
  if (!request.body) return invalid();
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new QuizInputError('Quiz request is too large.', 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof QuizInputError) throw error;
    return invalid('Quiz request could not be read.');
  } finally { reader.releaseLock(); }
  return decodeUniqueJson(text);
}

function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some(key => !allowed.includes(key))) return invalid('Unexpected quiz fields.');
  return value as Record<string, unknown>;
}
function revision(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) return invalid('Use the saved quiz revision.');
  return value as number;
}
function requestKey(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) return invalid('A save key of 1-128 characters is required.');
  return value.trim();
}

export type QuizPublicationRequest = {
  expectedRevision: number;
  audience: { kind: 'class' | 'selected'; learnerIds: string[] };
  expectedRosterFingerprint: string;
  requestKey: string;
};
export function parseQuizPublicationRequest(value: unknown): QuizPublicationRequest {
  const body = record(value, ['expectedRevision', 'audience', 'expectedRosterFingerprint', 'requestKey']);
  const audience = record(body.audience, ['kind', 'learnerIds']);
  if (audience.kind !== 'class' && audience.kind !== 'selected') return invalid('Choose the class or selected learners.');
  if (!Array.isArray(audience.learnerIds) || audience.learnerIds.length < 1 || audience.learnerIds.length > 2_000) return invalid('Choose 1-2,000 enrolled learners.');
  const learnerIds = audience.learnerIds.map(value => {
    if (typeof value !== 'string' || !assessmentUuid.test(value)) return invalid('Choose valid enrolled learners.');
    return value.toLowerCase();
  });
  if (new Set(learnerIds).size !== learnerIds.length) return invalid('Choose each learner once.');
  if (typeof body.expectedRosterFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(body.expectedRosterFingerprint)) return invalid('Refresh the class roster before assigning.');
  return { expectedRevision: revision(body.expectedRevision, 1), audience: { kind: audience.kind, learnerIds },
    expectedRosterFingerprint: body.expectedRosterFingerprint, requestKey: requestKey(body.requestKey) };
}

export type QuizAnswerSaveRequest = { expectedRevision: number; answers: Record<string, string | null>; requestKey: string };
export function parseQuizAnswerSaveRequest(value: unknown): QuizAnswerSaveRequest {
  const body = record(value, ['expectedRevision', 'answers', 'requestKey']);
  if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(body.answers))) return invalid('Use question-version answer selections.');
  const entries = Object.entries(body.answers);
  if (entries.length > 30) return invalid('Too many quiz answers.');
  const answers: Record<string, string | null> = {};
  for (const [id, option] of entries) {
    if (!/^[a-z][a-z0-9-]{2,79}@[1-9][0-9]{0,5}$/.test(id)
      || (option !== null && (typeof option !== 'string' || option.length > 48 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(option)))) return invalid('Use valid assigned questions and option identifiers.');
    answers[id] = option as string | null;
  }
  return { expectedRevision: revision(body.expectedRevision, 0), answers, requestKey: requestKey(body.requestKey) };
}
export function parseQuizSubmissionRequest(value: unknown): { expectedRevision: number; requestKey: string } {
  const body = record(value, ['expectedRevision', 'requestKey']);
  return { expectedRevision: revision(body.expectedRevision, 0), requestKey: requestKey(body.requestKey) };
}
