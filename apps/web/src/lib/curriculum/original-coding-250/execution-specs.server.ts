import 'server-only';

export type OriginalCodingHiddenCase = Readonly<{ name: string; args: readonly unknown[] }>;

export type OriginalCodingExecutionSpec = Readonly<{
  functionName: string;
  pythonFunctionName: string;
  cases: readonly OriginalCodingHiddenCase[];
  reference: (...args: never[]) => unknown;
}>;

const countValues = (values: number[]) => Object.fromEntries(values.map(value => [value, values.filter(item => item === value).length]));
const firstRepeatPosition = (values: number[]) => {
  const seen = new Set<number>();
  return values.findIndex(value => (seen.has(value) ? true : (seen.add(value), false)));
};
const sharedValuesOnce = (left: number[], right: number[]) => {
  const rightValues = new Set(right);
  const returned = new Set<number>();
  return left.filter(value => rightValues.has(value) && !returned.has(value) && Boolean(returned.add(value)));
};
const longestZeroSumSpan = (values: number[]) => {
  const firstIndex = new Map<number, number>([[0, -1]]);
  let sum = 0;
  let longest = 0;
  values.forEach((value, index) => {
    sum += value;
    const first = firstIndex.get(sum);
    if (first === undefined) firstIndex.set(sum, index);
    else longest = Math.max(longest, index - first);
  });
  return longest;
};
const findSortedPair = (values: number[], target: number) => {
  let left = 0;
  let right = values.length - 1;
  while (left < right) {
    const sum = values[left] + values[right];
    if (sum === target) return [left, right];
    if (sum < target) left += 1;
    else right -= 1;
  }
  return [];
};
const strongestFixedWindow = (values: number[], width: number) => {
  let current = values.slice(0, width).reduce((sum, value) => sum + value, 0);
  let best = current;
  for (let index = width; index < values.length; index += 1) {
    current += values[index] - values[index - width];
    best = Math.max(best, current);
  }
  return best;
};
const longestDistinctStretch = (text: string) => {
  const latest = new Map<string, number>();
  let left = 0;
  let best = 0;
  [...text].forEach((character, index) => {
    left = Math.max(left, (latest.get(character) ?? -1) + 1);
    latest.set(character, index);
    best = Math.max(best, index - left + 1);
  });
  return best;
};
const smallestRequiredCover = (text: string, required: string) => {
  const needed = new Map<string, number>();
  for (const character of required) needed.set(character, (needed.get(character) ?? 0) + 1);
  const present = new Map<string, number>();
  let satisfied = 0;
  let left = 0;
  let answer = '';
  for (let right = 0; right < text.length; right += 1) {
    const character = text[right];
    present.set(character, (present.get(character) ?? 0) + 1);
    if ((present.get(character) ?? 0) === needed.get(character)) satisfied += 1;
    while (satisfied === needed.size) {
      const candidate = text.slice(left, right + 1);
      if (!answer || candidate.length < answer.length) answer = candidate;
      const outgoing = text[left];
      present.set(outgoing, (present.get(outgoing) ?? 0) - 1);
      if ((present.get(outgoing) ?? 0) < (needed.get(outgoing) ?? 0)) satisfied -= 1;
      left += 1;
    }
  }
  return answer;
};
const firstTrueThreshold = (flags: boolean[]) => {
  let left = 0;
  let right = flags.length - 1;
  let answer = -1;
  while (left <= right) {
    const middle = left + Math.floor((right - left) / 2);
    if (flags[middle]) { answer = middle; right = middle - 1; } else left = middle + 1;
  }
  return answer;
};
const integerSquareRoot = (value: number) => Math.floor(Math.sqrt(value));
const minimumUsableRate = (jobs: number[], hours: number) => {
  let low = 1;
  let high = Math.max(...jobs);
  while (low < high) {
    const rate = low + Math.floor((high - low) / 2);
    const required = jobs.reduce((total, job) => total + Math.ceil(job / rate), 0);
    if (required <= hours) high = rate;
    else low = rate + 1;
  }
  return low;
};
const validDelimiterOrder = (text: string) => {
  const opening = new Set(['(', '[', '{']);
  const matching: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const stack: string[] = [];
  for (const character of text) {
    if (opening.has(character)) stack.push(character);
    else if (character in matching && stack.pop() !== matching[character]) return false;
  }
  return stack.length === 0;
};
const nextLargerReading = (values: number[]) => values.map((value, index) => values.slice(index + 1).find(candidate => candidate > value) ?? -1);
const evaluatePostfixExpression = (tokens: string[]) => {
  const values: number[] = [];
  for (const token of tokens) {
    if (!['+', '-', '*', '/'].includes(token)) values.push(Number(token));
    else {
      const right = values.pop()!;
      const left = values.pop()!;
      values.push(token === '+' ? left + right : token === '-' ? left - right : token === '*' ? left * right : Math.trunc(left / right));
    }
  }
  return values[0];
};

