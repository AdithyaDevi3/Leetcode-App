'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { SystemDesignStage } from '@leetcode-app/domain';
import {
  addDraftComponent,
  addDraftConnection,
  addDraftItem,
  createSystemDesignDraft,
  getDesignStageStatus,
  getDesignValidationErrors,
  removeDraftComponent,
  removeDraftConnection,
  removeDraftItem,
  type ComponentKind,
} from './system-design-model';
import { readLocalSystemDesignDraft, writeLocalSystemDesignDraft } from '@/lib/local-system-design';

const stages: Array<{ id: SystemDesignStage; label: string; hint: string }> = [
  { id: 'requirements', label: 'Requirements', hint: 'Define the outcome and constraints.' },
  { id: 'assumptions', label: 'Assumptions', hint: 'State what you are treating as true.' },
  { id: 'architecture', label: 'Architecture', hint: 'Add components and their connections.' },
  { id: 'failure_analysis', label: 'Failure analysis', hint: 'Describe failure modes and mitigations.' },
  { id: 'review', label: 'Review', hint: 'Check the design for missing essentials.' },
];
const componentKinds: Array<{ value: ComponentKind; label: string }> = [
  { value: 'client', label: 'Client' }, { value: 'service', label: 'Service' }, { value: 'database', label: 'Database' },
  { value: 'queue', label: 'Queue' }, { value: 'cache', label: 'Cache' }, { value: 'external', label: 'External dependency' },
];

function TextList({ title, description, items, onAdd, onRemove, placeholder }: { title: string; description: string; items: string[]; onAdd(value: string): void; onRemove(index: number): void; placeholder: string }) {
  const [value, setValue] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onAdd(value); setValue(''); }
  return <section aria-labelledby={`${title}-heading`} className="rounded-lg border border-[var(--line)] bg-white p-5">
    <h2 id={`${title}-heading`} className="text-lg font-bold">{title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
    <form className="mt-4 flex flex-wrap gap-2" onSubmit={submit}>
      <label className="sr-only" htmlFor={`${title}-input`}>{title}</label>
      <input id={`${title}-input`} className="min-w-56 flex-1 rounded border border-[var(--line)] px-3 py-2" value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} />
      <button className="button" type="submit">Add</button>
    </form>
    {items.length ? <ol className="mt-4 list-decimal space-y-2 pl-5">{items.map((item, index) => <li key={`${item}-${index}`} className="pl-1"><span>{item}</span><button className="ml-3 text-sm font-semibold text-[var(--moss)] underline" type="button" onClick={() => onRemove(index)} aria-label={`Remove ${item}`}>Remove</button></li>)}</ol> : <p className="mt-4 text-sm text-[var(--muted)]">No entries yet.</p>}
  </section>;
}

