import type { GradeReleaseContent, GradeReleaseResponse } from '@leetcode-app/database';

export const gradePoints = (units: number) => (units / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Displays only the frozen public question and the selected submitted response. */
export function GradeResponseView({ content, response }: { content: GradeReleaseContent; response: GradeReleaseResponse | null }) {
  return <div className="space-y-5">
    {content.prompt ? <section><h3 className="font-bold">Assignment question</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{content.prompt}</p></section> : null}
    {!response ? <p className="text-sm text-[var(--muted)]">No submitted response.</p> : <>
      <p className="text-xs text-[var(--muted)]">Attempt {response.sequence} · Submitted {new Date(response.submittedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      {response.text !== null ? <section><h3 className="font-bold">Submitted answer{response.language ? ` · ${response.language}` : ''}</h3><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--line)] bg-[var(--paper)] p-4 text-sm leading-7">{response.text || 'Empty response'}</pre></section> : null}
    </>}
    {content.questions.map((question, index) => <section key={question.id} className="rounded-lg border border-[var(--line)] p-4">
      <h3 className="font-bold">{index + 1}. {question.title}</h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{question.prompt}</p>
      {question.maxUnits !== null ? <p className="text-xs text-[var(--muted)]">{gradePoints(question.maxUnits)} points</p> : null}
      {question.options.length ? <ul className="mt-3 space-y-2">{question.options.map(option => {
        const selected = response?.answers[question.id] === option.id;
        return <li key={option.id} className={`rounded-md border px-3 py-2 text-sm ${selected ? 'border-[var(--moss)] bg-[var(--moss-soft)]' : 'border-[var(--line)]'}`}><span className="whitespace-pre-wrap break-words">{option.text}</span>{selected ? <strong className="ml-2 text-[var(--moss)]">Submitted choice</strong> : null}</li>;
      })}</ul> : null}
      {response && question.options.length && !response.answers[question.id] ? <p className="mt-3 text-sm text-[var(--muted)]">No choice submitted.</p> : null}
    </section>)}
  </div>;
}
