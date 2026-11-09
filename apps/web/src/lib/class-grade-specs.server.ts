import 'server-only';
import { classDesignProtocols, type ClassOperationTrace } from './class-design';
import type { GradeCase } from './code-grade-specs.server';

type TraceCase = [operations: string[], args: Array<Array<number | string>>, expected: Array<number | boolean | null>];

/** Original private state-transition checks. These expectations never enter a runtime program. */
const traces: Record<string, TraceCase[]> = {
  'lru-cache-v1': [
    [['LRUCache', 'put', 'get', 'get'], [[2], [1, 11], [1], [2]], [null, null, 11, -1]],
    [['LRUCache', 'put', 'put', 'get', 'put', 'get', 'get', 'get'], [[2], [1, 10], [2, 20], [1], [3, 30], [2], [1], [3]], [null, null, null, 10, null, -1, 10, 30]],
    [['LRUCache', 'put', 'put', 'put', 'put', 'get', 'get', 'get'], [[2], [1, 10], [2, 20], [1, 15], [3, 30], [2], [1], [3]], [null, null, null, null, null, -1, 15, 30]],
    [['LRUCache', 'put', 'put', 'get', 'get', 'put', 'get'], [[1], [1, 10], [2, 20], [1], [2], [2, 25], [2]], [null, null, null, -1, 20, null, 25]],
    [['LRUCache', 'put', 'put', 'get', 'put', 'get', 'get'], [[2], [1, 10], [2, 20], [9], [3, 30], [1], [2]], [null, null, null, -1, null, -1, 20]],
    [['LRUCache', 'put', 'get', 'put', 'get', 'get'], [[2], [-5, -7], [-5], [0, 0], [0], [-1]], [null, null, -7, null, 0, -1]],
    [['LRUCache', 'put', 'put', 'put', 'get', 'put', 'put', 'get', 'get', 'get', 'get'], [[3], [1, 10], [2, 20], [3, 30], [1], [2, 22], [4, 40], [3], [1], [2], [4]], [null, null, null, null, 10, null, null, -1, 10, 22, 40]],
    [['LRUCache', 'get', 'get', 'get'], [[2], [1], [2], [9]], [null, -1, -1, -1]],
  ],
  'session-manager-v1': [
    [['SessionManager', 'create', 'count', 'count', 'revoke'], [[5], ['alpha', 0], [4], [5], ['alpha', 5]], [null, null, 1, 0, false]],
    [['SessionManager', 'create', 'renew', 'count', 'count'], [[5], ['alpha', 0], ['alpha', 4], [5], [9]], [null, null, true, 1, 0]],
    [['SessionManager', 'create', 'create', 'count', 'count'], [[3], ['alpha', 0], ['alpha', 2], [3], [5]], [null, null, null, 1, 0]],
    [['SessionManager', 'create', 'revoke', 'revoke', 'create', 'revoke', 'count'], [[3], ['alpha', 0], ['alpha', 1], ['alpha', 1], ['beta', 1], ['beta', 4], [4]], [null, null, true, false, null, false, 0]],
    [['SessionManager', 'create', 'create', 'create', 'count', 'count', 'count', 'count'], [[4], ['alpha', 0], ['beta', 1], ['gamma', 2], [3], [4], [5], [6]], [null, null, null, null, 3, 2, 1, 0]],
    [['SessionManager', 'create', 'renew', 'count', 'revoke', 'count'], [[1], ['alpha', 0], ['alpha', 0], [0], ['alpha', 0], [0]], [null, null, true, 1, true, 0]],
    [['SessionManager', 'create', 'renew', 'count', 'renew', 'count', 'create', 'count', 'count'], [[2], ['alpha', 0], ['alpha', 2], [2], ['alpha', 3], [3], ['alpha', 3], [4], [5]], [null, null, false, 0, false, 0, null, 1, 0]],
    [['SessionManager', 'count', 'renew', 'revoke', 'count'], [[7], [0], ['alpha', 0], ['alpha', 0], [0]], [null, 0, false, false, 0]],
  ],
  'order-book-v1': [
    [['OrderBook', 'best', 'best', 'volume', 'cancel'], [[], ['buy'], ['sell'], ['buy', 9], ['buy', 9, 2]], [null, -1, -1, 0, 0]],
    [['OrderBook', 'add', 'add', 'volume', 'best'], [[], ['buy', 10, 3], ['buy', 10, 4], ['buy', 10], ['buy']], [null, null, null, 7, 10]],
    [['OrderBook', 'add', 'add', 'add', 'add', 'add', 'add', 'best', 'best'], [[], ['buy', 10, 1], ['buy', 14, 1], ['buy', 12, 1], ['sell', 20, 1], ['sell', 17, 1], ['sell', 21, 1], ['buy'], ['sell']], [null, null, null, null, null, null, null, 14, 17]],
    [['OrderBook', 'add', 'cancel', 'volume', 'best'], [[], ['sell', 8, 7], ['sell', 8, 3], ['sell', 8], ['sell']], [null, null, 3, 4, 8]],
    [['OrderBook', 'add', 'cancel', 'volume', 'best', 'cancel'], [[], ['buy', 9, 2], ['buy', 9, 5], ['buy', 9], ['buy'], ['buy', 9, 1]], [null, null, 2, 0, -1, 0]],
    [['OrderBook', 'add', 'add', 'cancel', 'volume', 'volume', 'best', 'best'], [[], ['buy', 10, 4], ['sell', 10, 6], ['buy', 10, 2], ['sell', 10], ['buy', 10], ['buy'], ['sell']], [null, null, null, 2, 6, 2, 10, 10]],
    [['OrderBook', 'add', 'add', 'add', 'cancel', 'best', 'volume', 'volume', 'cancel', 'best'], [[], ['buy', 6, 3], ['buy', 8, 2], ['buy', 10, 5], ['buy', 10, 5], ['buy'], ['buy', 6], ['buy', 8], ['buy', 9, 4], ['buy']], [null, null, null, null, 5, 8, 3, 2, 0, 8]],
    [['OrderBook', 'best', 'best', 'volume', 'cancel'], [[], ['buy'], ['sell'], ['buy', 10], ['buy', 10, 1]], [null, -1, -1, 0, 0]],
  ],
};

export const classGradeCases: Record<string, GradeCase[]> = Object.fromEntries(classDesignProtocols.map(protocol => [
  protocol.activityId, traces[protocol.activityId].map(([operations, args, expected], index) => ({
    name: protocol.checkLabels[index], args: [{ operations, arguments: args } satisfies ClassOperationTrace], expected,
  })),
]));
