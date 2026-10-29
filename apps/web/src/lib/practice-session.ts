import type { Evaluation } from "./evaluator";
import type { CodeGrade } from './code-grading';
import { astProgramToBlocks, blockModelToDraft, draftToBlockModel } from "./ast-block-adapter";

export type EditorMode = "text" | "blocks";
export type CodingLanguage = "python" | "cpp" | "typescript";
export type PracticeCodeDrafts = Partial<Record<CodingLanguage, string>>;

export const practiceWorkspaceLimits = {
  serializedCharacters: 250_000,
  sourceBytes: 100_000,
  combinedSourceBytes: 200_000,
} as const;

export const codingLanguages: Array<{ value: CodingLanguage; label: string; runtime: string }> = [
  { value: "python", label: "Python 3", runtime: "python3" },
  { value: "cpp", label: "C++", runtime: "C++20" },
  { value: "typescript", label: "TypeScript", runtime: "Node.js" },
];

export const codingLanguageLabel = (language: CodingLanguage) =>
  codingLanguages.find((option) => option.value === language)?.label ?? "Python 3";

export type PracticeSessionState = {
  draft: string;
  mode: EditorMode;
  language: CodingLanguage;
  code: string;
  codeChecked: boolean;
  completed: boolean;
  evaluation: Evaluation | null;
  codeGrade: CodeGrade | null;
  /** Additive editor metadata. `code` remains authoritative for the active language. */
  codeDraftVersion?: 1;
  codeByLanguage?: PracticeCodeDrafts;
};

/** Legacy snapshots acquire their active draft without requiring a destructive migration. */
export const practiceCodeDrafts = (state: Pick<PracticeSessionState, 'code' | 'language' | 'codeByLanguage'>): PracticeCodeDrafts => ({
  ...state.codeByLanguage,
  [state.language]: state.code,
});

/** Shared browser/API preflight. Reject oversized work explicitly; never truncate a draft. */
export const practiceWorkspaceValidationError = (state: unknown): string | null => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 'Workspace state is invalid.';
  const candidate = state as Partial<PracticeSessionState>;
  if (candidate.codeByLanguage !== undefined || candidate.codeDraftVersion !== undefined) {
    if (candidate.codeDraftVersion !== 1 || !candidate.codeByLanguage || typeof candidate.codeByLanguage !== 'object'
      || Array.isArray(candidate.codeByLanguage)) return 'Language drafts have an unsupported format.';
    if (typeof candidate.code !== 'string' || !['python', 'cpp', 'typescript'].includes(candidate.language ?? '')) {
      return 'Language drafts require a supported active language and source.';
    }
    const encoder = new TextEncoder();
    const entries = Object.entries(candidate.codeByLanguage);
    if (entries.some(([language, source]) => !['python', 'cpp', 'typescript'].includes(language) || typeof source !== 'string')) {
      return 'Language drafts contain an unsupported language or source.';
    }
    const sources = { ...candidate.codeByLanguage, ...(typeof candidate.code === 'string'
      && ['python', 'cpp', 'typescript'].includes(candidate.language ?? '') ? { [candidate.language!]: candidate.code } : {}) };
    const sourceSizes = Object.values(sources).map(source => encoder.encode(source).byteLength);
    if (sourceSizes.some(size => size > practiceWorkspaceLimits.sourceBytes)) return 'A language draft exceeds the 100 KB source limit. Your current work has not been replaced.';
    if (sourceSizes.reduce((total, size) => total + size, 0) > practiceWorkspaceLimits.combinedSourceBytes) {
      return 'The language drafts exceed the combined 200 KB source limit. Your current work has not been replaced.';
    }
  }
  try {
    if (JSON.stringify(state).length > practiceWorkspaceLimits.serializedCharacters) return 'Workspace state exceeds the save limit. Your current work has not been replaced.';
  } catch { return 'Workspace state is invalid.'; }
  return null;
};

export const sessionStorageKey = (problemId: string) => `method:${problemId}:session`;
export const selectedPracticeItemKey = "method:selected-practice-item";

const defaultSignatureFor = (functionName: string) =>
  functionName === "findFirstUniqueIndex" ? "values: number[]" : "values: number[], target: number";

const snakeCase = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

const pythonSignature = (signature: string) => signature
  .replace(/number\[\]\[\]/g, "list[list[int]]")
  .replace(/number\[\]/g, "list[int]")
  .replace(/string\[\]/g, "list[str]")
  .replace(/TreeNode \| null/g, "TreeNode | None")
  .replace(/number/g, "int")
  .replace(/string/g, "str");

