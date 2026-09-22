import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

import { practiceItems } from './content';
import {
  buildGradedExecutionRequest,
  CODE_GRADING_MARKER,
  CODE_GRADING_VERSION,
  codeCheckLabels,
  parseCodeGrade,
} from './code-grading';

describe('code grading specifications', () => {
  it.each(practiceItems)('defines meaningful hidden checks for $label', (item) => {
    expect(codeCheckLabels(item.id).length).toBeGreaterThanOrEqual(4);
    const request = buildGradedExecutionRequest({
      problemId: item.id,
      language: 'typescript',
      source: `function ${item.codeFunction}() { return null; }`,
    });
    expect(request.source).toContain(CODE_GRADING_MARKER);
    expect(request.source).toContain(item.codeFunction);
  });

  it('builds Python grading around the expected snake-case function', () => {
    const request = buildGradedExecutionRequest({
      problemId: 'pair-with-target-v1',
      language: 'python',
      source: 'def find_pair(values, target):\n    return []',
    });
    expect(request.source).toContain('find_pair(*__method_args)');
    expect(request.source).toContain('json.loads');
  });

  it('parses only a complete structured report from sandbox output', () => {
    const tests = codeCheckLabels('pair-with-target-v1').map((name) => ({ name, passed: true }));
    const grade = {
      problemId: 'pair-with-target-v1',
      version: CODE_GRADING_VERSION,
      passed: true,
      passedCount: 4,
      totalCount: 4,
      tests,
    };
    expect(parseCodeGrade(`learner output\n${CODE_GRADING_MARKER}${JSON.stringify(grade)}`)).toEqual(grade);
    expect(parseCodeGrade('ordinary output')).toBeNull();
    expect(parseCodeGrade(`${CODE_GRADING_MARKER}${JSON.stringify({ ...grade, passedCount: 3 })}`)).toBeNull();
    expect(parseCodeGrade(`${CODE_GRADING_MARKER}${JSON.stringify({ ...grade, version: 'forged' })}`)).toBeNull();
    expect(parseCodeGrade(`${CODE_GRADING_MARKER}${JSON.stringify({ ...grade, tests: [{ name: 'forged', passed: true }] })}`)).toBeNull();
  });

  it('rejects practice items without a grading specification', () => {
    expect(() => buildGradedExecutionRequest({ problemId: 'missing', language: 'typescript', source: 'x' }))
      .toThrow('No code grading specification');
  });

  it.each(Object.entries({
    'pair-with-target-v1': `function findPair(values: number[], target: number) { const seen = new Map<number, number>(); for (let i = 0; i < values.length; i++) { const needed = target - values[i]; if (seen.has(needed)) return [seen.get(needed)!, i]; seen.set(values[i], i); } return []; }`,
    'max-window-sum-v1': `function maxWindowSum(values: number[], size: number) { let sum = values.slice(0, size).reduce((a, b) => a + b, 0); let best = sum; for (let i = size; i < values.length; i++) { sum += values[i] - values[i - size]; best = Math.max(best, sum); } return best; }`,
    'tree-max-depth-v1': `function maxDepth(root: TreeNode | null): number { return root ? 1 + Math.max(maxDepth(root.left), maxDepth(root.right)) : 0; }`,
    'balanced-brackets-v1': `function isBalanced(text: string) { const stack: string[] = []; const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }; for (const char of text) { if ('([{'.includes(char)) stack.push(char); else if (stack.pop() !== pairs[char]) return false; } return stack.length === 0; }`,
    'climb-stairs-v1': `function climbStairs(n: number) { let a = 1, b = 1; for (let i = 2; i <= n; i++) [a, b] = [b, a + b]; return b; }`,
    'island-count-v1': `function countIslands(grid: number[][]) { let count = 0; const visit = (r: number, c: number) => { if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length || grid[r][c] !== 1) return; grid[r][c] = 0; visit(r+1,c); visit(r-1,c); visit(r,c+1); visit(r,c-1); }; for (let r=0;r<grid.length;r++) for (let c=0;c<grid[0].length;c++) if (grid[r][c]===1) { count++; visit(r,c); } return count; }`,
    'task-order-v1': `function taskOrder(tasks: string[], prerequisites: string[][]) { const degree = new Map(tasks.map(t => [t, 0])); const next = new Map(tasks.map(t => [t, [] as string[]])); for (const [task, prerequisite] of prerequisites) { degree.set(task, (degree.get(task) ?? 0) + 1); next.get(prerequisite)?.push(task); } const queue = tasks.filter(t => degree.get(t) === 0); const order: string[] = []; while (queue.length) { const task = queue.shift()!; order.push(task); for (const dependent of next.get(task) ?? []) { degree.set(dependent, degree.get(dependent)! - 1); if (degree.get(dependent) === 0) queue.push(dependent); } } return order.length === tasks.length ? order : []; }`,
    'two-sum-window-v1': `function twoSumWindow(values: number[], target: number) { let left=0,right=values.length-1; while(left<right) { const sum=values[left]+values[right]; if(sum===target)return[left,right]; if(sum<target)left++;else right--; } return []; }`,
    'coin-change-lite-v1': `function coinChangeLite(coins: number[], amount: number) { const best = Array(amount + 1).fill(Infinity); best[0] = 0; for (let current=1;current<=amount;current++) for (const coin of coins) if (coin<=current) best[current]=Math.min(best[current],best[current-coin]+1); return Number.isFinite(best[amount]) ? best[amount] : -1; }`,
    'first-unique-index-v1': `function findFirstUniqueIndex(values: number[]) { const counts = new Map<number, number>(); for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1); return values.findIndex(value => counts.get(value) === 1); }`,
  }))('executes the complete TypeScript test harness for %s', (problemId, source) => {
    const request = buildGradedExecutionRequest({ problemId, language: 'typescript', source });
    const javascript = ts.transpileModule(request.source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const output: string[] = [];
    Function('console', javascript)({ log: (value: unknown) => output.push(String(value)) });
    expect(parseCodeGrade(output.join('\n'))).toMatchObject({ problemId, passed: true });
  });

  it('executes a complete Python test harness', () => {
    const request = buildGradedExecutionRequest({
      problemId: 'pair-with-target-v1',
      language: 'python',
      source: `def find_pair(values, target):
    seen = {}
    for index, value in enumerate(values):
        needed = target - value
        if needed in seen:
            return [seen[needed], index]
        seen[value] = index
    return []`,
    });
    const result = spawnSync('python3', ['-c', request.source], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(parseCodeGrade(result.stdout)).toMatchObject({ problemId: 'pair-with-target-v1', passed: true });
  });

  it.each(Object.entries({
    'pair-with-target-v1': `vector<int> findPair(vector<int> values, int target) { unordered_map<int,int> seen; for (int i=0;i<(int)values.size();++i) { int needed=target-values[i]; if (seen.contains(needed)) return {seen[needed],i}; seen[values[i]]=i; } return {}; }`,
    'max-window-sum-v1': `int maxWindowSum(vector<int> values, int size) { int sum=0; for(int i=0;i<size;++i) sum+=values[i]; int best=sum; for(int i=size;i<(int)values.size();++i) { sum+=values[i]-values[i-size]; best=max(best,sum); } return best; }`,
    'tree-max-depth-v1': `int maxDepth(TreeNode* root) { return root ? 1 + max(maxDepth(root->left), maxDepth(root->right)) : 0; }`,
    'balanced-brackets-v1': `bool isBalanced(string text) { vector<char> stack; unordered_map<char,char> pairs{{')','('},{']','['},{'}','{'}}; for(char value:text) { if(value=='('||value=='['||value=='{') stack.push_back(value); else { if(stack.empty()||stack.back()!=pairs[value]) return false; stack.pop_back(); } } return stack.empty(); }`,
    'climb-stairs-v1': `int climbStairs(int n) { int a=1,b=1; for(int i=2;i<=n;++i) { int next=a+b; a=b; b=next; } return b; }`,
    'island-count-v1': `int countIslands(vector<vector<int>> grid) { int count=0; auto visit=[&](auto&& self,int r,int c)->void { if(r<0||c<0||r>=(int)grid.size()||c>=(int)grid[0].size()||grid[r][c]!=1) return; grid[r][c]=0; self(self,r+1,c); self(self,r-1,c); self(self,r,c+1); self(self,r,c-1); }; for(int r=0;r<(int)grid.size();++r) for(int c=0;c<(int)grid[0].size();++c) if(grid[r][c]==1) { ++count; visit(visit,r,c); } return count; }`,
    'task-order-v1': `vector<string> taskOrder(vector<string> tasks, vector<vector<string>> prerequisites) { unordered_map<string,int> degree; unordered_map<string,vector<string>> next; for(auto& task:tasks) degree[task]=0; for(auto& edge:prerequisites) { ++degree[edge[0]]; next[edge[1]].push_back(edge[0]); } vector<string> queue,order; for(auto& task:tasks) if(degree[task]==0) queue.push_back(task); for(size_t i=0;i<queue.size();++i) { string task=queue[i]; order.push_back(task); for(auto& dependent:next[task]) if(--degree[dependent]==0) queue.push_back(dependent); } return order.size()==tasks.size()?order:vector<string>{}; }`,
    'two-sum-window-v1': `vector<int> twoSumWindow(vector<int> values, int target) { int left=0,right=(int)values.size()-1; while(left<right) { int sum=values[left]+values[right]; if(sum==target) return {left,right}; if(sum<target) ++left; else --right; } return {}; }`,
    'coin-change-lite-v1': `int coinChangeLite(vector<int> coins, int amount) { vector<int> best(amount+1,amount+1); best[0]=0; for(int current=1;current<=amount;++current) for(int coin:coins) if(coin<=current) best[current]=min(best[current],best[current-coin]+1); return best[amount]>amount?-1:best[amount]; }`,
    'first-unique-index-v1': `int findFirstUniqueIndex(vector<int> values) { unordered_map<int,int> counts; for(int value:values) ++counts[value]; for(int i=0;i<(int)values.size();++i) if(counts[values[i]]==1) return i; return -1; }`,
  }))('compiles and executes the complete C++20 test harness for %s', (problemId, source) => {
    const request = buildGradedExecutionRequest({ problemId, language: 'cpp', source });
    const directory = mkdtempSync(join(tmpdir(), 'method-cpp-grade-'));
    const binary = join(directory, 'submission');
    try {
      const compilation = spawnSync('g++', ['-x', 'c++', '-std=c++20', '-O0', '-o', binary, '-'], {
        encoding: 'utf8',
        input: request.source,
      });
      expect(compilation.status, compilation.stderr).toBe(0);
      const result = spawnSync(binary, [], { encoding: 'utf8' });
      expect(result.status, result.stderr).toBe(0);
      expect(parseCodeGrade(result.stdout)).toMatchObject({ problemId, passed: true });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
