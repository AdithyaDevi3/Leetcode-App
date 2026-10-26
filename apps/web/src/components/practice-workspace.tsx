"use client";

import Link from "next/link";
import {
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Code2,
  Eye,
  EyeOff,
  Lightbulb,
  LockKeyhole,
  Play,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { defaultPracticeItem, getPracticeItem, practiceItems } from "@/lib/content";
import type { CodeGrade } from '@/lib/code-grading';
import { evaluatePseudocode, REASONING_RUBRIC_VERSION, type Evaluation } from "@/lib/evaluator";
import { evaluationPolicy } from '@/lib/evaluation-policy';
import { readLocalLearnerProfile } from "@/lib/local-learner";
import { recordLocalPracticeEvidence } from '@/lib/local-mastery';
import { recordLocalPracticeCompletion } from "@/lib/local-practice-history";
import { readBrowserStorage, writeBrowserStorage } from "@/lib/safe-browser-storage";
import {
  buildCodeFromPlanForLanguage,
  codingLanguageLabel,
  codingLanguages,
  joinBlocksIntoDraft,
  projectDraftBlocks,
  splitDraftIntoBlocks,
  type CodingLanguage,
  type EditorMode,
  type PracticeSessionState,
  defaultCode,
  selectedPracticeItemKey,
} from "@/lib/practice-session";
import {
  readCachedPracticeSessionId,
  type PracticeSyncStatus,
} from "@/lib/practice-sync";
import { useViewer } from '@/lib/use-viewer';
import { usePracticeOwner } from '@/lib/use-practice-owner';
import { usePracticePersistence } from '@/lib/use-practice-persistence';

const formatElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
};

const initialsFor = (name: string | null | undefined) => {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return words.length ? words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') : 'GL';
};

export function PracticeWorkspace({ assignmentRecipientId = null }: { assignmentRecipientId?: string | null }) {
  const scope = usePracticeOwner();
  if (!scope) return <main className="workspace"><p role="status">Opening your practice workspace…</p></main>;
  return <OwnedPracticeWorkspace key={scope} scope={scope} assignmentRecipientId={assignmentRecipientId} />;
}

