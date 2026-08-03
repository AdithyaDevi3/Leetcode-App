"use client";

import {
  Bell,
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
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { defaultPracticeItem, getPracticeItem, practiceItems, starterDraft } from "@/lib/content";
import { evaluatePseudocode, type Evaluation } from "@/lib/evaluator";
import {
  buildCodeFromPlan,
  deserializePracticeSession,
  joinBlocksIntoDraft,
  sessionStorageKey,
  splitDraftIntoBlocks,
  stripCodeComments,
  type EditorMode,
  type PracticeSessionState,
  serializePracticeSession,
  defaultCode,
  selectedPracticeItemKey,
} from "@/lib/practice-session";

export function PracticeWorkspace() {
  const [activePracticeId, setActivePracticeId] = useState(defaultPracticeItem.id);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<EditorMode>("text");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [savedAt, setSavedAt] = useState("Not saved");
  const [code, setCode] = useState(defaultCode(defaultPracticeItem.codeFunction));
  const [codeChecked, setCodeChecked] = useState(false);
  const [completed, setCompleted] = useState(false);
  const activePracticeItem = getPracticeItem(activePracticeId);
  const storageKey = sessionStorageKey(activePracticeItem.id);
  const blockOptions = activePracticeItem.blockOptions;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedPracticeId = window.localStorage.getItem(selectedPracticeItemKey);
      const restoredPracticeItem = savedPracticeId ? getPracticeItem(savedPracticeId) : activePracticeItem;

      if (restoredPracticeItem.id !== activePracticeItem.id) {
        setActivePracticeId(restoredPracticeItem.id);
      }

      const savedSession = window.localStorage.getItem(sessionStorageKey(restoredPracticeItem.id));
      if (!savedSession) {
        setSavedAt("Ready");
        return;
      }

      const restoredSession = deserializePracticeSession(savedSession);
      if (!restoredSession) {
        setSavedAt("Ready");
        return;
      }

      setDraft(restoredSession.draft);
      setMode(restoredSession.mode);
      setCode(restoredSession.code);
      setCodeChecked(restoredSession.codeChecked);
      setCompleted(restoredSession.completed);
      setEvaluation(restoredSession.evaluation);
      setSavedAt("Restored locally");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activePracticeItem, activePracticeItem.codeFunction]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const session: PracticeSessionState = {
        draft,
        mode,
        code,
        codeChecked,
        completed,
        evaluation,
      };

      window.localStorage.setItem(storageKey, serializePracticeSession(session));
      window.localStorage.setItem(selectedPracticeItemKey, activePracticeItem.id);
      setSavedAt(
        draft || mode !== "text" || code !== defaultCode(activePracticeItem.codeFunction) || codeChecked || completed || evaluation
          ? "Saved locally"
          : "Ready",
      );
    }, 450);

    return () => window.clearTimeout(timer);
  }, [draft, mode, code, codeChecked, completed, evaluation, storageKey, activePracticeItem.id]);

  const blocks = splitDraftIntoBlocks(draft);

  const updateDraft = (nextDraft: string) => {
    setDraft(nextDraft);
    setEvaluation(null);
    setCodeChecked(false);
    setCompleted(false);
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
  const secureConceptCount = completed ? 4 : 3;
  const progressPercent = Math.round((secureConceptCount / 7) * 100);
  const implementationSource = stripCodeComments(code);
  const loopCount = implementationSource.match(/\bfor\s*\(|\.forEach\s*\(/g)?.length ?? 0;
  const translationChecks =
    activePracticeItem.id === "first-unique-index-v1"
      ? [
          {
            label: "Counts values in a map",
            passed: /\bnew\s+Map\b|\bMap\s*</.test(implementationSource) && /count|frequency/i.test(implementationSource),
          },
          {
            label: "Separates counting from selection",
            passed: loopCount >= 2 || /second pass|again|then/i.test(implementationSource),
          },
          {
            label: "Checks for unique count",
            passed: /count.*1|equals\s*1|is\s*1/i.test(implementationSource),
          },
          {
            label: "Returns the first index",
            passed: /return\s+\w*index|return\s+\w*position/i.test(implementationSource),
          },
          {
            label: "Returns -1 when no unique value exists",
            passed: /-1|no unique|none/i.test(implementationSource),
          },
        ]
      : [
          {
            label: "Map state mirrors the plan",
            passed: /\bnew\s+Map\b|\bMap\s*</.test(implementationSource),
          },
          {
            label: "One traversal over values",
            passed: loopCount === 1,
          },
          {
            label: "Complement lookup before storing",
            passed:
              /target\s*-/.test(implementationSource) &&
              /\.has\s*\(|\.get\s*\(/.test(implementationSource) &&
              /\.set\s*\(/.test(implementationSource),
          },
          {
            label: "Returns two positions",
            passed: /return\s*\[[^\]]+,[^\]]+\]/.test(implementationSource),
          },
        ];
  const translationPassed = translationChecks.every((check) => check.passed);

  const checkTranslation = () => {
    setCodeChecked(true);
    setCompleted(translationPassed);
    if (translationPassed) {
      window.localStorage.setItem(
        storageKey,
        serializePracticeSession({
          draft,
          mode,
          code,
          codeChecked: true,
          completed: true,
          evaluation,
        }),
      );
    }
  };

  const resetSession = () => {
    setDraft("");
    setMode("text");
    setEvaluation(null);
    setCode(defaultCode(activePracticeItem.codeFunction));
    setCodeChecked(false);
    setCompleted(false);
    window.localStorage.removeItem(storageKey);
    setSavedAt("Ready");
  };

  const switchPracticeItem = (practiceId: string) => {
    const nextPracticeItem = getPracticeItem(practiceId);
    if (nextPracticeItem.id === activePracticeItem.id) {
      return;
    }

    window.localStorage.setItem(storageKey, serializePracticeSession({
      draft,
      mode,
      code,
      codeChecked,
      completed,
      evaluation,
    }));
    window.localStorage.setItem(selectedPracticeItemKey, nextPracticeItem.id);
    setActivePracticeId(nextPracticeItem.id);
    setDraft("");
    setMode("text");
    setEvaluation(null);
    setCode(defaultCode(nextPracticeItem.codeFunction));
    setCodeChecked(false);
    setCompleted(false);
    setSavedAt("Ready");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark">M/</span>
          Method
        </div>
        <nav className="nav-group">
          <button className="nav-item" type="button">
            <LayoutDashboard size={17} /> Today
          </button>
          <button className="nav-item active" type="button">
            <Braces size={17} /> Algorithms
          </button>
          <button className="nav-item" type="button">
            <GitBranch size={17} /> System design
          </button>
          <button className="nav-item" type="button">
            <Compass size={17} /> Concept map
          </button>
          <p className="nav-label">Your work</p>
          <button className="nav-item" type="button">
            <ListChecks size={17} /> Review queue
          </button>
          <button className="nav-item" type="button">
            <BookOpen size={17} /> Notes
          </button>
          <button className="nav-item" type="button">
            <Settings size={17} /> Preferences
          </button>
        </nav>
        <div className="sidebar-progress">
          <strong>{activePracticeItem.label}</strong>
          <span>{secureConceptCount} of 7 concepts secure</span>
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
              <Save size={14} /> {savedAt}
            </span>
            <button className="icon-button" type="button" aria-label="Notifications">
              <Bell size={17} />
            </button>
            <div className="avatar" aria-label="Guest learner">
              GL
            </div>
          </div>
        </header>

        <div className="content">
          <div className="session-heading">
            <div>
              <p className="eyebrow">Recommended · 18 min</p>
              <h1>Think in complements</h1>
              <p>Build the reasoning first. Syntax can wait.</p>
            </div>
            <div className="metric">
              <Clock3 size={19} />
              <div>
                <strong>12:40</strong>
                <div>focus time</div>
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
                  <span>values</span>
                  <span>target 8</span>
                </div>
                <div className="number-row">
                  {[4, 7, 1, 9].map((value, index) => (
                    <div
                      className={`number-cell ${index === 1 || index === 2 ? "hit" : ""}`}
                      key={value}
                    >
                      {value}
                    </div>
                  ))}
                </div>
              </div>
              <hr className="section-rule" />
              <p className="eyebrow">Practice 01</p>
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
                    <button className="text-button" onClick={() => updateDraft(starterDraft)} type="button">
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
                    onClick={() => setEvaluation(evaluatePseudocode(draft))}
                    type="button"
                  >
                    <Sparkles size={16} /> Evaluate reasoning
                  </button>
                </div>
              </div>
            </section>

            <aside className="pane feedback-pane" aria-labelledby="feedback-title">
              <div className="pane-header">
                <div>
                  <h2 id="feedback-title">Reasoning checks</h2>
                  <span className="pane-kicker">Deterministic rubric · v1</span>
                </div>
                <div className="score-ring">{evaluation?.score ?? 0}</div>
              </div>
              <p className="feedback-summary" aria-live="polite">
                {evaluation?.summary ??
                  "Your evaluation will appear here with evidence tied to each requirement."}
              </p>
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
                  <p>Your approved reasoning stays visible while you translate it into TypeScript.</p>
                </div>
              ) : (
                <div className="locked-panel">
                  <LockKeyhole size={19} />
                  <strong>Coding stays quiet for now</strong>
                  <p>Pass the critical reasoning checks, or complete this as pseudocode-only practice.</p>
                </div>
              )}
            </aside>
          </div>

          <section className="coding-section" aria-labelledby="coding-title">
            <div className="pane-header">
              <div>
                <p className="eyebrow">Optional next step</p>
                <h2 id="coding-title">Translate the approved plan</h2>
                <span className="pane-kicker">
                  TypeScript · structure check only in this local milestone
                </span>
              </div>
              {approved ? <Check color="var(--moss)" /> : <LockKeyhole color="var(--muted)" />}
            </div>
            <div className="coding-grid">
              <textarea
                aria-label="TypeScript implementation"
                className="editor code-editor"
                disabled={!approved}
                onChange={(event) => {
                  setCode(event.target.value);
                  setCodeChecked(false);
                  setCompleted(false);
                }}
                value={code}
              />
              <div className="test-panel">
                <strong>Translation checks</strong>
                {translationChecks.map((check) => (
                  <div className={`test-row ${codeChecked ? (check.passed ? "pass" : "revise") : ""}`} key={check.label}>
                    <span className="test-icon">
                      {codeChecked ? check.passed ? <Check size={12} /> : <X size={12} /> : null}
                    </span>
                    {check.label}
                  </div>
                ))}
                <button
                  className="button secondary full-button"
                  disabled={!approved}
                  onClick={() => {
                    setCode(buildCodeFromPlan(activePracticeItem.codeFunction, draft));
                    setCodeChecked(false);
                    setCompleted(false);
                  }}
                  type="button"
                >
                  <Code2 size={15} /> Seed from plan
                </button>
                <button
                  className="button full-button"
                  disabled={!approved}
                  onClick={checkTranslation}
                  type="button"
                >
                  <Play size={15} /> {completed ? "Completed" : codeChecked ? "Structure recorded" : "Check translation"}
                </button>
                {completed ? (
                  <div className="completion-panel" aria-live="polite">
                    <Check size={16} /> Saved to your local progress.
                  </div>
                ) : codeChecked ? (
                  <div className="completion-panel revise" aria-live="polite">
                    <X size={16} /> Finish the checks above to save progress.
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button type="button">
          <LayoutDashboard size={18} />Today
        </button>
        <button className="active" type="button">
          <Braces size={18} />Practice
        </button>
        <button type="button">
          <CircleHelp size={18} />Review
        </button>
        <button type="button">
          <Settings size={18} />Settings
        </button>
      </nav>
    </div>
  );
}
