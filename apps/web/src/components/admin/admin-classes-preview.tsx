'use client';

import { useState } from 'react';
import { AdminMetric, AdminPageHeader, AdminSection } from './admin-ui';

const initialClasses = [
  { id: 1, name: 'Algorithms · Fall cohort', description: 'Build confidence with arrays, hash maps, and trees.', code: 'DEMO-000001', learners: 24, tasks: 4 },
  { id: 2, name: 'Interview practice', description: 'Weekly practice and structured feedback.', code: 'DEMO-000002', learners: 8, tasks: 2 },
];

export function AdminClassesPreview() {
  const [classes, setClasses] = useState(initialClasses);
  const [selectedId, setSelectedId] = useState(1);
  const [notice, setNotice] = useState('');
  const selected = classes.find(item => item.id === selectedId)!;

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Learning groups" title="Classes" description="Create a class, share its join code, and follow your learners’ progress." />
    <AdminSection title="Create a class" description="Try the flow with sample data.">
      <form className="grid gap-4 p-6" onSubmit={event => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const name = String(data.get('name') ?? '').trim();
        if (name.length < 3) return;
        const id = classes.length + 1;
        setClasses([...classes, { id, name, description: String(data.get('description') ?? '').trim(), code: `DEMO-${String(id).padStart(6, '0')}`, learners: 0, tasks: 0 }]);
        setSelectedId(id);
        setNotice('Sample class created. Its preview join code is shown below.');
        form.reset();
      }}>
        <label className="grid gap-2 text-sm font-semibold">Class name<input className="min-h-11 rounded-lg border border-[var(--line)] px-3" name="name" minLength={3} maxLength={120} required placeholder="Algorithms, Fall term" /></label>
        <label className="grid gap-2 text-sm font-semibold">Description (optional)<textarea className="min-h-24 rounded-lg border border-[var(--line)] p-3" name="description" maxLength={1000} placeholder="What will learners practice?" /></label>
        <button className="button justify-self-start" type="submit">Create class and code</button>
      </form>
    </AdminSection>
    <p role="status" className="text-sm text-[var(--moss)]">{notice}</p>
    <AdminSection title="Your classes" description="Select a class to view its join code and progress.">
      <div className="grid gap-3 p-6 sm:grid-cols-2">{classes.map(item => <button key={item.id} type="button" aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)} className={`rounded-lg border p-4 text-left ${selectedId === item.id ? 'border-[var(--moss)] bg-[var(--moss-soft)]' : 'border-[var(--line)] bg-white'}`}><strong className="block">{item.name}</strong><span className="mt-2 block text-sm text-[var(--muted)]">{item.description}</span></button>)}</div>
    </AdminSection>
    <section aria-label={`${selected.name} summary`} className="grid gap-4 md:grid-cols-3">
      <AdminMetric label="Preview join code" value={selected.code} note={selected.name} />
      <AdminMetric label="Learners" value={selected.learners} note="Sample enrolled learners" />
      <AdminMetric label="Assigned tasks" value={selected.tasks} note="Sample practice activities" />
    </section>
  </div>;
}
