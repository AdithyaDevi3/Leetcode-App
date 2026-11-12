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

const classReferences: Record<string, Record<ExecutionLanguage, string>> = {
  'lru-cache-v1': {
    typescript: `class LRUCache {
  private values = new Map<number, number>();
  constructor(private capacity: number) {}
  get(key: number): number { const value=this.values.get(key); if(value===undefined)return -1; this.values.delete(key); this.values.set(key,value); return value; }
  put(key: number,value: number): void { if(this.values.has(key))this.values.delete(key); this.values.set(key,value); if(this.values.size>this.capacity)this.values.delete(this.values.keys().next().value!); }
}`,
    python: `from collections import OrderedDict
class LRUCache:
    def __init__(self, capacity): self.capacity, self.values = capacity, OrderedDict()
    def get(self, key):
        if key not in self.values: return -1
        self.values.move_to_end(key)
        return self.values[key]
    def put(self, key, value):
        if key in self.values: del self.values[key]
        self.values[key] = value
        if len(self.values) > self.capacity: self.values.popitem(last=False)`,
    cpp: `class LRUCache { int capacity; list<pair<int,int>> order; unordered_map<int,list<pair<int,int>>::iterator> values;
public: LRUCache(int c):capacity(c){} int get(int key){auto it=values.find(key);if(it==values.end())return -1;auto entry=*it->second;order.erase(it->second);order.push_back(entry);values[key]=prev(order.end());return entry.second;}
void put(int key,int value){auto it=values.find(key);if(it!=values.end()){order.erase(it->second);values.erase(it);}order.push_back({key,value});values[key]=prev(order.end());if((int)values.size()>capacity){values.erase(order.front().first);order.pop_front();}}};`,
    java: `class LRUCache { private final int capacity; private final LinkedHashMap<Integer,Integer> values=new LinkedHashMap<>(16,.75f,true); LRUCache(int c){capacity=c;}
public int get(int key){return values.getOrDefault(key,-1);} public void put(int key,int value){values.put(key,value);if(values.size()>capacity){Integer first=values.keySet().iterator().next();values.remove(first);}} }`,
  },
  'session-manager-v1': {
    typescript: `class SessionManager { private expiry=new Map<string,number>(); constructor(private ttl:number){} create(id:string,time:number):void{this.expiry.set(id,time+this.ttl);} renew(id:string,time:number):boolean{const end=this.expiry.get(id);if(end===undefined||end<=time)return false;this.expiry.set(id,time+this.ttl);return true;} revoke(id:string,time:number):boolean{const end=this.expiry.get(id);if(end===undefined||end<=time)return false;this.expiry.delete(id);return true;} count(time:number):number{let n=0;for(const end of this.expiry.values())if(end>time)n++;return n;} }`,
    python: `class SessionManager:
    def __init__(self, ttl): self.ttl, self.expiry = ttl, {}
    def create(self, id, time): self.expiry[id] = time + self.ttl
    def renew(self, id, time):
        if self.expiry.get(id, time) <= time: return False
        self.expiry[id] = time + self.ttl
        return True
    def revoke(self, id, time):
        if self.expiry.get(id, time) <= time: return False
        del self.expiry[id]
        return True
    def count(self, time): return sum(end > time for end in self.expiry.values())`,
    cpp: `class SessionManager { int ttl; unordered_map<string,int> expiry; public: SessionManager(int t):ttl(t){} void create(string id,int time){expiry[id]=time+ttl;} bool renew(string id,int time){auto it=expiry.find(id);if(it==expiry.end()||it->second<=time)return false;it->second=time+ttl;return true;} bool revoke(string id,int time){auto it=expiry.find(id);if(it==expiry.end()||it->second<=time)return false;expiry.erase(it);return true;} int count(int time){int n=0;for(auto& item:expiry)if(item.second>time)n++;return n;} };`,
    java: `class SessionManager { private final int ttl; private final Map<String,Integer> expiry=new HashMap<>(); SessionManager(int t){ttl=t;} public void create(String id,int time){expiry.put(id,time+ttl);} public boolean renew(String id,int time){Integer end=expiry.get(id);if(end==null||end<=time)return false;expiry.put(id,time+ttl);return true;} public boolean revoke(String id,int time){Integer end=expiry.get(id);if(end==null||end<=time)return false;expiry.remove(id);return true;} public int count(int time){int n=0;for(int end:expiry.values())if(end>time)n++;return n;} }`,
  },
  'order-book-v1': {
    typescript: `class OrderBook { private books={buy:new Map<number,number>(),sell:new Map<number,number>()}; add(side:'buy'|'sell',price:number,quantity:number):void{const book=this.books[side];book.set(price,(book.get(price)??0)+quantity);} cancel(side:'buy'|'sell',price:number,quantity:number):number{const book=this.books[side],available=book.get(price)??0,removed=Math.min(available,quantity),left=available-removed;if(left)book.set(price,left);else book.delete(price);return removed;} best(side:'buy'|'sell'):number{const prices=[...this.books[side].keys()];return prices.length?(side==='buy'?Math.max(...prices):Math.min(...prices)):-1;} volume(side:'buy'|'sell',price:number):number{return this.books[side].get(price)??0;} }`,
    python: `class OrderBook:
    def __init__(self): self.books = {'buy':{}, 'sell':{}}
    def add(self, side, price, quantity): self.books[side][price] = self.books[side].get(price,0) + quantity
    def cancel(self, side, price, quantity):
        available = self.books[side].get(price,0); removed = min(available,quantity); left = available-removed
        if left: self.books[side][price] = left
        else: self.books[side].pop(price,None)
        return removed
    def best(self, side):
        if not self.books[side]: return -1
        return max(self.books[side]) if side == 'buy' else min(self.books[side])
    def volume(self, side, price): return self.books[side].get(price,0)`,
    cpp: `class OrderBook { map<int,int> buy,sell; map<int,int>& book(string side){return side=="buy"?buy:sell;} public: OrderBook(){} void add(string side,int price,int quantity){book(side)[price]+=quantity;} int cancel(string side,int price,int quantity){auto& b=book(side);auto it=b.find(price);if(it==b.end())return 0;int removed=min(it->second,quantity);it->second-=removed;if(it->second==0)b.erase(it);return removed;} int best(string side){auto& b=book(side);if(b.empty())return -1;return side=="buy"?b.rbegin()->first:b.begin()->first;} int volume(string side,int price){auto& b=book(side);auto it=b.find(price);return it==b.end()?0:it->second;} };`,
    java: `class OrderBook { private final TreeMap<Integer,Integer> buy=new TreeMap<>(),sell=new TreeMap<>(); private TreeMap<Integer,Integer> book(String side){return side.equals("buy")?buy:sell;} public void add(String side,int price,int quantity){book(side).merge(price,quantity,Integer::sum);} public int cancel(String side,int price,int quantity){TreeMap<Integer,Integer> b=book(side);int available=b.getOrDefault(price,0),removed=Math.min(available,quantity),left=available-removed;if(left==0)b.remove(price);else b.put(price,left);return removed;} public int best(String side){TreeMap<Integer,Integer>b=book(side);return b.isEmpty()?-1:(side.equals("buy")?b.lastKey():b.firstKey());} public int volume(String side,int price){return book(side).getOrDefault(price,0);} }`,
  },
};

