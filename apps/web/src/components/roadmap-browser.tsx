'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { SiteNavigation } from '@/components/site-navigation';
import { codingRoadmapNodes, roadmapLevels, roadmapQuestions, roadmapTopics, type RoadmapQuestion, type RoadmapTopic, type RoadmapTrack } from '@/lib/roadmap';
import { evaluateRoadmapAnswer, type RoadmapAnswer, type RoadmapEvaluation } from '@/lib/roadmap-evaluation';
import { readRoadmapProgress, writeRoadmapProgress, type RoadmapProgress } from '@/lib/roadmap-progress';

const emptyAnswer: RoadmapAnswer = { approach: '', edgeCase: '', complexity: '' };
const levelTitle = { foundation: 'Foundation', intermediate: 'Intermediate', advanced: 'Advanced' };

export function RoadmapBrowser() {
  const [track, setTrack] = useState<RoadmapTrack>('algorithms');
  const [topic, setTopic] = useState<RoadmapTopic | 'all'>('all');
  const [level, setLevel] = useState<(typeof roadmapLevels)[number] | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(roadmapQuestions[0].id);
  const [progress, setProgress] = useState<RoadmapProgress>({});
  const [loaded, setLoaded] = useState(false);
  const [answer, setAnswer] = useState<RoadmapAnswer>(emptyAnswer);
  const [evaluation, setEvaluation] = useState<RoadmapEvaluation | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readRoadmapProgress();
      setProgress(saved);
      setAnswer(saved[roadmapQuestions[0].id]?.answer ?? emptyAnswer);
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const trackTopics = roadmapTopics.filter((item) => item.track === track);
  const visibleQuestions = useMemo(() => roadmapQuestions.filter((question) =>
    question.track === track && (topic === 'all' || question.topic === topic) && (level === 'all' || question.level === level)
    && (!query.trim() || `${question.title} ${question.prompt} ${question.focus}`.toLowerCase().includes(query.trim().toLowerCase()))), [track, topic, level, query]);
  const selected = visibleQuestions.find((question) => question.id === selectedId) ?? (query.trim() ? undefined : visibleQuestions[0]);
  const topicQuestions = roadmapQuestions.filter((question) => question.track === track && (topic === 'all' || question.topic === topic));
  const topicProgress = topicQuestions.filter((question) => progress[question.id]?.ready).length;
  const totalReady = roadmapQuestions.filter((question) => progress[question.id]?.ready).length;

  const openQuestion = (question: RoadmapQuestion) => {
    setSelectedId(question.id);
    setAnswer(progress[question.id]?.answer ?? emptyAnswer);
    setEvaluation(null);
  };
  const chooseTopic = (nextTopic: RoadmapTopic | 'all') => {
    setTopic(nextTopic);
    const next = roadmapQuestions.find((question) => question.track === track && (nextTopic === 'all' || question.topic === nextTopic) && (level === 'all' || question.level === level));
    if (next) openQuestion(next);
  };
  const chooseLevel = (nextLevel: typeof level) => {
    setLevel(nextLevel);
    const next = roadmapQuestions.find((question) => question.track === track && (topic === 'all' || question.topic === topic) && (nextLevel === 'all' || question.level === nextLevel));
    if (next) openQuestion(next);
  };
  const chooseTrack = (nextTrack: RoadmapTrack) => {
    setTrack(nextTrack);
    setQuery('');
    setTopic('all');
    const nextQuestion = roadmapQuestions.find((question) => question.track === nextTrack && (level === 'all' || question.level === level));
    if (nextQuestion) openQuestion(nextQuestion);
  };
  const evaluate = () => {
    if (!selected) return;
    const result = evaluateRoadmapAnswer(selected, answer);
    setEvaluation(result);
    const next = { ...progress, [selected.id]: { answer, ready: result.ready, updatedAt: new Date().toISOString() } };
    setProgress(next);
    try { writeRoadmapProgress(next); setStorageError(false); }
    catch { setStorageError(true); }
  };

  return <main className={`min-h-screen px-5 py-6 text-[var(--ink)] sm:px-8 ${view === 'list' ? 'lg:h-[calc(100dvh-68px)] lg:min-h-0 lg:overflow-hidden' : ''}`}>
    <div className={`mx-auto max-w-7xl space-y-8 ${view === 'list' ? 'lg:flex lg:h-full lg:min-h-0 lg:space-y-4 lg:flex-col' : ''}`}>
      <SiteNavigation currentPath="/roadmap" />
      <header className="grid gap-5 border-b border-[var(--line)] pb-7 md:grid-cols-[1fr_auto] md:items-end lg:gap-4 lg:pb-4">
        <div><p className="eyebrow">Personal interview practice</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl lg:text-3xl">Question browser</h1><p className="mt-3 max-w-2xl leading-7 text-[var(--muted)] lg:mt-2 lg:text-sm lg:leading-6">Browse coding concepts and system-design prompts. Every item labels its question type. Use the skills check to build a weekly plan from the concepts that need more work.</p></div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-5 py-4 text-sm lg:px-4 lg:py-3"><strong className="block text-2xl lg:text-xl">{loaded ? totalReady : '…'} / {roadmapQuestions.length}</strong><span className="text-[var(--muted)]">analysis steps ready</span></div>
      </header>

      <section aria-label="Question browser controls" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4 lg:gap-2 lg:p-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Question browser view">
          <button aria-selected={view === 'list'} className={`min-h-10 rounded-md px-4 text-sm font-bold ${view === 'list' ? 'bg-[var(--moss)] text-white' : 'border border-[var(--line)] hover:bg-[var(--moss-soft)]'}`} onClick={() => setView('list')} role="tab" type="button">Question list</button>
          <button aria-selected={view === 'map'} className={`min-h-10 rounded-md px-4 text-sm font-bold ${view === 'map' ? 'bg-[var(--moss)] text-white' : 'border border-[var(--line)] hover:bg-[var(--moss-soft)]'}`} onClick={() => setView('map')} role="tab" type="button">Skill map</button>
        </div>
        <div className="flex flex-wrap gap-2"><Link className="inline-flex min-h-10 items-center rounded-md border border-[var(--line)] px-4 text-sm font-bold text-[var(--ink)] no-underline hover:bg-[var(--moss-soft)]" href="/roadmap/coding">Browse coding catalog</Link><Link className="inline-flex min-h-10 items-center rounded-md border border-[var(--moss)] px-4 text-sm font-bold text-[var(--moss)] no-underline hover:bg-[var(--moss-soft)]" href="/diagnostic">Customize my weekly plan →</Link></div>
      </section>

      {view === 'map' ? <CodingSkillMap /> : <>

      <div className="grid gap-7 lg:min-h-0 lg:flex-1 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-5">
        <aside aria-label="Roadmap topics" className="space-y-2 lg:overflow-y-auto lg:pr-2">
          <div aria-label="Question track" className="mb-5 grid grid-cols-2 gap-2">
            {(['algorithms', 'system-design'] as const).map((value) => <button aria-pressed={track === value} className={`min-h-11 rounded-md px-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] ${track === value ? 'bg-[var(--moss)] text-white' : 'border border-[var(--line)] bg-[var(--surface)]'}`} key={value} onClick={() => chooseTrack(value)} type="button">{value === 'algorithms' ? 'Algorithms' : 'System design'}</button>)}
          </div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Topics</h2>
          <button aria-current={topic === 'all' ? 'true' : undefined} className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] ${topic === 'all' ? 'border-[var(--moss)] bg-[var(--moss-soft)] text-[var(--moss)]' : 'border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--moss-soft)]'}`} onClick={() => chooseTopic('all')} type="button"><span>All questions</span><span className="font-mono text-xs">{roadmapQuestions.filter((question) => question.track === track && progress[question.id]?.ready).length}/{roadmapQuestions.filter((question) => question.track === track).length}</span></button>
          {trackTopics.map((item) => {
            const done = roadmapQuestions.filter((question) => question.topic === item.id && progress[question.id]?.ready).length;
            return <button aria-current={topic === item.id ? 'true' : undefined} className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] ${topic === item.id ? 'border-[var(--moss)] bg-[var(--moss-soft)] text-[var(--moss)]' : 'border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--moss-soft)]'}`} key={item.id} onClick={() => chooseTopic(item.id)} type="button"><span>{item.title}</span><span className="shrink-0 font-mono text-xs">{done}/3</span></button>;
          })}
        </aside>

        <div className="min-w-0 space-y-6 lg:flex lg:min-h-0 lg:flex-col lg:space-y-4">
          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 lg:p-4">
            <p className="eyebrow">{topic === 'all' ? 'Question catalog' : 'Topic path'}</p><h2 className="mt-1 text-2xl font-bold">{topic === 'all' ? (track === 'algorithms' ? 'All algorithm questions' : 'All system design questions') : roadmapTopics.find((item) => item.id === topic)?.title}</h2><p className="mt-2 text-[var(--muted)]">{topic === 'all' ? `Browse the complete ${track === 'algorithms' ? 'algorithm' : 'system design'} track.` : roadmapTopics.find((item) => item.id === topic)?.description} {topicProgress} of {topicQuestions.length} analyses complete.</p>
            <div aria-label="Difficulty filter" className="mt-5 flex flex-wrap gap-2 lg:mt-3">
              {(['all', ...roadmapLevels] as const).map((value) => <button aria-pressed={level === value} className={`min-h-10 rounded-md px-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] ${level === value ? 'bg-[var(--moss)] text-white' : 'border border-[var(--line)] hover:bg-[var(--moss-soft)]'}`} key={value} onClick={() => chooseLevel(value)} type="button">{value === 'all' ? 'All levels' : levelTitle[value]}</button>)}
            </div>
            <label className="mt-4 grid gap-1.5 text-sm font-bold lg:mt-3" htmlFor="roadmap-search">Search questions<input className="min-h-11 rounded-md border border-[var(--line)] bg-white px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" id="roadmap-search" onChange={(event) => setQuery(event.target.value)} placeholder="Search title, prompt, or skill" type="search" value={query} /></label>
          </section>

          <div className="grid gap-5 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(15rem,0.75fr)_minmax(0,1.25fr)]">
            <section aria-label="Roadmap questions" className="space-y-3 xl:overflow-y-auto xl:pr-2">
              {visibleQuestions.map((question, index) => <button aria-current={selected?.id === question.id ? 'true' : undefined} className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)] ${selected?.id === question.id ? 'border-[var(--moss)] bg-[var(--moss-soft)]' : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--moss)]'}`} key={question.id} onClick={() => openQuestion(question)} type="button"><span aria-label={progress[question.id]?.ready ? 'Analysis complete' : 'Not complete'} className={`size-2 rounded-full ${progress[question.id]?.ready ? 'bg-[var(--moss)]' : 'border border-[var(--muted)]'}`} /><span className="min-w-0"><strong className="block truncate text-sm">{question.title}</strong><span className="mt-1 block text-xs text-[var(--muted)]">{question.track === 'algorithms' ? 'Coding concept' : 'System-design prompt'} · {levelTitle[question.level]}</span></span><span className="text-xs font-bold text-[var(--moss)]">{progress[question.id]?.ready ? 'Ready' : index === 0 && !loaded ? '…' : 'Open'}</span></button>)}
              {visibleQuestions.length === 0 ? <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">No questions match this search and level.</p> : null}
            </section>

            {selected ? <section aria-labelledby="question-heading" className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_10px_30px_rgba(34,46,38,0.05)] xl:overflow-y-auto sm:p-6">
              <p className="eyebrow">{levelTitle[selected.level]} analysis</p><h2 className="mt-1 text-2xl font-bold" id="question-heading">{selected.title}</h2>
              <p className="mt-4 leading-7">{selected.prompt}</p><div className="mt-4 rounded-lg bg-[var(--sky)] p-4 text-sm"><strong>Example</strong><p className="mt-1 font-mono">{selected.example}</p></div>
              <p className="mt-4 text-sm text-[var(--muted)]">Focus: {selected.focus}</p>
              <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); evaluate(); }}>
                <label className="grid gap-2 text-sm font-bold">1. {selected.track === 'algorithms' ? 'Describe your algorithm' : 'Describe your architecture'}<textarea className="min-h-32 w-full rounded-md border border-[var(--line)] bg-white p-3 font-normal leading-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" maxLength={3000} onChange={(event) => { setAnswer({ ...answer, approach: event.target.value }); setEvaluation(null); }} placeholder={selected.track === 'algorithms' ? 'What state do you keep? What happens at each step?' : 'What components and data flow satisfy the requirements?'} required value={answer.approach} /></label>
                <label className="grid gap-2 text-sm font-bold">2. {selected.track === 'algorithms' ? 'Test an edge case' : 'Handle a failure or abuse case'}<textarea className="min-h-20 w-full rounded-md border border-[var(--line)] bg-white p-3 font-normal leading-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" maxLength={1000} onChange={(event) => { setAnswer({ ...answer, edgeCase: event.target.value }); setEvaluation(null); }} placeholder={selected.track === 'algorithms' ? 'Choose a boundary case and explain the result.' : 'Choose a failure mode and explain detection and recovery.'} required value={answer.edgeCase} /></label>
                <label className="grid gap-2 text-sm font-bold">3. {selected.track === 'algorithms' ? 'Analyze time and extra space' : 'Quantify scale and a tradeoff'}<input className="min-h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" maxLength={500} onChange={(event) => { setAnswer({ ...answer, complexity: event.target.value }); setEvaluation(null); }} placeholder={selected.track === 'algorithms' ? 'For example: O(n) time, O(n) extra space' : 'State the load or target and the design tradeoff.'} required value={answer.complexity} /></label>
                <button className="min-h-11 rounded-md bg-[var(--moss)] px-5 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" type="submit">Check my analysis</button>
              </form>
              {evaluation ? <div aria-live="polite" className={`mt-6 rounded-lg border p-4 ${evaluation.ready ? 'border-[var(--moss)] bg-[var(--moss-soft)]' : 'border-[var(--mustard)] bg-[#fbf5e6]'}`}><h3 className="font-bold">{evaluation.ready ? 'Analysis complete' : 'Keep refining your analysis'}</h3><p className="mt-1 text-sm leading-6 text-[var(--muted)]">These checks look for required evidence in your explanation. They cannot prove correctness; test the result through implementation, review, and realistic failure cases.</p><ul className="mt-3 space-y-2 text-sm">{evaluation.findings.map((finding) => <li key={finding.id}><strong>{finding.passed ? '✓' : '○'} {finding.label}:</strong> {finding.passed ? 'Key evidence found.' : finding.detail}</li>)}</ul></div> : null}
              {storageError ? <p role="alert" className="mt-3 text-sm text-red-800">Your browser could not save this progress. Copy your answer before leaving.</p> : <p className="mt-4 text-xs text-[var(--muted)]">Checked answers are saved in this browser on this device.</p>}
              {selected.practiceItemId ? <Link className="mt-5 inline-flex min-h-11 items-center rounded-md border border-[var(--moss)] px-4 font-bold text-[var(--moss)] no-underline hover:bg-[var(--moss-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]" href={`/practice?problem=${encodeURIComponent(selected.practiceItemId)}`}>Open coding practice →</Link> : null}
            </section> : null}
          </div>
        </div>
      </div>
      </>}
    </div>
  </main>;
}