function OwnedPracticeWorkspace({ scope, assignmentRecipientId }: { scope: string; assignmentRecipientId: string | null }) {
  const [activeAssignmentRecipientId, setActiveAssignmentRecipientId] = useState(assignmentRecipientId);
  const [activePracticeId, setActivePracticeId] = useState(defaultPracticeItem.id);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<EditorMode>("text");
  const [codingLanguage, setCodingLanguage] = useState<CodingLanguage>("python");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [codeGrade, setCodeGrade] = useState<CodeGrade | null>(null);
  const [savedAt, setSavedAt] = useState("Not saved");
  const [syncStatus, setSyncStatus] = useState<PracticeSyncStatus>("ready");
  const [code, setCode] = useState(defaultCode(defaultPracticeItem.codeFunction, defaultPracticeItem.codeSignature, "python"));
  const [codeChecked, setCodeChecked] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [evaluationStatus, setEvaluationStatus] = useState<'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'canceled'>('idle');
  const [evaluationJobId, setEvaluationJobId] = useState<string | null>(null);
  const [evaluationMessage, setEvaluationMessage] = useState<string | null>(null);
  const [remoteRevision, setRemoteRevision] = useState(1);
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'running' | 'completed' | 'failed' | 'timed_out' | 'unavailable'>('idle');
  const [executionOutput, setExecutionOutput] = useState('');
  const [assignmentSubmissionStatus, setAssignmentSubmissionStatus] = useState<'idle' | 'submitting' | 'queued' | 'submitted' | 'error'>('idle');
  const [assignmentSubmissionMessage, setAssignmentSubmissionMessage] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [libraryStatus, setLibraryStatus] = useState<string | null>(null);
  const [showReferenceAnswer, setShowReferenceAnswer] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [localRestoreComplete, setLocalRestoreComplete] = useState(false);
  const viewer = useViewer();
  const activePracticeItem = getPracticeItem(activePracticeId);
  const blockOptions = activePracticeItem.blockOptions;
  const activePracticeNumber = practiceItems.findIndex((item) => item.id === activePracticeItem.id) + 1;
  const trace = activePracticeItem.trace;
  const verificationGeneration = useRef(0);
  const liveWorkspace = useRef({ practiceId: activePracticeItem.id, draft, code, language: codingLanguage, mode });

  useEffect(() => {
    liveWorkspace.current = { practiceId: activePracticeItem.id, draft, code, language: codingLanguage, mode };
  }, [activePracticeItem.id, draft, code, codingLanguage, mode]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requestedPracticeId = new URLSearchParams(window.location.search).get("problem");
      const requestedAssignmentId = new URLSearchParams(window.location.search).get("assignment");
      if (requestedAssignmentId) setActiveAssignmentRecipientId(requestedAssignmentId);
      const savedPracticeId = requestedPracticeId ? null : readBrowserStorage(`${selectedPracticeItemKey}:${scope}`);
      const restoredPracticeItem = requestedPracticeId
        ? getPracticeItem(requestedPracticeId)
        : savedPracticeId
          ? getPracticeItem(savedPracticeId)
          : defaultPracticeItem;
      const preferredLanguage = readLocalLearnerProfile()?.preferredLanguage ?? "python";

      if (restoredPracticeItem.id !== defaultPracticeItem.id) {
        setActivePracticeId(restoredPracticeItem.id);
      }

      setCodingLanguage(preferredLanguage);
      setCode(defaultCode(restoredPracticeItem.codeFunction, restoredPracticeItem.codeSignature, preferredLanguage));
      setLocalRestoreComplete(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [scope]);

  const workspaceState = useMemo<PracticeSessionState>(() => ({
    draft, mode, language: codingLanguage, code, codeChecked, completed, evaluation, codeGrade,
  }), [draft, mode, codingLanguage, code, codeChecked, completed, evaluation, codeGrade]);
  const restoreWorkspace = useCallback((state: PracticeSessionState) => {
    verificationGeneration.current += 1;
    setDraft(state.draft); setMode(state.mode); setCodingLanguage(state.language);
    setCode(state.code); setCodeChecked(state.codeChecked); setCompleted(state.completed);
    setEvaluation(state.evaluation); setCodeGrade(state.codeGrade);
  }, []);
  const persistenceStatus = useCallback((label: string, status: PracticeSyncStatus, revision?: number) => {
    setSavedAt(label); setSyncStatus(status);
    if (revision !== undefined) setRemoteRevision(revision);
  }, []);
  const persistence = usePracticePersistence({
    scope, contentId: activePracticeItem.id, state: workspaceState, enabled: localRestoreComplete,
    restore: restoreWorkspace, status: persistenceStatus,
    generation: verificationGeneration,
    hasWork: Boolean(draft || mode !== 'text' || code !== defaultCode(activePracticeItem.codeFunction, activePracticeItem.codeSignature, codingLanguage) || evaluation || codeGrade),
  });

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

  const chooseCodingLanguage = (language: CodingLanguage) => {
    if (language === codingLanguage) return;
    setCodingLanguage(language);
    setCode(defaultCode(activePracticeItem.codeFunction, activePracticeItem.codeSignature, language));
    setCodeChecked(false);
    setCompleted(false);
    setCodeGrade(null);
    setExecutionStatus('idle');
    setExecutionOutput('');
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
  const canAccessCoding = approved || Boolean(activeAssignmentRecipientId);

  useEffect(() => {
    if (!evaluationJobId || (evaluationStatus !== 'queued' && evaluationStatus !== 'running')) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/practice/sessions/${readCachedPracticeSessionId(activePracticeItem.id, scope)}/evaluate/${evaluationJobId}`)
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
  }, [activePracticeItem, evaluationJobId, evaluationStatus, scope]);

  const submitEvaluation = async () => {
    if (!draft.trim() || evaluationStatus === 'queued' || evaluationStatus === 'running') return;
    const localEvaluation = evaluatePseudocode(draft, activePracticeItem.id);
    setEvaluation(localEvaluation);
    recordLocalPracticeEvidence({ item: activePracticeItem, reasoningScore: localEvaluation.score });
    const sessionId = readCachedPracticeSessionId(activePracticeItem.id, scope);
    if (!sessionId) {
      setEvaluationStatus('completed');
      setEvaluationMessage('Evaluation complete on this device.');
      return;
    }
    setEvaluationStatus('queued');
    setEvaluationMessage('Your evaluation is ready. Saving it to your account…');
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
      setEvaluation(localEvaluation);
      setEvaluationMessage(error instanceof Error ? `${error.message} Your on-device evaluation is still available.` : 'Unable to save the evaluation. Your on-device result is still available.');
    }
  };

  const cancelEvaluation = async () => {
    const sessionId = readCachedPracticeSessionId(activePracticeItem.id, scope);
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
    const sessionId = readCachedPracticeSessionId(activePracticeItem.id, scope);
    if (!sessionId) { setExecutionStatus('unavailable'); setExecutionOutput('Save your practice session before running code.'); return; }
    const submitted = { practiceId: activePracticeItem.id, source: code, language: codingLanguage };
    const generation = ++verificationGeneration.current;
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
      const latest = liveWorkspace.current;
      if (verificationGeneration.current !== generation || latest.practiceId !== submitted.practiceId) return;
      if (latest.code !== submitted.source || latest.language !== submitted.language) {
        setExecutionStatus('idle');
        setExecutionOutput('The earlier submission finished. Run your edited code to verify it.');
        return;
      }
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
      if (verificationGeneration.current !== generation || liveWorkspace.current.practiceId !== submitted.practiceId) return;
      setExecutionStatus('unavailable');
      setExecutionOutput(error instanceof Error ? error.message : 'Unable to run verified execution.');
    }
  };

  const submitAssignedTask = async () => {
    if (!activeAssignmentRecipientId || assignmentSubmissionStatus === 'submitting' || !code.trim()) return;
    setAssignmentSubmissionStatus('submitting');
    setAssignmentSubmissionMessage('Sending your work for assignment review…');
    try {
      const response = await fetch(`/api/learner/assignments/${encodeURIComponent(activeAssignmentRecipientId)}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: codingLanguage, source: code, requestKey: crypto.randomUUID() }),
      });
      const body = await response.json().catch(() => null) as { attempt?: { status?: string }; error?: string } | null;
      if (!response.ok || !body?.attempt) throw new Error(body?.error ?? 'Could not submit this assignment. Please try again.');
      if (body.attempt.status === 'queued' || body.attempt.status === 'running') {
        setAssignmentSubmissionStatus('queued');
        setAssignmentSubmissionMessage('Submitted. Automated checks are processing; your instructor can review the result in the class gradebook.');
      } else {
        setAssignmentSubmissionStatus('submitted');
        setAssignmentSubmissionMessage('Submission received and added to your instructor’s class review inbox. Your instructor will score it against the assignment rubric and publish your grade.');
      }
    } catch (error) {
      setAssignmentSubmissionStatus('error');
      setAssignmentSubmissionMessage(error instanceof Error ? error.message : 'Could not submit this assignment. Please try again.');
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
          sessionId: readCachedPracticeSessionId(activePracticeItem.id, scope) ?? null,
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
          sessionId: readCachedPracticeSessionId(activePracticeItem.id, scope) ?? null,
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
    verificationGeneration.current += 1;
    setDraft("");
    setMode("text");
    setEvaluation(null);
    setCodeGrade(null);
    setCode(defaultCode(activePracticeItem.codeFunction, activePracticeItem.codeSignature, codingLanguage));
    setCodeChecked(false);
    setCompleted(false);
    setExecutionStatus('idle');
    setExecutionOutput('');
    setShowReferenceAnswer(false);
    setSavedAt("Ready");
    setSyncStatus("ready");
    setElapsedSeconds(0);
  };

  const switchPracticeItem = (practiceId: string) => {
    const nextPracticeItem = getPracticeItem(practiceId);
    if (nextPracticeItem.id === activePracticeItem.id) {
      return;
    }
    verificationGeneration.current += 1;

    writeBrowserStorage(`${selectedPracticeItemKey}:${scope}`, nextPracticeItem.id);
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
    setShowReferenceAnswer(false);
    setSavedAt("Ready");
    setSyncStatus("ready");
    setElapsedSeconds(0);
  };

  return (
    <div className="practice-shell">
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
          {scope === 'device' ? <section className="mb-5 rounded-xl border border-[var(--line)] p-4" role="status">
            <p>Account connection unavailable. This draft stays on this device. Reconnect to open your account’s saved work.</p>
            <button className="button secondary" type="button" onClick={() => window.dispatchEvent(new Event('practice-owner-changed'))}>Reconnect</button>
          </section> : null}
          {persistence.conflict ? <section className="mb-5 rounded-xl border border-[var(--coral)] bg-[var(--coral-soft)] p-4" role="alert" aria-label="Resolve practice conflict">
            <h2>Choose which draft to continue</h2>
            <p>This device and the server have different work. Saving is paused. The other copy will remain available here for recovery.</p>
            <div className="flex flex-wrap gap-3">
              <button className="button" type="button" onClick={() => persistence.resolve('local')}>Continue with this draft</button>
              <button className="button secondary" type="button" onClick={() => persistence.resolve('remote')}>Use server draft</button>
            </div>
            <details className="mt-3"><summary>View server copy</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap">{persistence.conflict.state?.draft ?? persistence.conflict.draft}{'\n\n'}{persistence.conflict.state?.code}</pre></details>
          </section> : null}
          {persistence.recovery ? <details className="mb-5 rounded-xl border border-[var(--line)] p-4">
            <summary>Saved recovery copy</summary>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap">{persistence.recovery.draft}{'\n\n'}{persistence.recovery.code}</pre>
            <button className="button secondary" type="button" disabled={syncStatus === 'saving' || Boolean(persistence.conflict)} onClick={() => persistence.restoreCopy(persistence.recovery!)}>Restore recovery copy</button>
          </details> : null}
          {persistence.legacy ? <details className="mb-5 rounded-xl border border-[var(--line)] p-4">
            <summary>Older draft saved in this browser</summary>
            <p>This draft predates account-specific storage. Import it only if it belongs to you. Your current draft will be retained as a recovery copy.</p>
            <button className="button secondary" type="button" disabled={syncStatus === 'saving' || Boolean(persistence.conflict)} onClick={() => persistence.restoreCopy(persistence.legacy!)}>Import older browser draft</button>
          </details> : null}
          {persistence.deviceDraft ? <details className="mb-5 rounded-xl border border-[var(--line)] p-4">
            <summary>Offline draft from this browser</summary>
            <p>Work created while the account connection was unavailable stays separate. Import it to continue here and retain your current draft as a recovery copy.</p>
            <button className="button secondary" type="button" disabled={syncStatus === 'saving' || Boolean(persistence.conflict)} onClick={() => persistence.restoreCopy(persistence.deviceDraft!)}>Import offline draft</button>
          </details> : null}
          {syncStatus === 'offline' && scope !== 'device' ? <button className="button secondary mb-5" type="button" onClick={persistence.retry}>Retry saving</button> : null}
          {syncStatus === 'conflict' && !persistence.conflict ? <button className="button secondary mb-5" type="button" onClick={persistence.retry}>Reload server copy</button> : null}
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

          {activeAssignmentRecipientId ? <section className="mb-5 flex flex-col gap-3 rounded-xl border border-[var(--moss)] bg-[var(--moss-soft)] p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Class assignment submission instructions">
            <p className="mb-0 text-sm leading-6 text-[var(--ink)]"><strong>Class assignment.</strong> Complete the implementation, then choose <strong>Submit assigned task</strong> to send your work to your instructor for rubric-based grading. “Run verified tests” is a separate practice check and does not submit the assignment.</p>
            <a className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-[var(--moss)] bg-white px-4 font-bold text-[var(--moss)] no-underline" href="#coding-workspace">Go to submission →</a>
          </section> : null}
          <nav className="practice-stage-nav" aria-label="Practice stages"><a href="#workspace-title"><span>01</span>Write your approach</a><a href="#feedback-title"><span>02</span>Review feedback</a><a href="#coding-workspace"><span>03</span>Implement & test</a></nav>
          <div className="work-grid">
            <section className="pane problem-pane" aria-labelledby="lesson-title">
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

              <div className="approach-guide">
                <div>
                  <strong>Write the algorithm as ordered steps.</strong>
                  <p>Name the state you keep, the loop or recursion, each update, and the return value.</p>
                </div>
                <button
                  aria-controls="reference-pseudocode-answer"
                  aria-expanded={showReferenceAnswer}
                  className="button secondary"
                  onClick={() => setShowReferenceAnswer((visible) => !visible)}
                  type="button"
                >
                  {showReferenceAnswer ? <EyeOff size={15} /> : <Eye size={15} />}
                  {showReferenceAnswer ? 'Hide example answer' : 'Show example answer'}
                </button>
              </div>

              {showReferenceAnswer ? (
                <section className="reference-answer" id="reference-pseudocode-answer" aria-labelledby="reference-answer-title">
                  <div className="reference-answer-heading">
                    <div>
                      <span className="reference-answer-kicker"><BookOpen size={14} /> Reference answer</span>
                      <h3 id="reference-answer-title">One accepted pseudocode approach</h3>
                    </div>
                  </div>
                  <p className="reference-answer-intro">
                    Compare the order, state, and return step with your draft. Viewing this answer does not change or submit your work.
                  </p>
                  <pre><code>{activePracticeItem.starterDraft}</code></pre>
                  <div className="reference-answer-why">
                    <strong>Why it works</strong>
                    <p>{activePracticeItem.lesson.principle}</p>
                  </div>
                  <button className="button secondary" onClick={() => updateDraft(activePracticeItem.starterDraft)} type="button">
                    Use as my draft
                  </button>
                </section>
              ) : null}

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
                      Insert example answer
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
                    <Sparkles size={16} /> {evaluationStatus === 'queued' || evaluationStatus === 'running' ? 'Saving evaluation…' : evaluationStatus === 'failed' ? 'Retry evaluation' : 'Evaluate reasoning'}
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

              {canAccessCoding ? (
                <div className="approved-panel">
                  {approved ? <Code2 size={19} /> : <Check size={19} />}
                  <strong>{approved ? 'Implementation unlocked' : 'Assignment coding is open'}</strong>
                  <p>{approved ? `Your approved reasoning stays visible while you translate it into ${codingLanguageLabel(codingLanguage)}.` : 'You can work directly on this assigned implementation. Reasoning feedback remains available but does not block your submission.'}</p>
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

          <section id="coding-workspace" className="coding-section" aria-labelledby="coding-title">
            <div className="pane-header">
              <div>
                <p className="eyebrow">{activeAssignmentRecipientId ? 'Class assignment' : 'Optional next step'}</p>
                <h2 id="coding-title">{activeAssignmentRecipientId ? 'Complete your coding assignment' : 'Translate the approved plan'}</h2>
                <span className="pane-kicker">
                  {codingLanguageLabel(codingLanguage)} · isolated verification
                </span>
              </div>
              {canAccessCoding ? <Check color="var(--moss)" /> : <LockKeyhole color="var(--muted)" />}
            </div>
            <div className="language-toolbar">
              <div className="language-switch" role="group" aria-label="Solution language">
                {codingLanguages.map((language) => (
                  <button
                    aria-pressed={codingLanguage === language.value}
                    className={codingLanguage === language.value ? "active" : ""}
                    key={language.value}
                    onClick={() => chooseCodingLanguage(language.value)}
                    type="button"
                  >
                    <span>{language.label}</span>
                    <small>{language.runtime}</small>
                  </button>
                ))}
              </div>
              <p><LockKeyhole size={14} /> Network denied · bounded CPU, memory, output, and runtime</p>
            </div>
            <div className="coding-grid">
              <textarea
                aria-label={`${codingLanguage === 'python' ? 'Python' : codingLanguageLabel(codingLanguage)} implementation`}
                className="editor code-editor"
                disabled={!canAccessCoding}
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
                <div className="test-panel-heading">
                  <div>
                    <span>Server-owned suite</span>
                    <strong>Verified code tests</strong>
                  </div>
                  <span className={`grader-state ${completed ? 'pass' : codeChecked ? 'revise' : ''}`}>
                    {completed ? 'Passed' : codeChecked ? 'Revise' : 'Not run'}
                  </span>
                </div>
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
                  disabled={!canAccessCoding}
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
                  disabled={!canAccessCoding || executionStatus === 'running'}
                  onClick={() => void runInSandbox()}
                  type="button"
                >
                  <Play size={15} /> {executionStatus === 'running' ? 'Running verified tests…' : completed ? 'Run verified tests again' : 'Run verified tests'}
                </button>
                {activeAssignmentRecipientId ? <>
                  <button
                    className="button secondary full-button"
                    disabled={!code.trim() || assignmentSubmissionStatus === 'submitting' || assignmentSubmissionStatus === 'queued'}
                    onClick={() => void submitAssignedTask()}
                    type="button"
                  >
                    {assignmentSubmissionStatus === 'submitting' ? 'Submitting assignment…' : assignmentSubmissionStatus === 'queued' ? 'Verification queued' : assignmentSubmissionStatus === 'submitted' ? 'Submit another attempt' : 'Submit assigned task'}
                  </button>
                  {assignmentSubmissionMessage ? <div className={`completion-panel ${assignmentSubmissionStatus === 'error' ? 'revise' : ''}`} role={assignmentSubmissionStatus === 'error' ? 'alert' : 'status'}>{assignmentSubmissionMessage}</div> : null}
                </> : null}
                {executionStatus !== 'idle' || executionOutput.length > 0 ? (
                  <div className={`completion-panel ${executionStatus === 'idle' || executionStatus === 'failed' || executionStatus === 'timed_out' || executionStatus === 'unavailable' || (codeGrade && !codeGrade.passed) ? 'revise' : ''}`} aria-live="polite">
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


    </div>
  );
}
