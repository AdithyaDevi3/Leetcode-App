import { describe, expect, it } from 'vitest';
import type { ExecutionLanguage } from '@leetcode-app/domain';
import {
  classDesignProtocols, classDesignStarter, getClassDesignProtocol, isClassOperationTrace,
  MAX_CLASS_TRACE_OPERATIONS,
} from './class-design';

describe('stateful class-design contracts', () => {
  it('defines three distinct original exercises with valid public traces', () => {
    expect(classDesignProtocols.map(item => item.activityId)).toEqual([
      'lru-cache-v1', 'session-manager-v1', 'order-book-v1',
    ]);
    for (const protocol of classDesignProtocols) {
      expect(isClassOperationTrace(protocol, protocol.example.trace)).toBe(true);
      expect(protocol.example.expected).toHaveLength(protocol.example.trace.operations.length);
      expect(new Set(protocol.methods.map(method => method.name)).size).toBe(protocol.methods.length);
      expect(protocol.checkLabels).toHaveLength(8);
    }
  });

  it.each(classDesignProtocols.flatMap(protocol =>
    (['typescript', 'python', 'cpp', 'java'] as ExecutionLanguage[]).map(language => [protocol.activityId, language] as const),
  ))('creates a class starter for %s in %s', (activityId, language) => {
    const protocol = getClassDesignProtocol(activityId)!;
    const starter = classDesignStarter(protocol, language);
    expect(starter).toContain(`class ${protocol.className}`);
    for (const method of protocol.methods) expect(starter).toContain(method.name);
    if (language === 'java') expect(starter).not.toContain(`public class ${protocol.className}`);
    if (language === 'cpp') expect(starter).toContain('public:');
  });

  it('rejects extra keys, mismatched rows, repeated constructors, unknown/prototype methods and wrong arity', () => {
    const protocol = getClassDesignProtocol('lru-cache-v1')!;
    const valid = protocol.example.trace;
    expect(isClassOperationTrace(protocol, { ...valid, private: true })).toBe(false);
    expect(isClassOperationTrace(protocol, { operations: valid.operations, arguments: valid.arguments.slice(1) })).toBe(false);
    expect(isClassOperationTrace(protocol, { operations: ['LRUCache', 'LRUCache'], arguments: [[2], [2]] })).toBe(false);
    expect(isClassOperationTrace(protocol, { operations: ['LRUCache', '__proto__'], arguments: [[2], []] })).toBe(false);
    expect(isClassOperationTrace(protocol, { operations: ['LRUCache', 'constructor'], arguments: [[2], []] })).toBe(false);
    expect(isClassOperationTrace(protocol, { operations: ['LRUCache', 'put'], arguments: [[2], [1]] })).toBe(false);
  });

  it('enforces trace, identifier, side, numeric and chronological bounds', () => {
    const lru = getClassDesignProtocol('lru-cache-v1')!;
    expect(isClassOperationTrace(lru, {
      operations: Array.from({ length: MAX_CLASS_TRACE_OPERATIONS + 1 }, (_, index) => index ? 'get' : 'LRUCache'),
      arguments: Array.from({ length: MAX_CLASS_TRACE_OPERATIONS + 1 }, (_, index) => index ? [1] : [2]),
    })).toBe(false);
    expect(isClassOperationTrace(lru, { operations: ['LRUCache'], arguments: [[0]] })).toBe(false);
    expect(isClassOperationTrace(lru, { operations: ['LRUCache', 'put'], arguments: [[2], [1, Number.MAX_SAFE_INTEGER]] })).toBe(false);

    const sessions = getClassDesignProtocol('session-manager-v1')!;
    expect(isClassOperationTrace(sessions, { operations: ['SessionManager', 'create'], arguments: [[5], ['__proto__', 0]] })).toBe(false);
    expect(isClassOperationTrace(sessions, { operations: ['SessionManager', 'create', 'count'], arguments: [[5], ['alpha', 5], [4]] })).toBe(false);

    const book = getClassDesignProtocol('order-book-v1')!;
    expect(isClassOperationTrace(book, { operations: ['OrderBook', 'add'], arguments: [[], ['hold', 10, 1]] })).toBe(false);
    expect(isClassOperationTrace(book, { operations: ['OrderBook', 'add'], arguments: [[], ['buy', 0, 1]] })).toBe(false);
  });
});
