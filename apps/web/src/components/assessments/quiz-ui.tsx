import type { LearnerQuestion } from '@leetcode-app/domain';

export const quizButton = 'min-h-11 rounded-md bg-[var(--moss)] px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]';
export const quizSecondary = 'min-h-11 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]';
export const quizDate = (value: string | null) => value ? `${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value))} UTC` : 'Not set';
export const quizPoints = (units: number) => (units / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
export type QuizQuestionView = { question: LearnerQuestion; maxUnits: number };
export type QuizAnswers = Record<string, string | null>;

export function QuizQuestionCards({ questions, answers, onChange, disabled = false }: {
  questions: readonly QuizQuestionView[]; answers: QuizAnswers; onChange?: (versionId: string, optionId: string | null) => void; disabled?: boolean;
}) {
  return <ol className="space-y-5" aria-label="Quiz questions">{questions.map(({ question, maxUnits }, index) => <li id={`quiz-question-${index + 1}`} className="scroll-mt-6 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6" key={question.versionId}>
    <fieldset disabled={disabled || !onChange}>
      <legend className="mb-3 text-lg font-bold">{index + 1}. {question.title} <span className="ml-2 whitespace-nowrap text-sm font-normal text-[var(--muted)]">{quizPoints(maxUnits)} points</span></legend>
      <p className="mb-5 whitespace-pre-wrap break-words text-sm leading-6">{question.prompt}</p>
      <div className="space-y-2">{question.options.map(option => <label className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm leading-6 ${answers[question.versionId] === option.id ? 'border-[var(--moss)] bg-[var(--moss-soft)]' : 'border-[var(--line)] bg-white'} has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-[var(--moss)]`} key={option.id}>
        <input className="mt-1 h-4 w-4 shrink-0 accent-[var(--moss)]" type="radio" name={`quiz-${question.versionId}`} value={option.id} checked={answers[question.versionId] === option.id} onChange={() => onChange?.(question.versionId, option.id)} /><span className="min-w-0 whitespace-pre-wrap break-words">{option.text}</span>
      </label>)}</div>
      {onChange ? <button className="mt-3 min-h-11 px-1 text-sm font-bold text-[var(--moss)] underline disabled:opacity-50" type="button" disabled={disabled || !answers[question.versionId]} onClick={() => onChange(question.versionId, null)} aria-label={`Clear answer for question ${index + 1}`}>Clear answer</button> : <p className="mb-0 mt-3 text-sm text-[var(--muted)]">{answers[question.versionId] ? 'Your submitted choice is selected above.' : 'No answer submitted.'}</p>}
    </fieldset>
  </li>)}</ol>;
}
