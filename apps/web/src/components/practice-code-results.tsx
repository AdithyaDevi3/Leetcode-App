'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { CodeGrade } from '@/lib/code-grading';
import type { CodeRunResult, CustomRunCase } from '@/lib/code-running';
import { runCaseDraftLimits } from '@/lib/practice-session';

export type CodeResultsTab = 'cases' | 'run' | 'submission';
const tabs = [{ value: 'cases', label: 'Test cases' }, { value: 'run', label: 'Run result' }, { value: 'submission', label: 'Submission' }] as const;
const display = (value: unknown) => JSON.stringify(value, null, 2) ?? 'No output';

export function PracticeCodeResults({ tab, onTabChange, cases, onCasesChange, run, runMessage, running,
  grade, checked, submissionMessage, submitting,
}: {
  tab: CodeResultsTab; onTabChange: (tab: CodeResultsTab) => void;
  cases: CustomRunCase[]; onCasesChange: (cases: CustomRunCase[]) => void;
  run: CodeRunResult | null; runMessage: string; running: boolean;
  grade: CodeGrade | null; checked: boolean; submissionMessage: string; submitting: boolean;
}) {
  const id = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const [chosenCase, setChosenCase] = useState<string | null>(null);
  const active = cases.find(item => item.id === chosenCase) ?? cases[0];
  const activeIndex = active ? cases.indexOf(active) : -1;
  const selectWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft'
      ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); onTabChange(tabs[next].value); buttons.current[next]?.focus();
  };
  const update = (field: 'input' | 'expected', value: string) => {
    if (active) onCasesChange(cases.map(item => item.id === active.id ? { ...item, [field]: value } : item));
  };
  return <div className="practice-code-results">
    <div role="tablist" aria-label="Code tests" className="code-results-tabs">
      {tabs.map((item, index) => <button key={item.value} ref={node => { buttons.current[index] = node; }} type="button"
        role="tab" id={`${id}-${item.value}-tab`} aria-selected={tab === item.value} aria-controls={`${id}-${item.value}-panel`}
        tabIndex={tab === item.value ? 0 : -1} onKeyDown={event => selectWithKeyboard(event, index)} onClick={() => onTabChange(item.value)}>{item.label}</button>)}
    </div>
    <section role="tabpanel" id={`${id}-cases-panel`} aria-labelledby={`${id}-cases-tab`} hidden={tab !== 'cases'}>
      <div className="run-case-switch" role="group" aria-label="Choose test case">
        {cases.map((item, index) => <button key={item.id} type="button" aria-pressed={item.id === active?.id} onClick={() => setChosenCase(item.id)}>Case {index + 1}</button>)}
        <button type="button" disabled={cases.length >= runCaseDraftLimits.count} onClick={() => {
          const next = { id: `custom-${crypto.randomUUID()}`, input: '[]', expected: '' };
          onCasesChange([...cases, next]); setChosenCase(next.id);
        }}>+ Add case</button>
      </div>
      {active ? <div className="run-case-editor">
        <label htmlFor={`${id}-input`}>Arguments <span>(JSON array)</span></label>
        <textarea id={`${id}-input`} aria-label={`Test case ${activeIndex + 1} input`} value={active.input}
          spellCheck={false} maxLength={runCaseDraftLimits.fieldCharacters} onChange={event => update('input', event.target.value)} />
        <label htmlFor={`${id}-expected`}>Expected output <span>(optional JSON)</span></label>
        <textarea id={`${id}-expected`} aria-label={`Test case ${activeIndex + 1} expected output`} value={active.expected}
          spellCheck={false} maxLength={runCaseDraftLimits.fieldCharacters} onChange={event => update('expected', event.target.value)} />
        <div className="run-case-actions"><small>Inputs are saved with your work, including unfinished JSON. Leave expected output blank to inspect the result. Equivalent valid pairs and task orders are accepted.</small>
          <button type="button" onClick={() => onCasesChange(cases.filter(item => item.id !== active.id))}>Remove case {activeIndex + 1}</button></div>
      </div> : <p>Add a test case to run your code.</p>}
    </section>
    <section role="tabpanel" id={`${id}-run-panel`} aria-labelledby={`${id}-run-tab`} hidden={tab !== 'run'}>
      <p role="status">{runMessage || (running ? 'Running your test cases…' : 'Run your code to inspect outputs for these test cases.')}</p>
      {run ? <>
        <p className="pane-kicker">{run.durationMs} ms · {run.cases.length} {run.cases.length === 1 ? 'case' : 'cases'}</p>
        {run.cases.map((item, index) => <details className="run-case-result" key={item.id} open={index === 0 || Boolean(item.error) || item.passed === false}>
          <summary>Case {index + 1} · {item.error ? 'Error' : item.passed === null ? 'Output ready' : item.passed ? 'Passed' : 'Different output'}</summary>
          <dl><dt>Arguments</dt><dd><pre>{display(item.input)}</pre></dd>
            <dt>Output</dt><dd><pre>{item.error || display(item.actual)}</pre></dd>
            {item.expected !== undefined ? <><dt>Expected</dt><dd><pre>{display(item.expected)}</pre></dd></> : null}</dl>
        </details>)}
        {run.stdout ? <details className="run-case-result"><summary>Standard output</summary><pre>{run.stdout}</pre></details> : null}
        {run.stderr ? <details className="run-case-result" open><summary>Compiler / runtime messages</summary><pre>{run.stderr}</pre></details> : null}
      </> : null}
    </section>
    <section role="tabpanel" id={`${id}-submission-panel`} aria-labelledby={`${id}-submission-tab`} hidden={tab !== 'submission'}>
      <div className="pane-header"><h3>Full test suite</h3><span className={`grader-state ${checked ? grade?.passed ? 'pass' : 'revise' : ''}`}>{checked ? grade?.passed ? 'Passed' : 'Revise' : 'Not submitted'}</span></div>
      <p role="status">{submissionMessage || (submitting ? 'Submitting your solution…' : 'Submit checks the full suite and saves your verified result.')}</p>
      {checked && grade ? <>
        <p>{grade.passedCount} of {grade.totalCount} checks passed.</p>
        {grade.tests.map(item => <div className={`test-row ${item.passed ? 'pass' : 'revise'}`} key={item.name}><span aria-hidden="true">{item.passed ? '✓' : '×'}</span>{item.name}</div>)}
      </> : null}
    </section>
  </div>;
}