function spec(functionName: string, pythonFunctionName: string, reference: (...args: never[]) => unknown, cases: readonly OriginalCodingHiddenCase[]): OriginalCodingExecutionSpec {
  return Object.freeze({ functionName, pythonFunctionName, reference, cases: Object.freeze(cases.map(item => Object.freeze({ ...item, args: Object.freeze([...item.args]) }))) });
}

/**
 * Private, deterministic behavior for candidates with JSON-compatible inputs.
 * Do not import this module from browser code or serialize its values in a route.
 */
export const originalCodingExecutionSpecs: Readonly<Record<string, OriginalCodingExecutionSpec>> = Object.freeze({
  'frequency-ledger': spec('buildFrequencyLedger', 'build_frequency_ledger', countValues as never, [{ name: 'counts repeated and negative values', args: [[4, -1, 4, 2, -1, 4]] }]),
  'first-repeat-position': spec('firstRepeatPosition', 'first_repeat_position', firstRepeatPosition as never, [{ name: 'finds the earliest repeated arrival', args: [[8, 3, 8, 3]] }, { name: 'returns minus one when values are unique', args: [[1, 2, 3]] }]),
  'shared-values-once': spec('sharedValuesOnce', 'shared_values_once', sharedValuesOnce as never, [{ name: 'keeps the first-list order', args: [[5, 2, 5, 7, 2], [2, 5, 9]] }]),
  'balanced-sum-span': spec('longestZeroSumSpan', 'longest_zero_sum_span', longestZeroSumSpan as never, [{ name: 'finds a span after a repeated sum', args: [[3, 1, -4, 2, -2, 5]] }]),
  'sorted-pair-locations': spec('findSortedPair', 'find_sorted_pair', findSortedPair as never, [{ name: 'finds a pair at the boundary', args: [[-3, 1, 4, 6, 10], 7] }, { name: 'returns an empty list when absent', args: [[1, 3, 5], 6] }]),
  'strongest-fixed-window': spec('strongestFixedWindow', 'strongest_fixed_window', strongestFixedWindow as never, [{ name: 'handles all-negative windows', args: [[-5, -2, -7, -1], 2] }]),
  'distinct-symbol-stretch': spec('longestDistinctStretch', 'longest_distinct_stretch', longestDistinctStretch as never, [{ name: 'moves the left boundary past repeats', args: ['piperp'] }]),
  'smallest-required-cover': spec('smallestRequiredCover', 'smallest_required_cover', smallestRequiredCover as never, [{ name: 'requires repeated characters', args: ['abacbba', 'aab'] }]),
  'first-true-threshold': spec('firstTrueThreshold', 'first_true_threshold', firstTrueThreshold as never, [{ name: 'handles an all-false array', args: [[false, false, false]] }, { name: 'finds the first true value', args: [[false, false, true, true]] }]),
  'square-root-floor': spec('integerSquareRoot', 'integer_square_root', integerSquareRoot as never, [{ name: 'rounds down a non-square', args: [2_000_000_000] }]),
  'minimum-usable-rate': spec('minimumUsableRate', 'minimum_usable_rate', minimumUsableRate as never, [{ name: 'chooses the smallest feasible rate', args: [[7, 10, 12], 8] }]),
  'validate-delimiter-order': spec('validDelimiterOrder', 'valid_delimiter_order', validDelimiterOrder as never, [{ name: 'rejects crossing delimiters', args: ['([)]'] }, { name: 'ignores other characters', args: ['a{b[c]}'] }]),
  'next-larger-reading': spec('nextLargerReading', 'next_larger_reading', nextLargerReading as never, [{ name: 'uses the first later greater value', args: [[4, 1, 6, 3]] }]),
  'evaluate-postfix-expression': spec('evaluatePostfixExpression', 'evaluate_postfix_expression', evaluatePostfixExpression as never, [{ name: 'preserves subtraction order', args: [['8', '3', '-', '2', '*']] }]),
});

export function expectedOriginalCodingOutput(questionId: string, args: readonly unknown[]): unknown {
  const item = originalCodingExecutionSpecs[questionId];
  if (!item) throw new Error('No private execution specification exists for this coding question.');
  return item.reference(...args as never[]);
}
