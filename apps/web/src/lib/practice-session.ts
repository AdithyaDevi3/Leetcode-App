import type { Evaluation } from "./evaluator";

export type EditorMode = "text" | "blocks";

export type PracticeSessionState = {
  draft: string;
  mode: EditorMode;
  code: string;
  codeChecked: boolean;
  completed: boolean;
  evaluation: Evaluation | null;
};

export const sessionStorageKey = (problemId: string) => `method:${problemId}:session`;
export const selectedPracticeItemKey = "method:selected-practice-item";

const defaultSignatureFor = (functionName: string) =>
  functionName === "findFirstUniqueIndex" ? "values: number[]" : "values: number[], target: number";

export const defaultCode = (functionName: string, signature = defaultSignatureFor(functionName)) => `function ${functionName}(${signature}) {
  // Translate your approved plan here.
}`;

export const splitDraftIntoBlocks = (draft: string) =>
  draft
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export const joinBlocksIntoDraft = (blocks: string[]) =>
  blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n");

export function buildCodeFromPlan(plan: string): string;
export function buildCodeFromPlan(functionName: string, plan: string): string;
export function buildCodeFromPlan(functionName: string, signature: string, plan: string): string;
export function buildCodeFromPlan(functionNameOrPlan: string, second?: string, third?: string) {
  const functionName = third ? functionNameOrPlan : second ? functionNameOrPlan : "findPair";
  const signature = third ? second ?? defaultSignatureFor(functionName) : defaultSignatureFor(functionName);
  const plan = third ? third : second ?? functionNameOrPlan;
  const planComments = splitDraftIntoBlocks(plan)
    .map((line) => `  // ${line}`)
    .join("\n");

  return `function ${functionName}(${signature}) {
${planComments || "  // Translate your approved plan here."}
}`;
};

export const stripCodeComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const isEvaluation = (value: unknown): value is Evaluation => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Evaluation;
  return (
    typeof candidate.approved === "boolean" &&
    typeof candidate.score === "number" &&
    typeof candidate.summary === "string" &&
    Array.isArray(candidate.findings)
  );
};

export const serializePracticeSession = (state: PracticeSessionState) => JSON.stringify(state);

export const deserializePracticeSession = (value: string): PracticeSessionState | null => {
  try {
    const parsed = JSON.parse(value) as Partial<PracticeSessionState>;
    if (
      typeof parsed.draft !== "string" ||
      (parsed.mode !== "text" && parsed.mode !== "blocks") ||
      typeof parsed.code !== "string" ||
      typeof parsed.codeChecked !== "boolean" ||
      typeof parsed.completed !== "boolean"
    ) {
      return null;
    }

    return {
      draft: parsed.draft,
      mode: parsed.mode,
      code: parsed.code,
      codeChecked: parsed.codeChecked,
      completed: parsed.completed,
      evaluation: parsed.evaluation && isEvaluation(parsed.evaluation) ? parsed.evaluation : null,
    };
  } catch {
    return null;
  }
};