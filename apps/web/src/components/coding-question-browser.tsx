'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type CodingQuestionBrowserItem = Readonly<{
  id: string;
  topic: string;
  difficulty: 'foundation' | 'intermediate' | 'advanced';
  estimatedMinutes: number;
  title: string;
  prompt: string;
  conceptIds: readonly string[];
}>;

const difficultyLabel = {
  foundation: 'Foundation',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const topicLabel = (topic: string) => topic.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export function CodingQuestionBrowser({ items, targetCount = 250 }: { items: readonly CodingQuestionBrowserItem[]; targetCount?: number }) {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('all');
  const [difficulty, setDifficulty] = useState<'all' | CodingQuestionBrowserItem['difficulty']>('all');
  const topics = useMemo(() => [...new Set(items.map(item => item.topic))].sort((left, right) => topicLabel(left).localeCompare(topicLabel(right))), [items]);
  const visible = useMemo(() => items.filter(item =>
    (topic === 'all' || item.topic === topic)
    && (difficulty === 'all' || item.difficulty === difficulty)
    && (!query.trim() || `${item.title} ${item.prompt} ${item.conceptIds.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))
  ), [items, topic, difficulty, query]);

  return <main className="min-h-screen px-5 py-6 text-[var(--ink)] sm:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="grid gap-5 border-b border-[var(--line)] pb-7 md:grid-cols-[1fr_auto] md:items-end">
        <div><p className="eyebrow">Original personal curriculum</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Coding question browser</h1><p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">Every row is an original coding question. These are review-gated candidates, not copied third-party questions. The catalog will grow to {targetCount} questions before publication.</p></div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-5 py-4 text-sm"><strong className="block text-2xl">{items.length} / {targetCount}</strong><span className="text-[var(--muted)]">coding questions in review</span></div>
      </header>

      <section className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 md:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]">
        <label className="grid gap-1.5 text-sm font-bold" htmlFor="coding-question-search">Search coding questions<input className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal" id="coding-question-search" onChange={event => setQuery(event.target.value)} placeholder="Search title, prompt, or concept" type="search" value={query} /></label>
        <label className="grid gap-1.5 text-sm font-bold" htmlFor="coding-question-topic">Topic<select className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal" id="coding-question-topic" onChange={event => setTopic(event.target.value)} value={topic}><option value="all">All topics</option>{topics.map(value => <option key={value} value={value}>{topicLabel(value)}</option>)}</select></label>
        <label className="grid gap-1.5 text-sm font-bold" htmlFor="coding-question-difficulty">Difficulty<select className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal" id="coding-question-difficulty" onChange={event => setDifficulty(event.target.value as typeof difficulty)} value={difficulty}><option value="all">All levels</option><option value="foundation">Foundation</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
        <Link className="inline-flex min-h-11 items-center self-end rounded-md border border-[var(--moss)] px-4 text-sm font-bold text-[var(--moss)] no-underline hover:bg-[var(--moss-soft)]" href="/diagnostic">Customize weekly plan →</Link>
      </section>

      <section aria-label="Coding questions" className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-3 border-b border-[var(--line)] bg-[#f5f5f1] px-4 py-3 text-xs font-bold uppercase tracking-wide text-[var(--muted)] sm:grid-cols-[minmax(0,1fr)_11rem_8rem_7rem]">
          <span>Coding question</span><span className="hidden sm:block">Topic</span><span>Difficulty</span><span>Time</span>
        </div>
        <ol>{visible.map(item => <li className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-3 border-b border-[var(--line)] px-4 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_11rem_8rem_7rem]" key={item.id}>
          <div className="min-w-0"><span className="mb-1 inline-flex rounded-full bg-[var(--moss-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--moss)]">Coding question</span><h2 className="truncate font-bold">{item.title}</h2><p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{item.prompt}</p></div>
          <span className="hidden self-center text-sm sm:block">{topicLabel(item.topic)}</span><span className="self-center text-sm font-bold text-[var(--moss)]">{difficultyLabel[item.difficulty]}</span><span className="self-center text-sm text-[var(--muted)]">{item.estimatedMinutes} min</span>
        </li>)}</ol>
        {!visible.length ? <p className="p-5 text-sm text-[var(--muted)]">No coding questions match these filters.</p> : null}
      </section>
      <p className="text-sm leading-6 text-[var(--muted)]">Complete the skills check before you select a weekly plan. The plan should prioritize concepts with weaker answered evidence.</p>
    </div>
  </main>;
}