const cppSignature = (signature: string) => signature
  .split(", ")
  .map((parameter) => {
    const [name, type] = parameter.split(": ");
    const cppType = type
      ?.replace(/number\[\]\[\]/g, "vector<vector<int>>")
      .replace(/number\[\]/g, "vector<int>")
      .replace(/string\[\]\[\]/g, "vector<vector<string>>")
      .replace(/string\[\]/g, "vector<string>")
      .replace(/TreeNode \| null/g, "TreeNode*")
      .replace(/number/g, "int")
      .replace(/string/g, "string");
    return `${cppType} ${name}`;
  })
  .join(", ");

const cppReturnType: Record<string, string> = {
  findPair: "vector<int>",
  maxWindowSum: "int",
  maxDepth: "int",
  isBalanced: "bool",
  climbStairs: "int",
  countIslands: "int",
  taskOrder: "vector<string>",
  twoSumWindow: "vector<int>",
  coinChangeLite: "int",
  findFirstUniqueIndex: "int",
};

export const defaultCode = (
  functionName: string,
  signature = defaultSignatureFor(functionName),
  language: CodingLanguage = "typescript",
) => language === "python"
  ? `def ${snakeCase(functionName)}(${pythonSignature(signature)}):
    # Translate your approved plan here.
    pass`
  : language === "cpp"
    ? `${cppReturnType[functionName] ?? "int"} ${functionName}(${cppSignature(signature)}) {
  // Translate your approved plan here.
  throw runtime_error("Not implemented");
}`
  : `function ${functionName}(${signature}) {
  // Translate your approved plan here.
}`;

export const splitDraftIntoBlocks = (draft: string) =>
  draftToBlockModel(draft).blocks;

export const joinBlocksIntoDraft = (blocks: string[]) =>
  blockModelToDraft(blocks);

export const projectDraftBlocks = (draft: string, functionName = "findPair") =>
  astProgramToBlocks(draftToBlockModel(draft, functionName).program);

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

export const buildCodeFromPlanForLanguage = (
  functionName: string,
  signature: string,
  plan: string,
  language: CodingLanguage,
) => {
  if (language === "typescript") return buildCodeFromPlan(functionName, signature, plan);

  if (language === "cpp") {
    const planComments = splitDraftIntoBlocks(plan)
      .map((line) => `  // ${line}`)
      .join("\n");
    return `${cppReturnType[functionName] ?? "int"} ${functionName}(${cppSignature(signature)}) {
${planComments || "  // Translate your approved plan here."}
  throw runtime_error("Not implemented");
}`;
  }

  const planComments = splitDraftIntoBlocks(plan)
    .map((line) => `    # ${line}`)
    .join("\n");
  return `def ${snakeCase(functionName)}(${pythonSignature(signature)}):
${planComments || "    # Translate your approved plan here."}
    pass`;
};

export const stripCodeComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/#.*$/gm, "");

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

const isCodeGrade = (value: unknown): value is CodeGrade => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<CodeGrade>;
  return typeof candidate.problemId === 'string'
    && typeof candidate.version === 'string'
    && typeof candidate.passed === 'boolean'
    && typeof candidate.passedCount === 'number'
    && typeof candidate.totalCount === 'number'
    && Array.isArray(candidate.tests);
};

export const serializePracticeSession = (state: PracticeSessionState) => JSON.stringify(state);

export const deserializePracticeSession = (value: string): PracticeSessionState | null => {
  try {
    if (value.length > practiceWorkspaceLimits.serializedCharacters) return null;
    const parsed = JSON.parse(value) as Partial<PracticeSessionState>;
    if (
      !parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      typeof parsed.draft !== "string" ||
      (parsed.mode !== "text" && parsed.mode !== "blocks") ||
      typeof parsed.code !== "string" ||
      typeof parsed.codeChecked !== "boolean" ||
      typeof parsed.completed !== "boolean" ||
      practiceWorkspaceValidationError(parsed)
    ) {
      return null;
    }

    const language = parsed.language === "python" || parsed.language === "cpp" ? parsed.language : "typescript";
    const restored: PracticeSessionState = {
      draft: parsed.draft,
      mode: parsed.mode,
      language,
      code: parsed.code,
      codeChecked: parsed.codeChecked,
      completed: parsed.completed && isCodeGrade(parsed.codeGrade) && parsed.codeGrade.passed,
      evaluation: parsed.evaluation && isEvaluation(parsed.evaluation) ? parsed.evaluation : null,
      codeGrade: isCodeGrade(parsed.codeGrade) ? parsed.codeGrade : null,
      ...(parsed.codeByLanguage ? {
        codeDraftVersion: 1 as const,
        codeByLanguage: practiceCodeDrafts({ code: parsed.code, language, codeByLanguage: parsed.codeByLanguage }),
      } : {}),
    };
    return practiceWorkspaceValidationError(restored) ? null : restored;
  } catch {
    return null;
  }
};
