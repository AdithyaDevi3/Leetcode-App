"use client";

/* Primary navigation deliberately reloads the document after a deployment. */
/* eslint-disable @next/next/no-html-link-for-pages */

import Link from "next/link";
import {
  Bookmark,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock3,
  Code2,
  Compass,
  GitBranch,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  LockKeyhole,
  Play,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { defaultPracticeItem, getPracticeItem, practiceItems } from "@/lib/content";
import type { CodeGrade } from '@/lib/code-grading';
import { evaluatePseudocode, REASONING_RUBRIC_VERSION, type Evaluation } from "@/lib/evaluator";
import { evaluationPolicy } from '@/lib/evaluation-policy';
import { readLocalLearnerProfile } from "@/lib/local-learner";
import { recordLocalPracticeEvidence } from '@/lib/local-mastery';
import { recordLocalPracticeCompletion } from "@/lib/local-practice-history";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "@/lib/safe-browser-storage";
import {
  buildCodeFromPlanForLanguage,
  deserializePracticeSession,
  joinBlocksIntoDraft,
  projectDraftBlocks,
  sessionStorageKey,
  splitDraftIntoBlocks,
  type CodingLanguage,
  type EditorMode,
  type PracticeSessionState,
  serializePracticeSession,
  defaultCode,
  selectedPracticeItemKey,
} from "@/lib/practice-session";
import {
  clearCachedPracticeSessionId,
  readCachedPracticeSessionId,
  syncPracticeSession,
  type PracticeSyncStatus,
  writeCachedPracticeSessionId,
} from "@/lib/practice-sync";
import { useViewer } from '@/lib/use-viewer';

const formatElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
};

const initialsFor = (name: string | null | undefined) => {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return words.length ? words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') : 'GL';
};

