import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { getReviewedQuestionVersion } from './question-bank.server';
import { getDiagnosticQuestionVersions } from './diagnostic-catalog.server';

function arrays(alphabet: readonly number[], length: number): number[][] {
  if (length === 0) return [[]];
  return arrays(alphabet, length - 1).flatMap(prefix => alphabet.map(value => [...prefix, value]));
}
function firstUnique(values: readonly number[]): number {
  return values.findIndex(value => values.filter(other => other === value).length === 1);
}
function routes(remaining: number): number[][] {
  if (remaining === 0) return [[]];
  return [1, 2].filter(step => step <= remaining).flatMap(step => routes(remaining - step).map(rest => [step, ...rest]));
}
function coinTable(coins: readonly number[], amount: number): number[] {
  const result = Array<number>(amount + 1).fill(Infinity); result[0] = 0;
  for (let a = 1; a <= amount; a += 1) for (const coin of coins) if (coin <= a) result[a] = Math.min(result[a], result[a - coin] + 1);
  return result;
}

describe('independent curriculum example checks', () => {
  it('checks pair-search source indices and the alternative needed-value representation', () => {
    const source = [8, 1, 6, 4];
    const sorted = source.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
    expect(sorted.slice(1, 3).map(entry => entry.index)).toEqual([3, 2]);
    const needed = new Map<number, number>();
    [4, 10].forEach((value, index) => needed.set(15 - value, index));
    expect(needed.get(5)).toBe(1);
    const zeroIndex = new Map([[6, 0]]);
    expect(zeroIndex.has(6)).toBe(true); expect(Boolean(zeroIndex.get(6))).toBe(false);
  });

  it('checks fixed-window examples and prefix differences against direct sums, including negative inputs', () => {
    const sums = (values: number[], k: number) => values.slice(0, values.length - k + 1).map((_, start) => values.slice(start, start + k).reduce((a, b) => a + b, 0));
    expect(sums([1, 2, -5, 9], 2)).toEqual([3, -3, 4]);
    expect(sums([5, -100, 6], 2)).toEqual([-95, -94]);
    for (let length = 1; length <= 5; length += 1) for (const values of arrays([-2, 0, 3], length)) {
      const prefix = [0]; values.forEach(value => prefix.push(prefix.at(-1)! + value));
      for (let k = 1; k <= length; k += 1) {
        const actual = sums(values, k);
        expect(actual).toHaveLength(length - k + 1);
        actual.forEach((sum, start) => expect(prefix[start + k] - prefix[start]).toBe(sum));
      }
    }
    const tied = sums([2, 1, 2, 1], 2);
    expect(tied.indexOf(Math.max(...tied))).toBe(0);
  });

  it('counts binary-tree null calls independently and preserves depth under child swapping', () => {
    type Tree = { left: Tree | null; right: Tree | null } | null;
    const leaf = (): Tree => ({ left: null, right: null });
    const examples: Tree[] = [null, leaf(), { left: leaf(), right: leaf() }, { left: null, right: { left: null, right: leaf() } }];
    const visit = (tree: Tree): { nodes: number; calls: number; depth: number } => {
      if (!tree) return { nodes: 0, calls: 1, depth: 0 };
      const a = visit(tree.left), b = visit(tree.right);
      return { nodes: a.nodes + b.nodes + 1, calls: a.calls + b.calls + 1, depth: Math.max(a.depth, b.depth) + 1 };
    };
    const mirror = (tree: Tree): Tree => tree ? { left: mirror(tree.right), right: mirror(tree.left) } : null;
    for (const tree of examples) {
      const result = visit(tree);
      expect(result.calls).toBe(2 * result.nodes + 1);
      expect(visit(mirror(tree)).depth).toBe(result.depth);
    }
    expect(visit(examples[3]).depth).toBe(3);
  });

  it('executes bracket traces and confirms that scalar counts lose mixed-type order', () => {
    const stack: string[] = [];
    const matching: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    for (const character of '{[()]') if (matching[character]) expect(stack.pop()).toBe(matching[character]); else stack.push(character);
    expect(stack).toEqual(['{']);
    expect('[()]{}'.replace('()', '').replace('[]', '').replace('{}', '')).toBe('');
    const scalarPrefix: number[] = []; let balance = 0;
    for (const character of '([)]') { balance += '([{'.includes(character) ? 1 : -1; scalarPrefix.push(balance); }
    expect(scalarPrefix.every(value => value >= 0)).toBe(true); expect(balance).toBe(0);
    expect('([)]'.indexOf(')')).toBeLessThan('([)]'.indexOf(']'));
  });

  it('enumerates blocked-step routes and verifies modular recurrence for composite moduli and M=1', () => {
    const allowed = routes(5).filter(route => {
      let position = 0; return route.every(step => { position += step; return position !== 3; });
    });
    expect(allowed).toEqual([[1, 1, 2, 1], [2, 2, 1]]);
    for (const modulus of [1, 2, 4, 6, 7, 10]) {
      let previous = 1 % modulus, current = 1 % modulus;
      for (let n = 2; n <= 12; n += 1) {
        [previous, current] = [current, (previous + current) % modulus];
        expect(current).toBe(routes(n).length % modulus);
      }
    }
  });

  it('checks rectangular coordinate identity and the diagnostic directed-fill counterexample', () => {
    for (let rows = 2; rows <= 9; rows += 1) for (let columns = 2; columns <= 9; columns += 1) {
      const keys = new Set<number>();
      for (let r = 0; r < rows; r += 1) for (let c = 0; c < columns; c += 1) keys.add(r * columns + c);
      expect(keys.size).toBe(rows * columns);
    }
    const count = (directions: readonly number[][]): number => {
      const grid = [[1, 0, 1], [1, 1, 1]], visited = new Set<string>(); let components = 0;
      const fill = (r: number, c: number): void => {
        if (r < 0 || r >= 2 || c < 0 || c >= 3 || grid[r][c] === 0 || visited.has(`${r},${c}`)) return;
        visited.add(`${r},${c}`); directions.forEach(([dr, dc]) => fill(r + dr, c + dc));
      };
      for (let r = 0; r < 2; r += 1) for (let c = 0; c < 3; c += 1) if (grid[r][c] === 1 && !visited.has(`${r},${c}`)) { components += 1; fill(r, c); }
      return components;
    };
    expect(count([[0, 1], [1, 0]])).toBe(2);
    expect(count([[0, 1], [1, 0], [0, -1], [-1, 0]])).toBe(1);
  });

  it('checks monotone pointer movements and counts unordered index pairs', () => {
    const values = [1, 4, 6, 10, 14], trace: number[][] = []; let left = 0, right = values.length - 1;
    while (left < right) {
      trace.push([values[left], values[right]]); const sum = values[left] + values[right];
      if (sum === 16) break;
      if (sum < 16) left += 1; else right -= 1;
    }
    expect(trace).toEqual([[1, 14], [4, 14], [4, 10], [6, 10]]);
    const pairs = [0, 1, 2, 3].flatMap(i => [0, 1, 2, 3].filter(j => j > i).map(j => [i, j]));
    expect(pairs).toHaveLength(6);
  });

  it('checks ready-task choice against exhaustive topological orders and rejects omitted or repeated tasks', () => {
    const vertices = [0, 1, 2, 3];
    const permutations = (remaining: number[]): number[][] => remaining.length
      ? remaining.flatMap(value => permutations(remaining.filter(other => other !== value)).map(rest => [value, ...rest])) : [[]];
    const allOrders = permutations(vertices);
    const possibleEdges = vertices.flatMap(from => vertices.filter(to => from < to).map(to => [from, to]));
    for (let mask = 0; mask < 2 ** possibleEdges.length; mask += 1) {
      const edges = possibleEdges.filter((_, index) => mask & (1 << index));
      const valid = allOrders.filter(order => edges.every(([from, to]) => order.indexOf(from) < order.indexOf(to)));
      expect(valid.length).toBeGreaterThan(0);
      for (const order of valid) for (let prefixLength = 0; prefixLength < vertices.length; prefixLength += 1) {
        const prefix = order.slice(0, prefixLength);
        const ready = vertices.filter(vertex => !prefix.includes(vertex) && edges.every(([from, to]) => to !== vertex || prefix.includes(from)));
        if (ready.length < 2) continue;
        for (const choice of ready) expect(valid.some(candidate => [...prefix, choice].every((value, index) => candidate[index] === value))).toBe(true);
      }
    }
    const tasks = ['A', 'B', 'C'], proposed = ['A', 'A', 'C'];
    expect(proposed).toHaveLength(tasks.length);
    expect(tasks.every(task => proposed.filter(value => value === task).length === 1)).toBe(false);
    expect(new Set(['A:B', 'A:B']).size).toBe(1);
  });

  it('checks optimal reconstruction against a separate breadth-first minimum-count oracle and scaling', () => {
    const shortest = (coins: number[], target: number): number => {
      const queue = [{ amount: 0, count: 0 }], seen = new Set([0]);
      for (let index = 0; index < queue.length; index += 1) {
        const state = queue[index]; if (state.amount === target) return state.count;
        for (const coin of coins) if (state.amount + coin <= target && !seen.has(state.amount + coin)) {
          seen.add(state.amount + coin); queue.push({ amount: state.amount + coin, count: state.count + 1 });
        }
      }
      return Infinity;
    };
    for (const coins of [[2], [2, 3], [1, 3, 4], [3, 5, 7]]) for (let target = 0; target <= 24; target += 1) {
      const table = coinTable(coins, target);
      expect(table[target]).toBe(shortest(coins, target));
      if (!Number.isFinite(table[target])) continue;
      let remaining = target; const chosen: number[] = [];
      while (remaining > 0) {
        const coin = coins.find(c => c <= remaining && table[remaining - c] + 1 === table[remaining])!;
        expect(coin).toBeGreaterThan(0); chosen.push(coin); remaining -= coin;
      }
      expect(chosen.reduce((a, b) => a + b, 0)).toBe(target);
      expect(chosen.length).toBe(table[target]);
      expect(coinTable(coins.map(c => c * 10), target * 10)[target * 10]).toBe(table[target]);
    }
    expect(coinTable([2, 3], 7)[7]).toBe(3);
    expect(getReviewedQuestionVersion('coin-change-reconstruct-optimal-choice@1')?.prompt).toContain('unlimited reuse');
  });

  it('checks compressed frequencies, streaming candidates, and injective relabeling against complete-prefix scans', () => {
    for (let length = 0; length <= 6; length += 1) for (const values of arrays([0, 1, 2], length)) {
      const counts = new Map<number, number>(), queue: { value: number; index: number }[] = [];
      values.forEach((value, index) => {
        counts.set(value, (counts.get(value) ?? 0) + 1); queue.push({ value, index });
        while (queue.length && counts.get(queue[0].value)! > 1) queue.shift();
        expect(queue[0]?.index ?? -1).toBe(firstUnique(values.slice(0, index + 1)));
      });
      const saturated = new Map<number, number>();
      values.forEach(value => saturated.set(value, Math.min(2, (saturated.get(value) ?? 0) + 1)));
      expect(values.findIndex(value => saturated.get(value) === 1)).toBe(firstUnique(values));
      expect(firstUnique(values.map(value => -7 * value + 11))).toBe(firstUnique(values));
      if (firstUnique(values) === -1) expect(firstUnique([...values, 99])).toBe(values.length);
    }
    expect(getDiagnosticQuestionVersions().find(q => q.questionId === 'diagnostic-unique-append-fresh-value')?.explanation).toContain('empty');
  });
});
