"use client";

import Link from "next/link";
import { useRouter } from 'next/navigation';
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
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "@/lib/safe-browser-storage";
import { reasoningReadiness } from '@/lib/reasoning-progression';
import { readPracticeCache, writePracticeCache } from '@/lib/practice-cache';
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
  syncPracticeSession,
  type PracticeSyncStatus,
} from "@/lib/practice-sync";
import { useViewer } from '@/lib/use-viewer';
import { usePracticeOwner } from '@/lib/use-practice-owner';
import { usePracticePersistence } from '@/lib/use-practice-persistence';
import { CodeEditor, type CodeEditorHandle } from '@/components/code-editor';
import { PracticePanels, type PracticePanel } from '@/components/practice-panels';
import { parsePracticeStage, practiceStageUrl, type PracticeStage } from '@/lib/practice-view';
import { practiceCodeDrafts, practiceWorkspaceValidationError } from '@/lib/practice-session';
import './practice-workspace.css';

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
  const router = useRouter();
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
  const [manualReasoningDraft, setManualReasoningDraft] = useState<string | null>(null);
  const [movingOn, setMovingOn] = useState(false);
  const [continuationMessage, setContinuationMessage] = useState<string | null>(null);
  const [stage, setStage] = useState<PracticeStage>('approach');
  const [mobilePanel, setMobilePanel] = useState<PracticePanel>('task');
  const [contextTab, setContextTab] = useState<'problem' | 'approach' | 'feedback' | 'notes'>('problem');
  const [codeByLanguage, setCodeByLanguage] = useState<PracticeSessionState['codeByLanguage']>();
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const codeEditor = useRef<CodeEditorHandle>(null);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const viewer = useViewer();
  const activePracticeItem = getPracticeItem(activePracticeId);
  const blockOptions = activePracticeItem.blockOptions;
  const activePracticeNumber = practiceItems.findIndex((item) => item.id === activePracticeItem.id) + 1;
  const trace = activePracticeItem.trace;
  const verificationGeneration = useRef(0);
  const workspaceMounted = useRef(true);
  const liveWorkspace = useRef({ practiceId: activePracticeItem.id, draft, code, language: codingLanguage, mode });

  const changeStage = (next: PracticeStage) => {
    if (next !== stage) window.history.pushState(null, '', practiceStageUrl(window.location.href, next));
    setStage(next);
    setMobilePanel('task');
    window.requestAnimationFrame(() => stageHeading.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    const readStage = () => {
      setStage(parsePracticeStage(new URLSearchParams(window.location.search).get('stage'), Boolean(assignmentRecipientId)));
      setMobilePanel('task');
    };
    const timer = window.setTimeout(readStage, 0);
    const onPopState = () => { readStage(); window.requestAnimationFrame(() => stageHeading.current?.focus({ preventScroll: true })); };
    window.addEventListener('popstate', onPopState);
    return () => { window.clearTimeout(timer); window.removeEventListener('popstate', onPopState); };
  }, [assignmentRecipientId]);

  useEffect(() => {
    liveWorkspace.current = { practiceId: activePracticeItem.id, draft, code, language: codingLanguage, mode };
  }, [activePracticeItem.id, draft, code, codingLanguage, mode]);

  useEffect(() => {
    workspaceMounted.current = true;
    return () => { workspaceMounted.current = false; verificationGeneration.current += 1; };
  }, []);

  const overrideKey = `method:reasoning-continue:${scope}:${activePracticeItem.id}`;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setManualReasoningDraft(readBrowserStorage(overrideKey) === draft ? draft : null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [overrideKey, draft]);

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
    ...(codeByLanguage ? { codeDraftVersion: 1, codeByLanguage: { ...codeByLanguage, [codingLanguage]: code } } : {}),
  }), [draft, mode, codingLanguage, code, codeChecked, completed, evaluation, codeGrade, codeByLanguage]);
  const restoreWorkspace = useCallback((state: PracticeSessionState) => {
    verificationGeneration.current += 1;
    setDraft(state.draft); setMode(state.mode); setCodingLanguage(state.language);
    setCode(state.code); setCodeChecked(state.codeChecked); setCompleted(state.completed);
    setEvaluation(state.evaluation); setCodeGrade(state.codeGrade);
    setCodeByLanguage(state.codeByLanguage); setEditorMessage(null);
    setEvaluationJobId(null); setEvaluationStatus(state.evaluation ? 'completed' : 'idle'); setEvaluationMessage(null);
    setExecutionStatus('idle'); setExecutionOutput('');
  }, []);
  const persistenceStatus = useCallback((label: string, status: PracticeSyncStatus, revision?: number) => {
    setSavedAt(label); setSyncStatus(status);
    if (revision !== undefined) setRemoteRevision(revision);
  }, []);
  const hasWorkspaceWork = Boolean(draft || mode !== 'text' || code !== defaultCode(activePracticeItem.codeFunction, activePracticeItem.codeSignature, codingLanguage) || evaluation || codeGrade || codeByLanguage);
  const persistence = usePracticePersistence({
    scope, contentId: activePracticeItem.id, state: workspaceState, enabled: localRestoreComplete,
    restore: restoreWorkspace, status: persistenceStatus,
    generation: verificationGeneration,
    hasWork: hasWorkspaceWork,
  });

  const blocks = mode === "blocks"
    ? projectDraftBlocks(draft, activePracticeItem.codeFunction)
    : splitDraftIntoBlocks(draft);

  const updateDraft = (nextDraft: string) => {
    if (nextDraft.length > 50_000) { setEditorMessage('The approach exceeds the 50,000 character save limit. Your current work has not been replaced.'); return false; }
    const error = practiceWorkspaceValidationError({ ...workspaceState, draft: nextDraft });
    if (error) { setEditorMessage(error); return false; }
    setEditorMessage(null);
    liveWorkspace.current = { ...liveWorkspace.current, draft: nextDraft };
    setDraft(nextDraft);
    setEvaluationStatus('idle');
    setEvaluationJobId(null);
    setEvaluationMessage(null);
    setEvaluation(null);
    setContinuationMessage(null);
    setCodeGrade(null);
    setCodeChecked(false);
    setCompleted(false);
    setExecutionStatus('idle');
    setExecutionOutput('');
    return true;
  };

  const addBlock = (block: string) => {
    updateDraft(joinBlocksIntoDraft([...blocks, block]));
  };

  const chooseCodingLanguage = (language: CodingLanguage) => {
    if (language === codingLanguage) return;
    const drafts = practiceCodeDrafts(workspaceState);
    const nextCode = drafts[language] ?? defaultCode(activePracticeItem.codeFunction, activePracticeItem.codeSignature, language);
    const nextState = { ...workspaceState, language, code: nextCode, codeDraftVersion: 1 as const, codeByLanguage: { ...drafts, [language]: nextCode } };
    const error = practiceWorkspaceValidationError(nextState);
    if (error) { setEditorMessage(error); return false; }
    verificationGeneration.current += 1;
    liveWorkspace.current = { ...liveWorkspace.current, language, code: nextCode };
    setCodeByLanguage(nextState.codeByLanguage);
    setCodingLanguage(language);
    setCode(nextCode);
    setEditorMessage(null);
    setCodeChecked(false);
    setCompleted(false);
    setCodeGrade(null);
    setExecutionStatus('idle');
    setExecutionOutput('');
  };

  const updateCode = (source: string) => {
    const nextState = { ...workspaceState, code: source, codeDraftVersion: 1 as const, codeByLanguage: { ...practiceCodeDrafts(workspaceState), [codingLanguage]: source } };
    const error = practiceWorkspaceValidationError(nextState);
    if (error) { setEditorMessage(error); return false; }
    liveWorkspace.current = { ...liveWorkspace.current, code: source };
    setCode(source); setCodeByLanguage(nextState.codeByLanguage); setEditorMessage(null);
    setCodeChecked(false); setCompleted(false); setCodeGrade(null);
    setExecutionStatus('idle'); setExecutionOutput('');
    return true;
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
  // Re-check the current text so an old restored result cannot unlock a changed plan.
  const readiness = useMemo(() => evaluation ? reasoningReadiness(evaluatePseudocode(draft, activePracticeId)) : 'unevaluated', [evaluation, draft, activePracticeId]);
  const reasoningReady = readiness === 'optimal' || readiness === 'close';
  const manualContinuation = manualReasoningDraft === draft;
  const canAccessCoding = reasoningReady || manualContinuation || Boolean(activeAssignmentRecipientId);
  const nextPracticeItem = practiceItems[activePracticeNumber] ?? null;

  useEffect(() => {
    if (!evaluationJobId || (evaluationStatus !== 'queued' && evaluationStatus !== 'running')) return;
    let current = true;
    const timer = window.setInterval(() => {
      void fetch(`/api/practice/sessions/${readCachedPracticeSessionId(activePracticeItem.id, scope)}/evaluate/${evaluationJobId}`)
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('Evaluation status unavailable')))
        .then((body: { status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled'; result?: { evaluation?: Evaluation }; error?: string }) => {
          if (!current) return;
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
        .catch(() => { if (current) { setEvaluationStatus('failed'); setEvaluationMessage('Unable to check evaluation progress. Retry when you are online.'); } });
    }, evaluationPolicy.pollingIntervalMs);
    return () => { current = false; window.clearInterval(timer); };
  }, [activePracticeItem, draft, evaluationJobId, evaluationStatus, scope]);

  const submitEvaluation = async () => {
    if (!draft.trim() || evaluationStatus === 'queued' || evaluationStatus === 'running') return;
    const localEvaluation = evaluatePseudocode(draft, activePracticeItem.id);
    const evaluated = { practiceId: activePracticeItem.id, draft, generation: verificationGeneration.current };
    const stillCurrent = () => workspaceMounted.current && verificationGeneration.current === evaluated.generation
      && liveWorkspace.current.practiceId === evaluated.practiceId && liveWorkspace.current.draft === evaluated.draft;
    setEvaluation(localEvaluation);
    changeStage('feedback');
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
      if (!stillCurrent()) return;
      setEvaluationJobId(body.jobId); setEvaluationStatus(body.status);
    } catch (error) {
      if (!stillCurrent()) return;
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
      const latest = liveWorkspace.current;
      if (verificationGeneration.current !== generation || latest.practiceId !== submitted.practiceId || latest.code !== submitted.source || latest.language !== submitted.language) return;
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
    if (hasWorkspaceWork
      && !window.confirm('Reset this practice session? Your current workspace will be kept as a recovery copy.')) return;
    const resetCode = defaultCode(activePracticeItem.codeFunction, activePracticeItem.codeSignature, codingLanguage);
    const resetDrafts = { [codingLanguage]: resetCode };
    persistence.restoreCopy({ ...workspaceState, draft: '', mode: 'text', code: resetCode, codeByLanguage: resetDrafts, codeDraftVersion: 1, evaluation: null, codeGrade: null, codeChecked: false, completed: false });
    setCodeByLanguage(resetDrafts);
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
    setManualReasoningDraft(null);
    setContinuationMessage(null);
    setEvaluationJobId(null); setEvaluationStatus('idle'); setEvaluationMessage(null);
    removeBrowserStorage(overrideKey);
  };

  const switchPracticeItem = async (practiceId: string) => {
    const nextPracticeItem = getPracticeItem(practiceId);
    if (movingOn || activeAssignmentRecipientId || nextPracticeItem.id === activePracticeItem.id) return;
    if (persistence.conflict || syncStatus === 'conflict') { setContinuationMessage('Resolve the preserved draft conflict before changing activities.'); return; }
    setMovingOn(true); setContinuationMessage('Saving your work before continuing…');
    const snapshot = { ...liveWorkspace.current };
    const cache = readPracticeCache(activePracticeItem.id, scope);
    const keptLocally = writePracticeCache(activePracticeItem.id, scope, { version: 2, base: null, ...cache, state: workspaceState });
    try {
      const hasWork = hasWorkspaceWork;
      const result = hasWork ? await syncPracticeSession({ contentId: activePracticeItem.id, scope, draft, currentStage: 'implement', state: workspaceState }) : null;
      const latest = liveWorkspace.current;
      if (!workspaceMounted.current || Object.entries(snapshot).some(([key, value]) => latest[key as keyof typeof latest] !== value)) {
        if (workspaceMounted.current) setContinuationMessage('Your latest edit stays here. Continue again after reviewing it.');
        return;
      }
      if (result?.status === 'conflict') { persistence.retry(); setContinuationMessage('Your saved work changed elsewhere. Resolve the preserved draft conflict before continuing.'); return; }
      if (hasWork && result?.status !== 'saved' && !keptLocally) { setContinuationMessage('Could not preserve this draft. Save or copy your work before continuing.'); return; }
      writeBrowserStorage(`${selectedPracticeItemKey}:${scope}`, nextPracticeItem.id);
      router.push(`/practice?problem=${encodeURIComponent(nextPracticeItem.id)}`);
    } catch {
      if (!workspaceMounted.current) return;
      // A failed owner check must never advance into another account's workspace.
      setContinuationMessage('Your draft is preserved here. Retry saving before continuing.');
    } finally { if (workspaceMounted.current) setMovingOn(false); }
  };

  const continueToNextPractice = () => {
    if (nextPracticeItem && (reasoningReady || manualContinuation)) void switchPracticeItem(nextPracticeItem.id);
  };

  const seedFromPlan = () => {
    const seeded = buildCodeFromPlanForLanguage(activePracticeItem.codeFunction, activePracticeItem.codeSignature, draft, codingLanguage);
    if (code !== defaultCode(activePracticeItem.codeFunction, activePracticeItem.codeSignature, codingLanguage)
      && code !== seeded && !window.confirm('Replace this language’s code with your plan? Your current workspace will be kept as a recovery copy.')) return;
    const state = { ...workspaceState, code: seeded, codeDraftVersion: 1 as const,
      codeByLanguage: { ...practiceCodeDrafts(workspaceState), [codingLanguage]: seeded },
      codeChecked: false, completed: false, codeGrade: null };
    const error = practiceWorkspaceValidationError(state);
    if (error) { setEditorMessage(error); return; }
    persistence.restoreCopy(state);
    setExecutionStatus('idle'); setExecutionOutput('');
    window.requestAnimationFrame(() => codeEditor.current?.focus());
  };

  return (
    <div className="practice-shell practice-immersive">
      <main className="workspace">
        <header className="topbar practice-workbench-header">
          <nav className="workbench-links" aria-label="Primary navigation">
            <Link className="workbench-brand" href="/" aria-label="Method home">M</Link>
            <Link href="/practice" aria-current="page">Practice</Link>
            <Link href="/roadmap">Questions</Link>
          </nav>
          <div className="workbench-activity">
            <h1>{activePracticeItem.problem.title}</h1>
            <label className="workbench-picker"><span className="sr-only">Practice activity</span><select aria-label="Practice activity" disabled={Boolean(activeAssignmentRecipientId) || movingOn} value={activePracticeItem.id} onChange={event => void switchPracticeItem(event.target.value)}>{practiceItems.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.label}</option>)}</select></label>
          </div>
          <div className="top-actions">
            <span className="status-pill" aria-live="polite"><Save size={14} /> {savedAt}{syncStatus === 'conflict' ? ' · Resolve conflict' : ''}</span>
            <span className="workbench-timer" aria-label="Time this visit"><Clock3 size={14} />{formatElapsed(elapsedSeconds)}</span>
            <Link className="avatar" href={viewer ? '/settings' : '/auth'} aria-label={viewer ? `${viewer.displayName || 'Learner'} account` : 'Sign in'}>{initialsFor(viewer?.displayName || viewer?.email)}</Link>
            <details className="workbench-menu"><summary>More</summary><nav aria-label="Workspace links"><Link href="/dashboard">Dashboard</Link><Link href="/learn">Learning plan</Link><Link href="/system-design">System design</Link><Link href="/classes">Classes</Link><Link href="/teach">Instructor workspace</Link><Link href="/history">History</Link><Link href="/library">Library</Link><Link href="/settings">Settings</Link><Link href="/onboarding">Learning goals</Link><Link href="/requests">Feedback</Link>{viewer?.canAccessAdministration ? <Link href="/admin">Administration</Link> : null}</nav></details>
          </div>
        </header>
        <div className="practice-notices">
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

          {editorMessage ? <p role="alert">{editorMessage}</p> : null}
          {continuationMessage && stage !== 'feedback' ? <p role="status">{continuationMessage}</p> : null}
        </div>
        <div className="workbench-stagebar">
          <nav className="practice-stage-nav" aria-label="Practice stages">
            {([{value:'approach', label:'Approach'}, {value:'feedback', label:'Feedback'}, {value:'code', label:'Code & test'}] as const).map((item, index) => <button key={item.value} type="button" aria-label={`${String(index + 1).padStart(2, '0')} ${item.label}`} aria-current={stage === item.value ? 'step' : undefined} onClick={() => changeStage(item.value)}><span>{String(index + 1).padStart(2, '0')}</span>{item.label}</button>)}
          </nav>
          <h2 className="sr-only" ref={stageHeading} tabIndex={-1}>{stage === 'approach' ? 'Write your approach' : stage === 'feedback' ? 'Review reasoning feedback' : 'Implement and test'}</h2>
          <span className="workbench-stage-detail">{activeAssignmentRecipientId ? 'Class assignment' : `${activePracticeItem.difficulty} · ${activePracticeItem.estimatedMinutes} min`}</span>
        </div>
        {activeAssignmentRecipientId ? <div className="workbench-assignment" aria-label="Class assignment submission instructions"><p><strong>Class assignment.</strong> Run verified tests checks your code. <strong>Submit assigned task</strong> sends it to your instructor for grading.</p>{stage !== 'code' ? <button className="text-button" type="button" onClick={() => changeStage('code')}>Go to submission →</button> : null}</div> : null}
        <PracticePanels key={`${scope}:${activePracticeItem.id}:panels`} activePanel={mobilePanel} onPanelChange={setMobilePanel} results={stage === 'code' ? (
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

        ) : undefined} context={(
          <div className="practice-context">
            <div className="practice-context-tabs" role="tablist" aria-label="Problem context">
              {([{value:'problem',label:'Problem'},{value:'approach',label:'My approach'},{value:'feedback',label:'Feedback'},{value:'notes',label:'Notes'}] as const).map(item => <button key={item.value} type="button" role="tab" id={`context-tab-${item.value}`} aria-controls={`context-${item.value}`} aria-selected={contextTab === item.value} onClick={() => setContextTab(item.value)}>{item.label}</button>)}
            </div>
            <div role="tabpanel" id="context-problem" aria-labelledby="context-tab-problem" hidden={contextTab !== 'problem'}>
            <section className="pane problem-pane" aria-labelledby="problem-description-title">
              <p className="eyebrow">Practice {String(activePracticeNumber).padStart(2, "0")}</p>
              <h2 className="problem-title" id="problem-description-title">{activePracticeItem.problem.title}</h2>
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
              <hr className="section-rule" />
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
            </section>


            </div>
            <section className="pane" role="tabpanel" id="context-approach" aria-labelledby="context-tab-approach" hidden={contextTab !== 'approach'}><h2>Your current approach</h2><p className="pane-kicker">{evaluation ? 'Review the feedback before relying on this plan.' : 'This draft has not been evaluated.'}</p><pre className="approach-preview">{draft || 'Write an approach to keep it beside your implementation.'}</pre><button className="button secondary" type="button" onClick={() => changeStage('approach')}>Edit approach</button></section>
            <section className="pane" role="tabpanel" id="context-feedback" aria-labelledby="context-tab-feedback" hidden={contextTab !== 'feedback'}><h2>Reasoning feedback</h2><p>{evaluation?.summary ?? 'Evaluate your approach to see feedback.'}</p>{evaluation ? <p>Reasoning score: {evaluation.score}</p> : null}<button className="button secondary" type="button" onClick={() => changeStage('feedback')}>Open full feedback</button></section>
            <div role="tabpanel" className="context-notes" id="context-notes" aria-labelledby="context-tab-notes" hidden={contextTab !== 'notes'}>
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

            </div>
          </div>
        )}>
          <div className="practice-stage-panel" hidden={stage !== 'approach'}>
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
                  <CodeEditor key={`${scope}:${activePracticeItem.id}:approach`} editorKey="approach" label="Pseudocode draft" language="text" value={draft} onChange={updateDraft} />
                ) : (
                  <div className="block-builder" aria-label="Pseudocode block composer">
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


          </div>
          <div className="practice-stage-panel" hidden={stage !== 'feedback'}>
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
                  <strong>{reasoningReady ? readiness === 'optimal' ? 'Implementation unlocked' : 'Close enough to continue' : manualContinuation ? 'Continued manually' : 'Assignment coding is open'}</strong>
                  <p>{reasoningReady ? readiness === 'optimal' ? `Your reasoning meets every check and stays visible while you translate it into ${codingLanguageLabel(codingLanguage)}.` : 'At least 80% of the reasoning checks pass with no conflicting algorithm instruction. You can move on and revisit the remaining feedback.' : manualContinuation ? 'You chose to continue. Your reasoning feedback and verified code result stay separate.' : 'You can work directly on this assigned implementation. Reasoning feedback remains available but does not block your submission.'}</p>
                </div>
              ) : (
                <div className="locked-panel">
                  <LockKeyhole size={19} />
                  <strong>Coding stays quiet for now</strong>
                  <p>Get close to an implementation-ready plan, or use the manual continue option below.</p>
                </div>
              )}
              <section className="study-capture" aria-label="Continue practice">
                <h3 className="font-bold">Your next step</h3>
                {!reasoningReady && !manualContinuation ? <button className="button secondary" type="button" onClick={() => { writeBrowserStorage(overrideKey, draft); setManualReasoningDraft(draft); setContinuationMessage('Manual continuation enabled. Your feedback is unchanged.'); }}>Continue anyway</button> : null}
                {canAccessCoding ? <div className="flex flex-wrap gap-3">
                  <button className="button secondary" type="button" onClick={() => { changeStage('code'); window.requestAnimationFrame(() => codeEditor.current?.focus()); }}>Continue to coding</button>
                  {!activeAssignmentRecipientId && (reasoningReady || manualContinuation) ? nextPracticeItem ? <button className="button" type="button" disabled={movingOn} onClick={() => void continueToNextPractice()}>{movingOn ? 'Saving and continuing…' : 'Next practice question'}</button> : <Link className="button" href="/roadmap">Return to roadmap</Link> : null}
                </div> : null}
                {continuationMessage ? <p className="study-status" role="status" aria-label="Practice continuation status">{continuationMessage}</p> : null}
              </section>
              <div className="feedback-actions">
                <button className="button secondary" type="button" onClick={() => changeStage('approach')}>Edit approach</button>
                {evaluationStatus === 'failed' ? <button className="button" type="button" onClick={() => void submitEvaluation()}>Retry evaluation</button> : null}
                {evaluationStatus === 'queued' || evaluationStatus === 'running' ? <button className="button secondary" type="button" onClick={() => void cancelEvaluation()}>Cancel evaluation</button> : null}
              </div>
            </aside>

          </div>
          <div className="practice-stage-panel practice-code-stage" hidden={stage !== 'code'}>
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
                    aria-label={`${language.label} ${language.runtime}`}
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

            {!canAccessCoding ? <div className="coding-access-notice" role="status"><p>Get feedback on your approach, or continue manually to start coding.</p><button className="button secondary" type="button" onClick={() => { writeBrowserStorage(overrideKey, draft); setManualReasoningDraft(draft); }}>Continue anyway</button></div> : null}
            <CodeEditor key={`${scope}:${activePracticeItem.id}:code`} ref={codeEditor} editorKey={codingLanguage} label={`${codingLanguage === 'python' ? 'Python' : codingLanguageLabel(codingLanguage)} implementation`} language={codingLanguage} value={code} onChange={updateCode} disabled={!canAccessCoding} className="code-editor" />
            <div className="practice-code-actions">
              <button className="button secondary" type="button" disabled={!canAccessCoding} onClick={seedFromPlan}><Code2 size={15} />Seed from plan</button>
              <button className="button" disabled={!canAccessCoding || executionStatus === 'running'} onClick={() => { setMobilePanel('results'); void runInSandbox(); }} type="button"><Play size={15} />{executionStatus === 'running' ? 'Running verified tests…' : completed ? 'Run verified tests again' : 'Run verified tests'}</button>
              {activeAssignmentRecipientId ? <button className="button secondary" disabled={!code.trim() || assignmentSubmissionStatus === 'submitting' || assignmentSubmissionStatus === 'queued'} onClick={() => void submitAssignedTask()} type="button">{assignmentSubmissionStatus === 'submitting' ? 'Submitting assignment…' : assignmentSubmissionStatus === 'queued' ? 'Verification queued' : assignmentSubmissionStatus === 'submitted' ? 'Submit another attempt' : 'Submit assigned task'}</button> : null}
            </div>
            {assignmentSubmissionMessage ? <p className="completion-panel" role={assignmentSubmissionStatus === 'error' ? 'alert' : 'status'}>{assignmentSubmissionMessage}</p> : null}
          </section>
          </div>
        </PracticePanels>
        <footer className="practice-workbench-footer">
          <div><span>Practice {activePracticeNumber} of {practiceItems.length}</span>{stage !== 'approach' ? <button className="text-button" type="button" onClick={() => changeStage(stage === 'code' ? 'feedback' : 'approach')}>← Previous stage</button> : null}</div>
          <div>{stage === 'approach' && !canAccessCoding ? <button className="button secondary" type="button" onClick={() => { writeBrowserStorage(overrideKey, draft); setManualReasoningDraft(draft); setContinuationMessage('Manual continuation enabled. Your feedback is unchanged.'); }}>Continue anyway</button> : null}{stage === 'approach' ? <button className="button secondary" type="button" onClick={() => changeStage('feedback')}>Review feedback →</button> : stage === 'feedback' && canAccessCoding ? <button className="button secondary" type="button" onClick={() => changeStage('code')}>Code & test →</button> : stage === 'code' && nextPracticeItem && !activeAssignmentRecipientId && (reasoningReady || manualContinuation) ? <button className="button secondary" type="button" disabled={movingOn} onClick={continueToNextPractice}>Next practice question</button> : null}</div>
        </footer>
      </main>
    </div>
  );
}
