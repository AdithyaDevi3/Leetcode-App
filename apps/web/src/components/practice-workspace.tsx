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

import { lesson, problem, starterDraft } from "@/lib/content";
import { evaluatePseudocode, type Evaluation } from "@/lib/evaluator";

const storageKey = `method:${problem.id}:draft`;

const blockOptions = [
  { label: "State", value: "Create an empty map from value to position." },
  { label: "Loop", value: "For each value and position in the list:" },
  { label: "Compute", value: "Let complement be target minus value." },
  {
    label: "Check",
    value:
      "If complement exists in the map, return its stored position and the current position.",
  },
  { label: "Store", value: "Otherwise store value mapped to the current position." },
  { label: "Return", value: "Return no pair." },
];

const initialCode = `function findPair(values: number[], target: number) {
  // Translate your approved plan here.
}`;

type EditorMode = "text" | "blocks";

export function PracticeWorkspace() {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<EditorMode>("text");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [savedAt, setSavedAt] = useState("Not saved");
  const [code, setCode] = useState(initialCode);
  const [codeChecked, setCodeChecked] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedDraft = window.localStorage.getItem(storageKey);
      if (savedDraft) {
        setDraft(savedDraft);
        setSavedAt("Restored locally");
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, draft);
      setSavedAt(draft ? "Saved locally" : "Ready");
    }, 450);

    return () => window.clearTimeout(timer);
  }, [draft]);

  const blocks = draft ? draft.split("\n").filter(Boolean) : [];

  const updateDraft = (nextDraft: string) => {
    setDraft(nextDraft);
    setEvaluation(null);
  };

  const addBlock = (block: string) => {
    updateDraft(draft ? `${draft}\n${block}` : block);
  };

  const updateBlocks = (nextBlocks: string[]) => {
    updateDraft(nextBlocks.join("\n"));
  };

  const draftLineCount = draft ? draft.split("\n").filter((line) => line.trim()).length : 0;
  const draftWordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const draftCharacterCount = draft.length;

  const moveBlock = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= blocks.length) return;
    const nextBlocks = [...blocks];
    [nextBlocks[index], nextBlocks[nextIndex]] = [nextBlocks[nextIndex], nextBlocks[index]];
    updateBlocks(nextBlocks);
  };

  const evaluationFindings = evaluation?.findings ?? evaluatePseudocode("").findings;
  const approved = evaluation?.approved ?? false;

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
          <strong>Hash maps</strong>
          <span>3 of 7 concepts secure</span>
          <div className="progress-track" aria-label="46% complete">
            <div />
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="crumbs">
            <span>Algorithms</span>
            <span>/</span>
            <strong>Hash maps</strong>
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
                  <span className="pane-kicker">{lesson.eyebrow}</span>
                </div>
                <Lightbulb size={19} color="var(--mustard)" />
              </div>
              <h3 className="lesson-title" id="lesson-title">
                {lesson.title}
              </h3>
              <p className="lesson-copy">{lesson.summary}</p>
              <div className="principle">
                <strong>Invariant</strong>
                <br />
                {lesson.principle}
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
              <h3 className="problem-title">{problem.title}</h3>
              <p className="lesson-copy">{problem.prompt}</p>
              <div className="example">
                <span>Input</span> {problem.example.input}
                <br />
                <span>Output</span> {problem.example.output}
                <br />
                <span>Why</span> {problem.example.note}
              </div>
              <ul className="constraint-list">
                {problem.constraints.map((constraint) => (
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
                }}
                value={code}
              />
              <div className="test-panel">
                <strong>Translation checks</strong>
                <div className="test-row">Map state mirrors the plan</div>
                <div className="test-row">One traversal over values</div>
                <div className="test-row">Returns two positions</div>
                <button
                  className="button full-button"
                  disabled={!approved}
                  onClick={() => setCodeChecked(true)}
                  type="button"
                >
                  <Play size={15} /> {codeChecked ? "Structure recorded" : "Check translation"}
                </button>
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
