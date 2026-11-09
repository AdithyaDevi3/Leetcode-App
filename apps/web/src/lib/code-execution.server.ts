import 'server-only';

import type { ExecutionLanguage, ExecutionRequest } from '@leetcode-app/domain';
import { executionLimits } from './sandbox/execution-policy';
import { getClassDesignProtocol } from './class-design';
import { buildClassExecutionSource } from './class-execution.server';

export const CODE_OUTPUT_MARKER = '__METHOD_OUTPUT__';
export type OutputCase = { actual: unknown; error?: never } | { error: string; actual?: never };
type InputCase = { args: unknown[] };

export function executionRateLimitOptions() {
  const configured = Number(process.env.EXECUTION_SUBMISSIONS_PER_TEN_MINUTES ?? 10);
  return { limit: Number.isSafeInteger(configured) && configured > 0 ? configured : 10, windowMs: 10 * 60_000 };
}

const methods: Record<string, [string, string]> = {
  'pair-with-target-v1': ['findPair', 'find_pair'],
  'max-window-sum-v1': ['maxWindowSum', 'max_window_sum'],
  'tree-max-depth-v1': ['maxDepth', 'max_depth'],
  'balanced-brackets-v1': ['isBalanced', 'is_balanced'],
  'climb-stairs-v1': ['climbStairs', 'climb_stairs'],
  'island-count-v1': ['countIslands', 'count_islands'],
  'task-order-v1': ['taskOrder', 'task_order'],
  'two-sum-window-v1': ['twoSumWindow', 'two_sum_window'],
  'coin-change-lite-v1': ['coinChangeLite', 'coin_change_lite'],
  'first-unique-index-v1': ['findFirstUniqueIndex', 'find_first_unique_index'],
};

export function hasCodeExecutionSpec(problemId: string): boolean {
  return Object.hasOwn(methods, problemId) || !!getClassDesignProtocol(problemId);
}

const treeType = 'type TreeNode = { val: number; left: TreeNode | null; right: TreeNode | null };';
const cppPreamble = `#include <algorithm>
#include <iostream>
#include <set>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>
using namespace std;
struct TreeNode { int val; TreeNode* left; TreeNode* right; TreeNode(int v, TreeNode* l = nullptr, TreeNode* r = nullptr) : val(v), left(l), right(r) {} };
string __method_json(const string& s) {
  string result = "\\\"";
  for (unsigned char c : s) { if (c == '"' || c == '\\\\') { result += '\\\\'; result += c; }
    else if (c == '\\n') result += "\\\\n"; else if (c == '\\r') result += "\\\\r"; else if (c == '\\t') result += "\\\\t";
    else if (c < 32) { const char* h = "0123456789abcdef"; result += "\\\\u00"; result += h[c >> 4]; result += h[c & 15]; }
    else result += c; }
  return result + "\\\"";
}
string __method_json(bool v) { return v ? "true" : "false"; }
string __method_json(int v) { return to_string(v); }
string __method_json(long long v) { return to_string(v); }
template <class T> string __method_json(const vector<T>& values) {
  string result = "["; for (size_t i=0; i<values.size(); ++i) { if (i) result += ','; result += __method_json(values[i]); } return result + "]";
}`;

