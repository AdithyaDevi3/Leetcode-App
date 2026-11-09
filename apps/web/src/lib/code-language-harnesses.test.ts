import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import type { ExecutionLanguage } from '@leetcode-app/domain';
import { buildGradedExecutionRequest, gradeExecutionOutputs } from './code-grading.server';

const python: Record<string, string> = {
  'pair-with-target-v1': `def find_pair(values, target):
    seen = {}
    for i, value in enumerate(values):
        if target-value in seen: return [seen[target-value], i]
        seen[value] = i
    return []`,
  'max-window-sum-v1': `def max_window_sum(values, size):
    total = sum(values[:size])
    best = total
    for i in range(size, len(values)):
        total += values[i]-values[i-size]
        best = max(best, total)
    return best`,
  'tree-max-depth-v1': `def max_depth(root):
    return 0 if root is None else 1+max(max_depth(root.left), max_depth(root.right))`,
  'balanced-brackets-v1': `def is_balanced(text):
    stack = []
    pairs = {')':'(', ']':'[', '}':'{'}
    for c in text:
        if c in '([{': stack.append(c)
        elif not stack or stack.pop() != pairs[c]: return False
    return not stack`,
  'climb-stairs-v1': `def climb_stairs(n):
    a,b = 1,1
    for _ in range(2,n+1): a,b = b,a+b
    return b`,
  'island-count-v1': `def count_islands(grid):
    def visit(r,c):
        if r<0 or c<0 or r>=len(grid) or c>=len(grid[0]) or grid[r][c]!=1: return
        grid[r][c]=0
        visit(r+1,c)
        visit(r-1,c)
        visit(r,c+1)
        visit(r,c-1)
    count=0
    for r in range(len(grid)):
        for c in range(len(grid[0])):
            if grid[r][c]==1:
                count+=1
                visit(r,c)
    return count`,
  'task-order-v1': `def task_order(tasks, prerequisites):
    degree={t:0 for t in tasks}
    edges={t:[] for t in tasks}
    for task,pre in prerequisites:
        degree[task]+=1
        edges[pre].append(task)
    queue=[t for t in tasks if degree[t]==0]
    result=[]
    while queue:
        task=queue.pop(0)
        result.append(task)
        for dependent in edges[task]:
            degree[dependent]-=1
            if degree[dependent]==0: queue.append(dependent)
    return result if len(result)==len(tasks) else []`,
  'two-sum-window-v1': `def two_sum_window(values,target):
    a,b=0,len(values)-1
    while a<b:
        total=values[a]+values[b]
        if total==target: return [a,b]
        if total<target: a+=1
        else: b-=1
    return []`,
  'coin-change-lite-v1': `def coin_change_lite(coins,amount):
    best=[amount+1]*(amount+1)
    best[0]=0
    for total in range(1,amount+1):
        for coin in coins:
            if coin<=total: best[total]=min(best[total],best[total-coin]+1)
    return best[amount] if best[amount]<=amount else -1`,
  'first-unique-index-v1': `def find_first_unique_index(values):
    counts={}
    for value in values: counts[value]=counts.get(value,0)+1
    return next((i for i,v in enumerate(values) if counts[v]==1),-1)`,
};

const java: Record<string, string> = {
  'pair-with-target-v1': 'int[] findPair(int[] values,int target) { Map<Integer,Integer> seen=new HashMap<>();for(int i=0;i<values.length;i++){if(seen.containsKey(target-values[i]))return new int[]{seen.get(target-values[i]),i};seen.put(values[i],i);}return new int[]{}; }',
  'max-window-sum-v1': 'int maxWindowSum(int[] v,int size) { int sum=0;for(int i=0;i<size;i++)sum+=v[i];int best=sum;for(int i=size;i<v.length;i++){sum+=v[i]-v[i-size];best=Math.max(best,sum);}return best; }',
  'tree-max-depth-v1': 'int maxDepth(TreeNode root) { return root==null?0:1+Math.max(maxDepth(root.left),maxDepth(root.right)); }',
  'balanced-brackets-v1': `boolean isBalanced(String text) { Deque<Character> stack=new ArrayDeque<>();for(char c:text.toCharArray()){if(c=='('||c=='['||c=='{')stack.push(c);else{if(stack.isEmpty())return false;char p=stack.pop();if(c==')'&&p!='('||c==']'&&p!='['||c=='}'&&p!='{')return false;}}return stack.isEmpty(); }`,
  'climb-stairs-v1': 'int climbStairs(int n) { int a=1,b=1;for(int i=2;i<=n;i++){int next=a+b;a=b;b=next;}return b; }',
  'island-count-v1': 'void visit(int[][] g,int r,int c){if(r<0||c<0||r>=g.length||c>=g[0].length||g[r][c]!=1)return;g[r][c]=0;visit(g,r+1,c);visit(g,r-1,c);visit(g,r,c+1);visit(g,r,c-1);} int countIslands(int[][] g){int result=0;for(int r=0;r<g.length;r++)for(int c=0;c<g[0].length;c++)if(g[r][c]==1){result++;visit(g,r,c);}return result;}',
  'task-order-v1': 'String[] taskOrder(String[] tasks,String[][] prerequisites){Map<String,Integer> degree=new HashMap<>();Map<String,List<String>> next=new HashMap<>();for(String t:tasks){degree.put(t,0);next.put(t,new ArrayList<>());}for(String[] e:prerequisites){degree.put(e[0],degree.get(e[0])+1);next.get(e[1]).add(e[0]);}List<String> order=new ArrayList<>();for(String t:tasks)if(degree.get(t)==0)order.add(t);for(int i=0;i<order.size();i++){String t=order.get(i);for(String d:next.get(t)){degree.put(d,degree.get(d)-1);if(degree.get(d)==0)order.add(d);}}return order.size()==tasks.length?order.toArray(new String[0]):new String[0];}',
  'two-sum-window-v1': 'int[] twoSumWindow(int[] v,int target){int a=0,b=v.length-1;while(a<b){int sum=v[a]+v[b];if(sum==target)return new int[]{a,b};if(sum<target)a++;else b--;}return new int[0];}',
  'coin-change-lite-v1': 'int coinChangeLite(int[] coins,int amount){int[] best=new int[amount+1];Arrays.fill(best,amount+1);best[0]=0;for(int total=1;total<=amount;total++)for(int coin:coins)if(coin<=total)best[total]=Math.min(best[total],best[total-coin]+1);return best[amount]>amount?-1:best[amount];}',
  'first-unique-index-v1': 'int findFirstUniqueIndex(int[] values){Map<Integer,Integer> counts=new HashMap<>();for(int v:values)counts.put(v,counts.getOrDefault(v,0)+1);for(int i=0;i<values.length;i++)if(counts.get(values[i])==1)return i;return -1;}',
};

