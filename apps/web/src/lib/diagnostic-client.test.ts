import { describe, expect, it } from 'vitest';
import type { DiagnosticView } from '@leetcode-app/database';
import { answerSignature, diagnosticAnswers, validDiagnostic, validDiagnosticDraft, validDiagnosticSubmission } from './diagnostic-client';

const diagnosticId = '11111111-1111-4111-8111-111111111111';
const requestKey = '22222222-2222-4222-8222-222222222222';
function fixture(submitted = false): DiagnosticView {
  const questions = Array.from({ length: 10 }, (_, index) => ({
    questionId: `synthetic-baseline-${index}`, version: 1, versionId: `synthetic-baseline-${index}@1`, kind: 'multiple_choice' as const,
    title: `Synthetic baseline ${index}`, prompt: 'Choose the preserved invariant.', difficulty: 'foundation' as const,
    activityIds: [`synthetic-activity-${index}`], conceptIds: ['synthetic-invariant'],
    options: [{ id: 'yes', text: 'Invariant preserved.' }, { id: 'no', text: 'Invariant broken.' }],
  }));
  const answers = Object.fromEntries(questions.map((question, index) => [question.versionId, index === 0 ? 'yes' : index === 1 ? 'no' : null]));
  return {
    id: diagnosticId, selectionVersion: 'synthetic-v1', createdAt: '2026-10-29T10:00:00.000Z', questions,
    answerDraft: { revision: 2, answers, updatedAt: '2026-10-29T11:00:00.000Z' },
    submission: submitted ? { diagnosticId, requestKey, answerRevision: 2, submittedAt: '2026-10-29T12:00:00.000Z' } : null,
    feedback: submitted ? { totalQuestions: 10, answeredCount: 2, correctCount: 1, items: questions.map(question => ({
      questionVersionId: question.versionId, selectedOptionId: answers[question.versionId], correct: answers[question.versionId] === 'yes', correctOptionId: 'yes', explanation: 'Synthetic explanation.',
    })) } : null,
  };
}

describe('untrusted diagnostic response and recovery validation', () => {
  it('accepts complete draft and final feedback responses with consistent saved selections', () => {
    expect(validDiagnostic(fixture())).toBe(true);
    expect(validDiagnostic(fixture(true))).toBe(true);
  });

  it('rejects malformed or duplicate question and option records', () => {
    const original = fixture();
    for (const mutation of [
      { questions: original.questions.slice(1) },
      { questions: [null, ...original.questions.slice(1)] },
      { questions: [original.questions[1], ...original.questions.slice(1)] },
      { questions: [{ ...original.questions[0], options: [null, { id: 'yes', text: 'Duplicate.' }] }, ...original.questions.slice(1)] },
      { questions: [{ ...original.questions[0], options: [{ id: 'yes', text: 'One.' }, { id: 'yes', text: 'Duplicate.' }] }, ...original.questions.slice(1)] },
    ]) expect(validDiagnostic({ ...original, ...mutation })).toBe(false);
  });

  it('fails closed without throwing for null and primitive feedback items', () => {
    const original = fixture(true);
    for (const malformed of [null, undefined, false, 7, 'invalid', [], {}]) {
      const candidate = { ...original, feedback: { ...original.feedback!, items: [malformed, ...original.feedback!.items.slice(1)] } };
      expect(() => validDiagnostic(candidate)).not.toThrow();
      expect(validDiagnostic(candidate)).toBe(false);
    }
  });

  it('requires final receipt identity, revision and a complete feedback set to agree', () => {
    const original = fixture(true);
    for (const mutation of [
      { submission: { ...original.submission!, diagnosticId: requestKey } },
      { submission: { ...original.submission!, answerRevision: 1 } },
      { submission: { ...original.submission!, requestKey: 'not-a-request-id' } },
      { feedback: null },
      { feedback: { ...original.feedback!, items: original.feedback!.items.slice(1) } },
      { feedback: { ...original.feedback!, answeredCount: 10 } },
      { feedback: { ...original.feedback!, correctCount: 10 } },
    ]) expect(validDiagnostic({ ...original, ...mutation })).toBe(false);
    expect(validDiagnostic({ ...fixture(), feedback: original.feedback })).toBe(false);
  });

  it('rejects feedback that changes saved answers, invents options, repeats items or disagrees with correctness', () => {
    const original = fixture(true), items = original.feedback!.items;
    for (const first of [
      { ...items[0], selectedOptionId: 'no' },
      { ...items[0], correctOptionId: 'unknown' },
      { ...items[0], correct: false },
      { ...items[0], explanation: null },
      items[1],
    ]) expect(validDiagnostic({ ...original, feedback: { ...original.feedback!, items: [first, ...items.slice(1)] } })).toBe(false);
  });

  it('normalizes omitted browser choices while refusing unknown questions and invalid selections', () => {
    const view = fixture();
    expect(diagnosticAnswers(view, {})).toEqual(Object.fromEntries(view.questions.map(question => [question.versionId, null])));
    for (const value of [null, [], 'answers', { unknown: 'yes' }, { [view.questions[0].versionId]: 'unknown' }, { [view.questions[0].versionId]: false }]) expect(diagnosticAnswers(view, value)).toBeNull();
    expect(answerSignature({ b: null, a: 'yes' })).toBe(answerSignature({ a: 'yes', b: null }));
  });

  it('rejects invalid durable revision metadata and submission receipts', () => {
    const view = fixture(true);
    for (const revision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '2', null]) expect(validDiagnosticDraft(view, { ...view.answerDraft, revision })).toBe(false);
    expect(validDiagnosticDraft(view, { ...view.answerDraft, updatedAt: 'invalid' })).toBe(false);
    expect(validDiagnosticSubmission(diagnosticId, view.submission)).toBe(true);
    for (const change of [{ submittedAt: 'invalid' }, { diagnosticId: requestKey }, { answerRevision: -1 }, { requestKey: 'invalid' }]) expect(validDiagnosticSubmission(diagnosticId, { ...view.submission!, ...change })).toBe(false);
  });
});