const classMutants: Record<string, string> = {
  'lru-cache-v1': `class LRUCache { values=new Map<number,number>(); constructor(private capacity:number){} get(key:number){return this.values.get(key)??-1;} put(key:number,value:number){this.values.set(key,value);if(this.values.size>this.capacity)this.values.delete(this.values.keys().next().value!);} }`,
  'session-manager-v1': `class SessionManager { expiry=new Map<string,number>(); constructor(private ttl:number){} create(id:string,time:number){this.expiry.set(id,time+this.ttl);} renew(id:string,time:number){const end=this.expiry.get(id);if(end===undefined||end<time)return false;this.expiry.set(id,time+this.ttl);return true;} revoke(id:string,time:number){if(!this.expiry.has(id))return false;this.expiry.delete(id);return true;} count(time:number){return [...this.expiry.values()].filter(end=>end>=time).length;} }`,
  'order-book-v1': `class OrderBook { books={buy:new Map<number,number>(),sell:new Map<number,number>()}; add(side:'buy'|'sell',price:number,q:number){this.books[side].set(price,(this.books[side].get(price)??0)+q);} cancel(side:'buy'|'sell',price:number,q:number){const n=Math.min(q,this.books[side].get(price)??0);return n;} best(side:'buy'|'sell'){const p=[...this.books[side].keys()];return p.length?Math.min(...p):-1;} volume(side:'buy'|'sell',price:number){return this.books[side].get(price)??0;} }`,
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

describe('stateful class grading harnesses', () => {
  it.each(Object.entries(classReferences).flatMap(([problemId, references]) =>
    Object.entries(references).map(([language, source]) => [problemId, language, source] as const),
  ))('executes a correct %s %s class against every private trace', (problemId, language, source) => {
    expect(gradeExecutionOutputs(problemId, execute(problemId, language as ExecutionLanguage, source))).toMatchObject({ passed: true, passedCount: 8, totalCount: 8 });
  });

  it.each(Object.entries(classMutants))('rejects a plausible state bug for %s', (problemId, source) => {
    const grade = gradeExecutionOutputs(problemId, execute(problemId, 'typescript', source));
    expect(grade).toMatchObject({ passed: false, totalCount: 8 });
    expect(grade!.passedCount).toBeLessThan(8);
  });
});