function execute(problemId: string, language: ExecutionLanguage, learnerSource: string): string {
  const request = buildGradedExecutionRequest({ problemId, language, source: learnerSource });
  if (language === 'typescript') {
    const output: string[] = [];
    Function('console', ts.transpileModule(request.source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)({ log: (value: unknown) => output.push(String(value)) });
    return output.join('\n');
  }
  if (language === 'python') {
    const result = spawnSync('python3', ['-c', request.source], { encoding: 'utf8', timeout: 10000 });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  }
  const directory = mkdtempSync(join(tmpdir(), 'method-language-'));
  try {
    if (language === 'java') {
      const javaBin = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin')
        : existsSync('/opt/homebrew/opt/openjdk/bin/javac') ? '/opt/homebrew/opt/openjdk/bin' : '';
      writeFileSync(join(directory, 'Main.java'), request.source);
      const compilation = spawnSync(javaBin ? join(javaBin, 'javac') : 'javac', ['Main.java'], { cwd: directory, encoding: 'utf8', timeout: 15000 });
      expect(compilation.status, compilation.stderr).toBe(0);
      const result = spawnSync(javaBin ? join(javaBin, 'java') : 'java', ['-cp', directory, 'Main'], { encoding: 'utf8', timeout: 10000 });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout;
    }
    const binary = join(directory, 'submission');
    const compilation = spawnSync('g++', ['-x','c++','-std=c++20','-O0','-o',binary,'-'], { input: request.source, encoding: 'utf8', timeout: 15000 });
    expect(compilation.status, compilation.stderr).toBe(0);
    const result = spawnSync(binary, [], { encoding: 'utf8', timeout: 10000 });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe('real Python and Java grading harnesses', () => {
  it('supports C++ methods that mutate array arguments by reference', () => {
    const source = 'vector<int> findPair(vector<int>& values,int target) { for(int i=0;i<(int)values.size();i++)for(int j=i+1;j<(int)values.size();j++)if(values[i]+values[j]==target){values[i]=0;return {i,j};}return {}; }';
    expect(gradeExecutionOutputs('pair-with-target-v1', execute('pair-with-target-v1', 'cpp', source))).toMatchObject({ passed: true });
  });
  it.each(Object.entries(python))('executes correct Python for %s', (problemId, source) => {
    expect(gradeExecutionOutputs(problemId, execute(problemId, 'python', source))).toMatchObject({ passed: true });
  });
  it.each(Object.entries(java))('compiles and executes correct Java for %s', (problemId, source) => {
    expect(gradeExecutionOutputs(problemId, execute(problemId, 'java', `class Solution { ${source} }`))).toMatchObject({ passed: true });
  });
  it.each([
    ['typescript', 'function findPair() { return [0,1]; }'],
    ['python', 'def find_pair(values,target): return [0,1]'],
    ['cpp', 'vector<int> findPair(vector<int> values,int target) { return {0,1}; }'],
    ['java', 'class Solution { int[] findPair(int[] values,int target) { return new int[]{0,1}; } }'],
  ] as const)('actually rejects a wrong %s solution after execution', (language, source) => {
    expect(gradeExecutionOutputs('pair-with-target-v1', execute('pair-with-target-v1', language, source))).toMatchObject({ passed: false, passedCount: 1 });
  });
});