export function SystemDesignWorkspace() {
  const [document, setDocument] = useState(createSystemDesignDraft);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activeStage, setActiveStage] = useState<SystemDesignStage>('requirements');
  const [componentLabel, setComponentLabel] = useState('');
  const [componentKind, setComponentKind] = useState<ComponentKind>('service');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [connectionLabel, setConnectionLabel] = useState('');
  const stageStatus = useMemo(() => getDesignStageStatus(document), [document]);
  const errors = useMemo(() => getDesignValidationErrors(document), [document]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readLocalSystemDesignDraft();
      if (saved) {
        setDocument(saved.document);
        setSubmittedAt(saved.submittedAt);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    writeLocalSystemDesignDraft({ document, submittedAt });
  }, [document, hydrated, submittedAt]);
  const addComponent = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setDocument((current) => addDraftComponent(current, componentLabel, componentKind)); setComponentLabel(''); };
  const addConnection = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setDocument((current) => addDraftConnection(current, { from, to, label: connectionLabel.trim() || undefined })); setConnectionLabel(''); };
  const submitDraft = () => {
    if (errors.length) return;
    const completedAt = new Date().toISOString();
    setSubmittedAt(completedAt);
    writeLocalSystemDesignDraft({ document, submittedAt: completedAt });
  };

  return <main className="min-h-screen px-4 py-8 text-[var(--ink)] sm:px-8"><div className="mx-auto max-w-5xl">
    <header className="mb-6"><p className="eyebrow">System design practice</p><h1>Design a reliable service</h1><p className="max-w-2xl text-[var(--muted)]">Build a structured design using ordinary forms and lists. This draft saves in this browser and is never shared.</p>{hydrated ? <p className="mt-2 text-sm text-[var(--muted)]" role="status">Saved locally{submittedAt ? ` · submitted ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(submittedAt))}` : ''}</p> : <p className="mt-2 text-sm text-[var(--muted)]" role="status">Restoring local draft…</p>}</header>
    <section className="mb-6 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4" aria-label="Practice stages"><ol className="grid gap-2 sm:grid-cols-5">{stages.map((stage, index) => <li key={stage.id}><button type="button" onClick={() => setActiveStage(stage.id)} aria-current={activeStage === stage.id ? 'step' : undefined} className={`w-full rounded border p-3 text-left ${activeStage === stage.id ? 'border-[var(--moss)] bg-[var(--moss-soft)]' : 'border-[var(--line)] bg-white'}`}><span className="block text-xs font-bold uppercase tracking-wide">{index + 1}. {stageStatus[stage.id] ? 'Complete' : 'In progress'}</span><span className="mt-1 block font-bold">{stage.label}</span></button></li>)}</ol></section>
    <p className="mb-5 rounded border-l-4 border-[var(--mustard)] bg-[#fbf5e6] p-3 text-sm" aria-live="polite"><strong>{stages.find((stage) => stage.id === activeStage)?.label}:</strong> {stages.find((stage) => stage.id === activeStage)?.hint}</p>
    <section className="mb-6 rounded-lg border border-[var(--line)] bg-white p-5"><label className="block font-bold" htmlFor="design-title">Design title</label><input id="design-title" className="mt-2 w-full rounded border border-[var(--line)] px-3 py-2" value={document.title} onChange={(event) => setDocument((current) => ({ ...current, title: event.target.value }))} placeholder="For example: Photo sharing service" /></section>
    <div className="grid gap-5 lg:grid-cols-2">
      <TextList title="Requirements" description="Add functional or non-functional requirements one at a time." items={document.requirements} onAdd={(value) => setDocument((current) => addDraftItem(current, 'requirements', value))} onRemove={(index) => setDocument((current) => removeDraftItem(current, 'requirements', index))} placeholder="Example: Serve 10,000 reads per second" />
      <TextList title="Assumptions" description="Make capacity, product, or dependency assumptions explicit." items={document.assumptions} onAdd={(value) => setDocument((current) => addDraftItem(current, 'assumptions', value))} onRemove={(index) => setDocument((current) => removeDraftItem(current, 'assumptions', index))} placeholder="Example: Images use object storage" />
      <section aria-labelledby="components-heading" className="rounded-lg border border-[var(--line)] bg-white p-5"><h2 id="components-heading" className="text-lg font-bold">Components</h2><p className="mt-1 text-sm text-[var(--muted)]">Add architecture pieces with a type; every control works by keyboard.</p><form className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]" onSubmit={addComponent}><label className="sr-only" htmlFor="component-label">Component name</label><input id="component-label" className="rounded border border-[var(--line)] px-3 py-2" value={componentLabel} onChange={(event) => setComponentLabel(event.target.value)} placeholder="Component name" /><label className="sr-only" htmlFor="component-kind">Component type</label><select id="component-kind" className="rounded border border-[var(--line)] px-3 py-2" value={componentKind} onChange={(event) => setComponentKind(event.target.value as ComponentKind)}>{componentKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select><button className="button" type="submit">Add component</button></form>{document.components.length ? <ul className="mt-4 space-y-2">{document.components.map((component) => <li key={component.id} className="flex items-center justify-between gap-3 rounded border border-[var(--line)] p-3"><span><strong>{component.label}</strong> <span className="text-sm text-[var(--muted)]">({component.kind}, ID: {component.id})</span></span><button className="text-sm font-semibold text-[var(--moss)] underline" type="button" onClick={() => setDocument((current) => removeDraftComponent(current, component.id))}>Remove</button></li>)}</ul> : <p className="mt-4 text-sm text-[var(--muted)]">No components yet.</p>}</section>
      <section aria-labelledby="connections-heading" className="rounded-lg border border-[var(--line)] bg-white p-5"><h2 id="connections-heading" className="text-lg font-bold">Connections</h2><p className="mt-1 text-sm text-[var(--muted)]">Describe a direction in words instead of drawing a graph.</p><form className="mt-4 grid gap-2" onSubmit={addConnection}><label htmlFor="connection-from" className="text-sm font-semibold">From</label><select id="connection-from" className="rounded border border-[var(--line)] px-3 py-2" value={from} onChange={(event) => setFrom(event.target.value)}><option value="">Choose a component</option>{document.components.map((component) => <option key={component.id} value={component.id}>{component.label}</option>)}</select><label htmlFor="connection-to" className="text-sm font-semibold">To</label><select id="connection-to" className="rounded border border-[var(--line)] px-3 py-2" value={to} onChange={(event) => setTo(event.target.value)}><option value="">Choose a component</option>{document.components.map((component) => <option key={component.id} value={component.id}>{component.label}</option>)}</select><label htmlFor="connection-label" className="text-sm font-semibold">Relationship (optional)</label><input id="connection-label" className="rounded border border-[var(--line)] px-3 py-2" value={connectionLabel} onChange={(event) => setConnectionLabel(event.target.value)} placeholder="Example: reads from" /><button className="button justify-self-start" type="submit">Add connection</button></form>{document.connections.length ? <ol className="mt-4 list-decimal space-y-2 pl-5">{document.connections.map((connection, index) => <li key={`${connection.from}-${connection.to}-${index}`}>{connection.from} → {connection.to}{connection.label ? ` (${connection.label})` : ''}<button className="ml-3 text-sm font-semibold text-[var(--moss)] underline" type="button" onClick={() => setDocument((current) => removeDraftConnection(current, index))}>Remove</button></li>)}</ol> : <p className="mt-4 text-sm text-[var(--muted)]">Add two components before creating a connection.</p>}</section>
      <TextList title="Failure considerations" description="Name a risk and the way the design responds to it." items={document.failureNotes} onAdd={(value) => setDocument((current) => addDraftItem(current, 'failureNotes', value))} onRemove={(index) => setDocument((current) => removeDraftItem(current, 'failureNotes', index))} placeholder="Example: Queue backlog alerts and autoscaling" />
      <section aria-labelledby="validation-heading" className="rounded-lg border border-[var(--line)] bg-white p-5"><h2 id="validation-heading" className="text-lg font-bold">Review feedback</h2>{errors.length ? <div className="mt-3 rounded border border-[var(--coral)] bg-[var(--coral-soft)] p-4" role="alert"><p className="font-semibold">Complete these items before submitting:</p><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : <><p className="mt-3 rounded border border-[var(--moss)] bg-[var(--moss-soft)] p-4 font-semibold" role="status">Your practice design has all required sections.</p><button className="button mt-4" type="button" onClick={submitDraft}>Submit local design</button>{submittedAt ? <p className="mt-3 text-sm font-semibold text-[var(--moss)]" role="status">Submission recorded locally. Your review feedback remains available above.</p> : null}</>}<p className="mt-4 text-sm text-[var(--muted)]">Validation and submission are local to this browser. No account or external service is required.</p></section>
    </div>
  </div></main>;
}