export function PracticeWorkspace() {
  const [activePracticeId, setActivePracticeId] = useState(defaultPracticeItem.id);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<EditorMode>("text");
  const [codingLanguage, setCodingLanguage] = useState<CodingLanguage>("typescript");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [codeGrade, setCodeGrade] = useState<CodeGrade | null>(null);
  const [savedAt, setSavedAt] = useState("Not saved");
  const [syncStatus, setSyncStatus] = useState<PracticeSyncStatus>("ready");
  const [code, setCode] = useState(defaultCode(defaultPracticeItem.codeFunction, defaultPracticeItem.codeSignature));
  const [codeChecked, setCodeChecked] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [evaluationStatus, setEvaluationStatus] = useState<'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'canceled'>('idle');
  const [evaluationJobId, setEvaluationJobId] = useState<string | null>(null);
  const [evaluationMessage, setEvaluationMessage] = useState<string | null>(null);
  const [remoteRevision, setRemoteRevision] = useState(1);
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'running' | 'completed' | 'failed' | 'timed_out' | 'unavailable'>('idle');
  const [executionOutput, setExecutionOutput] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [libraryStatus, setLibraryStatus] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const viewer = useViewer();
  const activePracticeItem = getPracticeItem(activePracticeId);
  const storageKey = sessionStorageKey(activePracticeItem.id);
  const blockOptions = activePracticeItem.blockOptions;
  const activePracticeNumber = practiceItems.findIndex((item) => item.id === activePracticeItem.id) + 1;
  const trace = activePracticeItem.trace;

  useEffect(() => {
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requestedPracticeId = new URLSearchParams(window.location.search).get("problem");
      const savedPracticeId = requestedPracticeId ? null : readBrowserStorage(selectedPracticeItemKey);
      const restoredPracticeItem = requestedPracticeId
        ? getPracticeItem(requestedPracticeId)
        : savedPracticeId
          ? getPracticeItem(savedPracticeId)
          : defaultPracticeItem;
      const preferredLanguage = readLocalLearnerProfile()?.preferredLanguage ?? "typescript";

      if (restoredPracticeItem.id !== defaultPracticeItem.id) {
        setActivePracticeId(restoredPracticeItem.id);
      }

      const savedSession = readBrowserStorage(sessionStorageKey(restoredPracticeItem.id));
      if (!savedSession) {
        setCodingLanguage(preferredLanguage);
        setCode(defaultCode(restoredPracticeItem.codeFunction, restoredPracticeItem.codeSignature, preferredLanguage));
        setSavedAt("Ready");
        return;
      }

      const restoredSession = deserializePracticeSession(savedSession);
      if (!restoredSession) {
        setCodingLanguage(preferredLanguage);
        setCode(defaultCode(restoredPracticeItem.codeFunction, restoredPracticeItem.codeSignature, preferredLanguage));
        setSavedAt("Ready");
        return;
      }

      setDraft(restoredSession.draft);
      setMode(restoredSession.mode);
      setCodingLanguage(restoredSession.language);
      setCode(restoredSession.code);
      setCodeChecked(restoredSession.codeChecked);
      setCompleted(restoredSession.completed);
      setEvaluation(restoredSession.evaluation);
      setCodeGrade(restoredSession.codeGrade);
      setSavedAt("Restored locally");
      setSyncStatus("offline");
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const session: PracticeSessionState = {
        draft,
        mode,
        language: codingLanguage,
        code,
        codeChecked,
        completed,
        evaluation,
        codeGrade,
      };

      const locallySaved = writeBrowserStorage(storageKey, serializePracticeSession(session));
      writeBrowserStorage(selectedPracticeItemKey, activePracticeItem.id);
      const hasChanges =
        draft ||
        mode !== "text" ||
        code !== defaultCode(activePracticeItem.codeFunction, activePracticeItem.codeSignature, codingLanguage) ||
        codeChecked ||
        completed ||
        evaluation ||
        codeGrade;

      setSavedAt(hasChanges ? (locallySaved ? "Saving" : "Session active") : "Ready");
      setSyncStatus(hasChanges ? "saving" : "ready");

      if (!hasChanges) {
        return;
      }

      const savedRemoteSessionId = readCachedPracticeSessionId(activePracticeItem.id);
      if (savedRemoteSessionId) {
        writeCachedPracticeSessionId(activePracticeItem.id, savedRemoteSessionId);
      }

      void syncPracticeSession({
        contentId: activePracticeItem.id,
        draft,
        currentStage: completed ? "evaluate" : "plan",
        state: session,
        sessionId: savedRemoteSessionId ?? undefined,
      })
        .then((result) => {
          setRemoteRevision(result.revisionNumber);
          setSyncStatus(result.status);
          setSavedAt(result.status === "saved" ? "Saved to server" : result.status === "conflict" ? "Conflict" : "Offline draft");
          if (result.sessionId) {
            writeCachedPracticeSessionId(activePracticeItem.id, result.sessionId);
          }
        })
        .catch(() => {
          setSyncStatus("offline");
          setSavedAt("Offline draft");
        });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [draft, mode, codingLanguage, code, codeChecked, completed, evaluation, codeGrade, storageKey, activePracticeItem]);

  const blocks = mode === "blocks"
    ? projectDraftBlocks(draft, activePracticeItem.codeFunction)
    : splitDraftIntoBlocks(draft);

  const updateDraft = (nextDraft: string) => {
    setDraft(nextDraft);
    setEvaluationStatus('idle');
    setEvaluationJobId(null);
    setEvaluationMessage(null);
    setEvaluation(null);
    setCodeGrade(null);
    setCodeChecked(false);
    setCompleted(false);
    setExecutionStatus('idle');
    setExecutionOutput('');
  };

  const addBlock = (block: string) => {
    updateDraft(joinBlocksIntoDraft([...blocks, block]));
  };

  const updateBlocks = (nextBlocks: string[]) => {
    updateDraft(joinBlocksIntoDraft(nextBlocks));
  };

  const draftLineCount = blocks.length;
  const draftWordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const draftCharacterCount = draft.length;

  const moveBlock = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= blocks.length) return;
    const nextBlocks = [...blocks];
    [nextBlocks[index], nextBlocks[nextIndex]] = [nextBlocks[nextIndex], nextBlocks[index]];
    updateBlocks(nextBlocks);
  };

  const evaluationFindings = evaluation?.findings ?? evaluatePseudocode("", activePracticeItem.id).findings;
  const approved = evaluation?.approved ?? false;
  const passedReasoningChecks = evaluation?.findings.filter((finding) => finding.status === 'pass').length ?? 0;
  const secureCheckCount = passedReasoningChecks + (codeGrade?.passed ? 1 : 0);
  const totalCheckCount = evaluationFindings.length + 1;
  const progressPercent = Math.round((secureCheckCount / totalCheckCount) * 100);

  useEffect(() => {
    if (!evaluationJobId || (evaluationStatus !== 'queued' && evaluationStatus !== 'running')) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/practice/sessions/${readCachedPracticeSessionId(activePracticeItem.id)}/evaluate/${evaluationJobId}`)
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('Evaluation status unavailable')))
        .then((body: { status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled'; result?: { evaluation?: Evaluation }; error?: string }) => {
          if (body.status === 'completed') {
            const nextEvaluation = body.result?.evaluation ?? null;
            setEvaluation(nextEvaluation);
            setEvaluationStatus('completed');
            setEvaluationMessage(null);
            if (nextEvaluation) recordLocalPracticeEvidence({ item: activePracticeItem, reasoningScore: nextEvaluation.score });
          }
          else if (body.status === 'failed') { setEvaluationStatus('failed'); setEvaluationMessage(body.error ?? 'Evaluation failed. You can retry safely.'); }
          else if (body.status === 'canceled') { setEvaluationStatus('canceled'); setEvaluationMessage('Evaluation canceled. Your draft is still saved.'); }
          else setEvaluationStatus(body.status);
        })
        .catch(() => { setEvaluationStatus('failed'); setEvaluationMessage('Unable to check evaluation progress. Retry when you are online.'); });
    }, evaluationPolicy.pollingIntervalMs);
    return () => window.clearInterval(timer);
  }, [activePracticeItem, evaluationJobId, evaluationStatus]);

  const submitEvaluation = async () => {
    if (!draft.trim() || evaluationStatus === 'queued' || evaluationStatus === 'running') return;
    const sessionId = readCachedPracticeSessionId(activePracticeItem.id);
    if (!sessionId) {
      const localEvaluation = evaluatePseudocode(draft, activePracticeItem.id);
      setEvaluation(localEvaluation);
      recordLocalPracticeEvidence({ item: activePracticeItem, reasoningScore: localEvaluation.score });
      setEvaluationStatus('completed');
      setEvaluationMessage('Evaluated locally. Verified code tests require an active saved session.');
      return;
    }
    setEvaluationStatus('queued');
    setEvaluationMessage('Evaluation queued. This can take a few seconds.');
    try {
      const response = await fetch(`/api/practice/sessions/${sessionId}/evaluate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revisionNumber: remoteRevision }) });
      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        if (response.status === 429) throw new Error(`Too many submissions. Try again in ${retryAfter ?? 'a moment'} seconds.`);
        throw new Error('Evaluation request failed');
      }
      const body = await response.json() as { jobId: string; status: 'queued' | 'running' | 'completed' };
      setEvaluationJobId(body.jobId); setEvaluationStatus(body.status);
    } catch (error) {
      setEvaluationStatus('failed');
      const localEvaluation = evaluatePseudocode(draft, activePracticeItem.id);
      setEvaluation(localEvaluation);
      recordLocalPracticeEvidence({ item: activePracticeItem, reasoningScore: localEvaluation.score });
      setEvaluationMessage(error instanceof Error ? `${error.message} Showing a local evaluation instead.` : 'Unable to queue evaluation. Showing a local evaluation instead.');
    }
  };

  const cancelEvaluation = async () => {
    const sessionId = readCachedPracticeSessionId(activePracticeItem.id);
    if (!sessionId || !evaluationJobId) return;
    try {
      const response = await fetch(`/api/practice/sessions/${sessionId}/evaluate/${evaluationJobId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Unable to cancel evaluation');
      setEvaluationStatus('canceled');
      setEvaluationMessage('Evaluation canceled. Your draft is still saved.');
    } catch {
      setEvaluationMessage('Unable to cancel this evaluation. It may still complete.');
    }
  };

  const runInSandbox = async () => {
    const sessionId = readCachedPracticeSessionId(activePracticeItem.id);
    if (!sessionId) { setExecutionStatus('unavailable'); setExecutionOutput('Save your practice session before running code.'); return; }
    setExecutionStatus('running');
    setExecutionOutput('Running isolated correctness and edge-case tests…');
    setCodeGrade(null);
    setCodeChecked(false);
    setCompleted(false);
    try {
      const response = await fetch(`/api/practice/sessions/${sessionId}/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: codingLanguage, source: code }),
      });
      const body = await response.json().catch(() => null) as { status?: 'completed' | 'failed' | 'timed_out'; grade?: CodeGrade; error?: string } | null;
      if (response.status === 503) {
        setExecutionStatus('unavailable');
        setExecutionOutput('Verified execution is not enabled in this environment. Your reasoning result is still available.');
        return;
      }
      if (!response.ok || !body) throw new Error(body?.error ?? 'Verified execution failed');
      if (body.status !== 'completed' || !body.grade) {
        setExecutionStatus(body.status === 'timed_out' ? 'timed_out' : 'failed');
        setExecutionOutput(body.error ?? 'The submitted code did not complete successfully.');
        return;
      }

      const nextGrade = body.grade;
      const codeScore = Math.round((nextGrade.passedCount / Math.max(1, nextGrade.totalCount)) * 100);
      setCodeGrade(nextGrade);
      setCodeChecked(true);
      setExecutionStatus('completed');
      setCompleted(nextGrade.passed);
      setExecutionOutput(nextGrade.passed
        ? `Verified: all ${nextGrade.totalCount} hidden tests passed.`
        : `${nextGrade.passedCount} of ${nextGrade.totalCount} hidden tests passed.`);
      recordLocalPracticeEvidence({ item: activePracticeItem, reasoningScore: evaluation?.score ?? 0, codeScore });

      if (nextGrade.passed) {
        recordLocalPracticeCompletion({
          practiceItemId: activePracticeItem.id,
          label: activePracticeItem.label,
          evaluationScore: evaluation?.score ?? null,
        });
      }
    } catch (error) {
      setExecutionStatus('unavailable');
      setExecutionOutput(error instanceof Error ? error.message : 'Unable to run verified execution.');
    }
  };

  const saveBookmark = async () => {
    setLibraryStatus('Saving bookmark…');
    try {
      const response = await fetch('/api/learner/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: activePracticeItem.id,
          sessionId: readCachedPracticeSessionId(activePracticeItem.id) ?? null,
          label: activePracticeItem.label,
        }),
      });
      if (response.status === 401) {
        setLibraryStatus('Sign in to save bookmarks across devices. Your practice draft is still local.');
        return;
      }
      if (!response.ok) throw new Error('Bookmark could not be saved');
      setLibraryStatus('Saved to your study library.');
    } catch {
      setLibraryStatus('Bookmark could not be saved. Check your connection and try again.');
    }
  };

  const saveNote = async () => {
    const body = noteDraft.trim();
    if (!body) return;
    setLibraryStatus('Saving note…');
    try {
      const response = await fetch('/api/learner/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: activePracticeItem.id,
          sessionId: readCachedPracticeSessionId(activePracticeItem.id) ?? null,
          body,
          anchor: 'practice-workspace',
        }),
      });
      if (response.status === 401) {
        setLibraryStatus('Sign in to save notes across devices.');
        return;
      }
      if (!response.ok) throw new Error('Note could not be saved');
      setNoteDraft('');
      setLibraryStatus('Note saved to your study library.');
    } catch {
      setLibraryStatus('Note could not be saved. Check your connection and try again.');
    }
  };
  const resetSession = () => {
    setDraft("");
    setMode("text");
    setEvaluation(null);
    setCodeGrade(null);
    setCode(defaultCode(activePracticeItem.codeFunction, activePracticeItem.codeSignature, codingLanguage));
    setCodeChecked(false);
    setCompleted(false);
    setExecutionStatus('idle');
    setExecutionOutput('');
    removeBrowserStorage(storageKey);
    clearCachedPracticeSessionId(activePracticeItem.id);
    setSavedAt("Ready");
    setSyncStatus("ready");
    setElapsedSeconds(0);
  };

  const switchPracticeItem = (practiceId: string) => {
    const nextPracticeItem = getPracticeItem(practiceId);
    if (nextPracticeItem.id === activePracticeItem.id) {
      return;
    }

    writeBrowserStorage(storageKey, serializePracticeSession({
      draft,
      mode,
      language: codingLanguage,
      code,
      codeChecked,
      completed,
      evaluation,
      codeGrade,
    }));
    writeBrowserStorage(selectedPracticeItemKey, nextPracticeItem.id);
    setActivePracticeId(nextPracticeItem.id);
    setDraft("");
    setMode("text");
    setEvaluation(null);
    setCodeGrade(null);
    setCode(defaultCode(nextPracticeItem.codeFunction, nextPracticeItem.codeSignature, codingLanguage));
    setCodeChecked(false);
    setCompleted(false);
    setExecutionStatus('idle');
    setExecutionOutput('');
    setSavedAt("Ready");
    setSyncStatus("ready");
    setElapsedSeconds(0);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">M/</span>
          Method
        </div>
        <nav className="nav-group" aria-label="Primary navigation">
          <a className="nav-item" href="/">
            <LayoutDashboard size={17} /> Today
          </a>
          <a className="nav-item active" href="/practice" aria-current="page">
            <Braces size={17} /> Algorithms
          </a>
          <a className="nav-item" href="/system-design">
            <GitBranch size={17} /> System design
          </a>
          <a className="nav-item" href="/learn">
            <Compass size={17} /> Learning plan
          </a>
          <a className="nav-item" href="/dashboard">
            <LayoutDashboard size={17} /> Dashboard
          </a>
          <p className="nav-label">Your work</p>
          <a className="nav-item" href="/history">
            <ListChecks size={17} /> Practice history
          </a>
          <a className="nav-item" href="/library">
            <Bookmark size={17} /> Study library
          </a>
          <a className="nav-item" href="/settings">
            <BookOpen size={17} /> Preferences
          </a>
          <a className="nav-item" href="/requests">
            <CircleHelp size={17} /> Feedback
          </a>
        </nav>
        <div className="sidebar-progress">
          <strong>{activePracticeItem.label}</strong>
          <span>{secureCheckCount} of {totalCheckCount} checks verified</span>
          <div className="progress-track" aria-label={`${progressPercent}% complete`}>
            <div style={{ width: `${progressPercent}%` }} />
          </div>
          {completed ? <div className="complete-badge">{activePracticeItem.label} complete</div> : null}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="crumbs">
            <span>Algorithms</span>
            <span>/</span>
            <strong>{activePracticeItem.label}</strong>
          </div>
          <div className="top-actions">
            <span className="status-pill" aria-live="polite">
              <Save size={14} /> {savedAt}{syncStatus === "conflict" ? " · Resolve conflict" : ""}
            </span>
            <div className="avatar" aria-label={viewer ? `${viewer.displayName || viewer.email || 'Learner'} account` : 'Guest learner'}>
              {initialsFor(viewer?.displayName || viewer?.email)}
            </div>
          </div>
        </header>

        <div className="content">
          <div className="session-heading">
            <div>
              <p className="eyebrow"><span className="capitalize">{activePracticeItem.difficulty}</span> · {activePracticeItem.estimatedMinutes} min</p>
              <h1>{activePracticeItem.lesson.title}</h1>
              <p>{activePracticeItem.lesson.summary}</p>
            </div>
            <div className="metric">
              <Clock3 size={19} />
              <div>
                <strong>{formatElapsed(elapsedSeconds)}</strong>
                <div>time this visit</div>
              </div>
            </div>
          </div>

          <div className="work-grid">
            <section className="pane" aria-labelledby="lesson-title">
              <div className="pane-header">
                <div>
                  <h2>Concept & problem</h2>
                  <span className="pane-kicker">{activePracticeItem.lesson.eyebrow}</span>
                </div>
                <Lightbulb size={19} color="var(--mustard)" />
              </div>
              <h3 className="lesson-title" id="lesson-title">
                {activePracticeItem.lesson.title}
              </h3>
              <p className="lesson-copy">{activePracticeItem.lesson.summary}</p>
              <div className="principle">
                <strong>Invariant</strong>
                <br />
                {activePracticeItem.lesson.principle}
              </div>
              <div className="trace" aria-label="Example number trace">
                <div className="trace-label">
                  <span>{trace.title}</span>
                  <span>{trace.subtitle}</span>
                </div>
                <div className="number-row">
                  {trace.values.map((value, index) => (
                    <div
                      className={`number-cell ${trace.highlights.includes(index) ? "hit" : ""}`}
                      key={`${value}-${index}`}
                    >
                      {value}
                    </div>
                  ))}
                </div>
              </div>
              <hr className="section-rule" />
              <p className="eyebrow">Practice {String(activePracticeNumber).padStart(2, "0")}</p>
              <h3 className="problem-title">{activePracticeItem.problem.title}</h3>
              <p className="lesson-copy">{activePracticeItem.problem.prompt}</p>
              <div className="example">
                <span>Input</span> {activePracticeItem.problem.example.input}
                <br />
                <span>Output</span> {activePracticeItem.problem.example.output}
                <br />
                <span>Why</span> {activePracticeItem.problem.example.note}
              </div>
              <ul className="constraint-list">
                {activePracticeItem.problem.constraints.map((constraint) => (
                  <li key={constraint}>{constraint}</li>
                ))}
              </ul>
            </section>

            <section className="pane" aria-labelledby="workspace-title">
              <div className="pane-header">
                <div>
                  <h2 id="workspace-title">Your approach</h2>
                  <span className="pane-kicker">Plain English is valid pseudocode</span>
                </div>
                <div className="mode-switch" aria-label="Editor mode">
                  <button
                    className={mode === "text" ? "active" : ""}
                    onClick={() => setMode("text")}
                    type="button"
                  >
                    Text
                  </button>
                  <button
                    className={mode === "blocks" ? "active" : ""}
                    onClick={() => setMode("blocks")}
                    type="button"
                  >
                    Blocks
                  </button>
                </div>
              </div>

              <div className="editor-wrap">
                {mode === "text" ? (
                  <textarea
                    aria-label="Pseudocode draft"
                    className="editor"
                    onChange={(event) => updateDraft(event.target.value)}
                    placeholder={
                      "Describe your state, loop, lookup, update, and return.\n\nNo programming language required."
                    }
                    spellCheck="true"
                    value={draft}
                  />
                ) : (
                  <div className="block-builder" aria-label="Pseudocode block composer">
                    <div className="practice-switcher" role="tablist" aria-label="Practice items">
                      {practiceItems.map((item) => (
                        <button
                          key={item.id}
                          aria-pressed={item.id === activePracticeItem.id}
                          className={item.id === activePracticeItem.id ? "active" : ""}
                          onClick={() => switchPracticeItem(item.id)}
                          type="button"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div className="block-palette">
                      {blockOptions.map((block) => (
                        <button key={block.value} onClick={() => addBlock(block.value)} type="button">
                          + {block.label}
                        </button>
                      ))}
                    </div>
                    <div className="block-stack" aria-live="polite">
                      {blocks.length === 0 ? (
                        <p className="lesson-copy">Choose semantic blocks above to assemble your approach.</p>
                      ) : (
                        blocks.map((block, index) => (
                          <div className="code-block" key={`${block}-${index}`}>
                            <span>{block}</span>
                            <div className="block-actions">
                              <button
                                className="icon-button"
                                disabled={index === 0}
                                onClick={() => moveBlock(index, -1)}
                                type="button"
                                aria-label={`Move block ${index + 1} up`}
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                className="icon-button"
                                disabled={index === blocks.length - 1}
                                onClick={() => moveBlock(index, 1)}
                                type="button"
                                aria-label={`Move block ${index + 1} down`}
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button
                                className="icon-button"
                                onClick={() =>
                                  updateBlocks(blocks.filter((_, blockIndex) => blockIndex !== index))
                                }
                                type="button"
                                aria-label={`Remove block ${index + 1}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
                <div className="editor-footer">
                  <div className="editor-tools">
                    <button className="text-button" onClick={() => updateDraft(activePracticeItem.starterDraft)} type="button">
                      Use guided start
                    </button>
                    <button
                      className="text-button muted"
                      disabled={!draft}
                      onClick={() => updateDraft("")}
                      type="button"
                    >
                      Clear draft
                    </button>
                    <button className="text-button muted" onClick={resetSession} type="button">
                      Reset session
                    </button>
                  </div>
                  <div className="draft-stats" aria-label="Draft statistics" aria-live="polite">
                    <span>{draftLineCount} lines</span>
                    <span>{draftWordCount} words</span>
                    <span>{draftCharacterCount} chars</span>
                  </div>
                  <button
                    className="button"
                    disabled={!draft.trim() || evaluationStatus === 'queued' || evaluationStatus === 'running'}
                    onClick={() => void submitEvaluation()}
                    type="button"
                  >
                    <Sparkles size={16} /> {evaluationStatus === 'queued' || evaluationStatus === 'running' ? 'Evaluating…' : evaluationStatus === 'failed' ? 'Retry evaluation' : 'Evaluate reasoning'}
                  </button>
                  {(evaluationStatus === 'queued' || evaluationStatus === 'running') ? (
                    <button className="text-button muted" onClick={() => void cancelEvaluation()} type="button">Cancel evaluation</button>
                  ) : null}
                </div>
              </div>
            </section>

            <aside className="pane feedback-pane" aria-labelledby="feedback-title">
              <div className="pane-header">
                <div>
                  <h2 id="feedback-title">Reasoning checks</h2>
                  <span className="pane-kicker">Deterministic rubric · {evaluation?.rubricVersion ?? REASONING_RUBRIC_VERSION}</span>
                </div>
                <div className="score-ring" aria-label={evaluation ? `Reasoning score ${evaluation.score}` : 'Not evaluated'}>{evaluation?.score ?? '—'}</div>
              </div>
              <p className="feedback-summary" aria-live="polite">
                {evaluation?.summary ??
                  "Your evaluation will appear here with evidence tied to each requirement."}
              </p>
              {evaluationMessage ? <p className="pane-kicker" aria-live="polite">{evaluationMessage}</p> : null}
              <div className="finding-list">
                {evaluationFindings.map((finding) => (
                  <div
                    className={`finding ${evaluation ? finding.status : "waiting"}`}
                    key={finding.id}
                  >
                    <span className="finding-icon">
                      {evaluation && finding.status === "pass" ? <Check size={12} /> : <X size={12} />}
                    </span>
                    <div>
                      <strong>{finding.label}</strong>
                      <p>{evaluation ? finding.detail : "Waiting for evaluation."}</p>
                    </div>
                  </div>
                ))}
              </div>

              {approved ? (
                <div className="approved-panel">
                  <Code2 size={19} />
                  <strong>Implementation unlocked</strong>
                  <p>Your approved reasoning stays visible while you translate it into {codingLanguage === "python" ? "Python" : "TypeScript"}.</p>
                </div>
              ) : (
                <div className="locked-panel">
                  <LockKeyhole size={19} />
                  <strong>Coding stays quiet for now</strong>
                  <p>Pass the critical reasoning checks, or complete this as pseudocode-only practice.</p>
                </div>
              )}
              <section className="study-capture" aria-labelledby="study-capture-title">
                <div className="study-capture-heading">
                  <div>
                    <p className="pane-kicker">Keep the insight</p>
                    <h3 id="study-capture-title">Study library</h3>
                  </div>
                  <button className="icon-button" aria-label={`Bookmark ${activePracticeItem.label}`} onClick={() => void saveBookmark()} type="button">
                    <Bookmark size={17} />
                  </button>
                </div>
                <textarea
                  aria-label="Personal note for this practice item"
                  className="study-note"
                  maxLength={10000}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Capture a pattern, edge case, or thing to revisit…"
                  value={noteDraft}
                />
                <div className="study-capture-actions">
                  <button className="text-button" disabled={!noteDraft.trim()} onClick={() => void saveNote()} type="button">Save note</button>
                  <Link className="text-button muted" href="/library">View library</Link>
                </div>
                {libraryStatus ? <p className="study-status" aria-live="polite">{libraryStatus}</p> : null}
              </section>
            </aside>
          </div>

          <section className="coding-section" aria-labelledby="coding-title">
            <div className="pane-header">
              <div>
                <p className="eyebrow">Optional next step</p>
                <h2 id="coding-title">Translate the approved plan</h2>
                <span className="pane-kicker">
                  {codingLanguage === "python" ? "Python" : "TypeScript"} · isolated verification
                </span>
              </div>
              {approved ? <Check color="var(--moss)" /> : <LockKeyhole color="var(--muted)" />}
            </div>
            <div className="coding-grid">
              <textarea
                aria-label={`${codingLanguage === "python" ? "Python" : "TypeScript"} implementation`}
                className="editor code-editor"
                disabled={!approved}
                onChange={(event) => {
                  setCode(event.target.value);
                  setCodeChecked(false);
                  setCompleted(false);
                  setCodeGrade(null);
                  setExecutionStatus('idle');
                  setExecutionOutput('');
                }}
                value={code}
              />
              <div className="test-panel">
                <strong>Verified code tests</strong>
                {(codeGrade?.tests ?? [{ name: 'Correct outputs and return contract', passed: false }, { name: 'Problem-specific edge cases', passed: false }, { name: 'Isolated time and memory limits', passed: false }]).map((check) => (
                  <div className={`test-row ${codeChecked ? (check.passed ? "pass" : "revise") : ""}`} key={check.name}>
                    <span className="test-icon">
                      {codeChecked ? check.passed ? <Check size={12} /> : <X size={12} /> : null}
                    </span>
                    {check.name}
                  </div>
                ))}
                <button
                  className="button secondary full-button"
                  disabled={!approved}
                  onClick={() => {
                    setCode(buildCodeFromPlanForLanguage(activePracticeItem.codeFunction, activePracticeItem.codeSignature, draft, codingLanguage));
                    setCodeChecked(false);
                    setCompleted(false);
                    setCodeGrade(null);
                    setExecutionStatus('idle');
                    setExecutionOutput('');
                  }}
                  type="button"
                >
                  <Code2 size={15} /> Seed from plan
                </button>
                <button
                  className="button full-button"
                  disabled={!approved || executionStatus === 'running'}
                  onClick={() => void runInSandbox()}
                  type="button"
                >
                  <Play size={15} /> {executionStatus === 'running' ? 'Running verified tests…' : completed ? 'Run verified tests again' : 'Run verified tests'}
                </button>
                {executionStatus !== 'idle' ? (
                  <div className={`completion-panel ${executionStatus === 'failed' || executionStatus === 'timed_out' || executionStatus === 'unavailable' || (codeGrade && !codeGrade.passed) ? 'revise' : ''}`} aria-live="polite">
                    {executionStatus === 'completed' && codeGrade?.passed ? <Check size={16} /> : <Clock3 size={16} />} {executionOutput || `Execution ${executionStatus}.`}
                  </div>
                ) : null}
                {completed ? (
                  <div className="completion-panel" aria-live="polite">
                    <Check size={16} /> Verified and saved to your local progress.
                  </div>
                ) : codeChecked ? (
                  <div className="completion-panel revise" aria-live="polite">
                    <X size={16} /> Fix the failing cases and run verification again.
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <a href="/">
          <LayoutDashboard size={18} />Today
        </a>
        <a className="active" href="/practice" aria-current="page">
          <Braces size={18} />Practice
        </a>
        <a href="/history">
          <CircleHelp size={18} />History
        </a>
        <a href="/onboarding">
          <BookOpen size={18} />Plan
        </a>
      </nav>
    </div>
  );
}