function cppLiteral(value: unknown): string {
  if (value === null) return 'nullptr';
  if (typeof value === 'string') return cppString(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `{${value.map(cppLiteral).join(',')}}`;
  if (value && typeof value === 'object') {
    const node = value as { val: number; left?: unknown; right?: unknown };
    return `new TreeNode(${node.val},${cppLiteral(node.left ?? null)},${cppLiteral(node.right ?? null)})`;
  }
  throw new Error('Invalid C++ execution input');
}

// Octal UTF-8 escapes avoid C++ universal-character and source-encoding surprises.
function cppString(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return `string("${Array.from(bytes).map(byte => `\\${byte.toString(8).padStart(3, '0')}`).join('')}",${bytes.length})`;
}

const javaPreamble = `import java.util.*;
import java.lang.reflect.Array;
class TreeNode { int val; TreeNode left; TreeNode right; TreeNode(int v, TreeNode l, TreeNode r) { val=v;left=l;right=r; } }
`;
const javaJson = `
  static String json(Object value) {
    if (value == null) return "null";
    if (value instanceof Boolean || value instanceof Number) return value.toString();
    if (value instanceof String) {
      StringBuilder b = new StringBuilder("\\\"");
      for (char c : ((String)value).toCharArray()) { if (c == '"' || c == '\\\\') { b.append('\\\\'); b.append(c); }
        else if (c < 32) b.append(String.format("\\\\u%04x", (int)c)); else b.append(c); }
      return b.append('"').toString();
    }
    if (value.getClass().isArray()) { StringJoiner b = new StringJoiner(",", "[", "]");
      for (int i=0; i<Array.getLength(value); ++i) b.add(json(Array.get(value,i))); return b.toString(); }
    if (value instanceof Iterable<?>) { StringJoiner b = new StringJoiner(",", "[", "]"); for (Object item : (Iterable<?>)value) b.add(json(item)); return b.toString(); }
    throw new IllegalArgumentException("Return a JSON-compatible result");
  }
`;

function javaLiteral(value: unknown, type: string): string {
  if (value === null) return 'null';
  if (type.endsWith('[]')) {
    if (!Array.isArray(value)) throw new Error('Invalid Java array');
    return `new ${type}{${value.map(item => javaLiteral(item, type.slice(0, -2))).join(',')}}`;
  }
  if (type === 'String') return `new String(new char[]{${String(value).split('').map(char => `(char)${char.charCodeAt(0)}`).join(',')}})`;
  if (type === 'TreeNode') {
    const node = value as { val: number; left?: unknown; right?: unknown };
    return `new TreeNode(${node.val},${javaLiteral(node.left ?? null, type)},${javaLiteral(node.right ?? null, type)})`;
  }
  return String(value);
}

function javaArgumentTypes(problemId: string): string[] {
  if (problemId === 'tree-max-depth-v1') return ['TreeNode'];
  if (problemId === 'balanced-brackets-v1') return ['String'];
  if (problemId === 'climb-stairs-v1') return ['int'];
  if (problemId === 'island-count-v1') return ['int[][]'];
  if (problemId === 'task-order-v1') return ['String[]', 'String[][]'];
  if (problemId === 'first-unique-index-v1') return ['int[]'];
  return ['int[]', 'int'];
}

const cppTypes: Record<string, string> = {
  int: 'int', 'int[]': 'vector<int>', 'int[][]': 'vector<vector<int>>', String: 'string',
  'String[]': 'vector<string>', 'String[][]': 'vector<vector<string>>', TreeNode: 'TreeNode*',
};

/** Only input values enter the sandbox; all expectations and comparisons stay outside it. */
export function buildOutputExecutionRequest(input: {
  problemId: string; language: ExecutionLanguage; source: string; cases: InputCase[];
}): ExecutionRequest {
  if (!hasCodeExecutionSpec(input.problemId)) throw new Error('No code execution specification exists for this practice item');
  const protocol = getClassDesignProtocol(input.problemId);
  if (protocol) return {
    language: input.language,
    source: buildClassExecutionSource({ ...input, protocol, marker: CODE_OUTPUT_MARKER }, { cppPreamble, javaPreamble, javaJson }),
    limits: executionLimits,
  };
  const [method, pythonMethod] = methods[input.problemId];
  const argumentsOnly = input.cases.map(item => item.args);
  let source: string;
  if (input.language === 'python') {
    source = `from __future__ import annotations
import json
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right
def __method_tree(value):
    return None if value is None else TreeNode(value["val"], __method_tree(value.get("left")), __method_tree(value.get("right")))
${input.source}
__method_outputs = []
for __method_args in json.loads(${JSON.stringify(JSON.stringify(argumentsOnly))}):
    try:
        if ${JSON.stringify(input.problemId)} == "tree-max-depth-v1":
            __method_args = [__method_tree(__method_args[0])]
        __method_actual = ${pythonMethod}(*__method_args)
        __method_outputs.append({"actual": json.loads(json.dumps(__method_actual, allow_nan=False))})
    except Exception as __method_error:
        __method_outputs.append({"error": str(__method_error)[:160] or "Execution failed"})
print(${JSON.stringify(CODE_OUTPUT_MARKER)} + json.dumps({"problemId": ${JSON.stringify(input.problemId)}, "outputs": __method_outputs}, allow_nan=False))`;
  } else if (input.language === 'cpp') {
    const argumentTypes = javaArgumentTypes(input.problemId).map(type => cppTypes[type]);
    source = `${cppPreamble}\n${input.source}\nint main() {
  vector<string> __method_outputs;
  ${input.cases.map(item => `try { ${item.args.map((arg, index) => `${argumentTypes[index]} __method_arg_${index} = ${cppLiteral(arg)};`).join(' ')} auto actual = ${method}(${item.args.map((_, index) => `__method_arg_${index}`).join(',')}); __method_outputs.push_back("{\\\"actual\\\":" + __method_json(actual) + "}"); }
  catch (const exception& e) { __method_outputs.push_back("{\\\"error\\\":" + __method_json(string(e.what()).substr(0,160)) + "}"); }
  catch (...) { __method_outputs.push_back("{\\\"error\\\":\\\"Execution failed\\\"}"); }`).join('\n  ')}
  cout << ${JSON.stringify(CODE_OUTPUT_MARKER)} << "{\\\"problemId\\\":\\\"${input.problemId}\\\",\\\"outputs\\\":[";
  for (size_t i=0;i<__method_outputs.size();++i) { if(i) cout << ','; cout << __method_outputs[i]; }
  cout << "]}" << endl;
}`;
  } else if (input.language === 'java') {
    const imports: string[] = [];
    const learner = input.source.replace(/^\s*import\s+[^;]+;[ \t]*$/gm, value => { imports.push(value.trim()); return ''; });
    const argumentTypes = javaArgumentTypes(input.problemId);
    source = `${imports.join('\n')}\n${javaPreamble}${learner}\npublic class Main {
${javaJson}
  public static void main(String[] args) {
    List<String> outputs = new ArrayList<>();
    ${input.cases.map(item => `try { Object actual = new Solution().${method}(${item.args.map((arg, index) => javaLiteral(arg, argumentTypes[index])).join(',')}); outputs.add("{\\\"actual\\\":" + json(actual) + "}"); }
    catch (Throwable error) { outputs.add("{\\\"error\\\":" + json(error.getClass().getSimpleName()) + "}"); }`).join('\n    ')}
    System.out.println(${JSON.stringify(CODE_OUTPUT_MARKER)} + "{\\\"problemId\\\":\\\"${input.problemId}\\\",\\\"outputs\\\":[" + String.join(",", outputs) + "]}");
  }
}`;
  } else {
    source = `${input.problemId === 'tree-max-depth-v1' ? treeType : ''}\n${input.source}
const __method_outputs = ${JSON.stringify(argumentsOnly)}.map((args) => {
  try {
    const actual = (${method} as (...args: any[]) => unknown)(...args);
    const encoded = JSON.stringify(actual, (_key, value) => {
      if ((typeof value === 'number' && !Number.isFinite(value)) || ['undefined', 'function', 'symbol', 'bigint'].includes(typeof value)) throw new Error('Return a JSON-compatible result');
      return value;
    });
    return { actual: JSON.parse(encoded) };
  }
  catch (error) { return { error: (error instanceof Error ? error.message : 'Execution failed').slice(0,160) }; }
});
console.log(${JSON.stringify(CODE_OUTPUT_MARKER)} + JSON.stringify({ problemId: ${JSON.stringify(input.problemId)}, outputs: __method_outputs }));`;
  }
  return { language: input.language, source, limits: executionLimits };
}

export function parseExecutionOutputs(stdout: string, problemId: string, caseCount: number): { outputs: OutputCase[]; stdout: string } | null {
  const marker = stdout.lastIndexOf(CODE_OUTPUT_MARKER);
  if (marker < 0 || stdout.length > executionLimits.outputBytes) return null;
  try {
    const payload = JSON.parse(stdout.slice(marker + CODE_OUTPUT_MARKER.length).trim()) as Record<string, unknown>;
    if (payload.problemId !== problemId || !Array.isArray(payload.outputs) || payload.outputs.length !== caseCount) return null;
    const outputs: OutputCase[] = [];
    for (const value of payload.outputs) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const entry = value as Record<string, unknown>;
      if (typeof entry.error === 'string' && !Object.hasOwn(entry, 'actual')) outputs.push({ error: entry.error.slice(0,160) || 'Execution failed' });
      else if (Object.hasOwn(entry, 'actual') && !Object.hasOwn(entry, 'error')) outputs.push({ actual: entry.actual });
      else return null;
    }
    return { outputs, stdout: stdout.slice(0, marker).trimEnd() };
  } catch { return null; }
}