function CodingSkillMap() {
  const nodes = new Map(codingRoadmapNodes.map(node => [node.id, node]));
  return <section aria-label="Original coding-question skill map" className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
    <p className="eyebrow">Planned coding catalog</p>
    <h2 className="mt-1 text-2xl font-bold">Original 250-question skill map</h2>
    <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">This is an original learning sequence. It shows prerequisite relationships and planned coding-question counts. It is not a copied third-party roadmap.</p>
    <ol className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {codingRoadmapNodes.map((node, index) => <li className="rounded-lg border border-[var(--line)] bg-white p-4" key={node.id}>
        <div className="flex items-start justify-between gap-3"><span className="font-mono text-xs font-bold text-[var(--moss)]">{String(index + 1).padStart(2, '0')}</span><span className="rounded-full bg-[var(--moss-soft)] px-2 py-1 text-xs font-bold text-[var(--moss)]">{node.questionCount} coding questions</span></div>
        <h3 className="mt-3 font-bold">{node.title}</h3>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{node.prerequisites.length ? `Build after: ${node.prerequisites.map(id => nodes.get(id)?.title ?? id).join(', ')}.` : 'Starting topic.'}</p>
      </li>)}
    </ol>
    <p className="mt-5 text-sm text-[var(--muted)]">Take the skills check before you follow this sequence. Your weekly plan should prioritize weak concepts before later topics.</p>
  </section>;
}
