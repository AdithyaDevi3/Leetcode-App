import type { ExecutionLanguage } from '@leetcode-app/domain';

export type ClassValueType = 'integer' | 'string' | 'boolean' | 'void';
export type ClassParameter = { name: string; type: 'integer' | 'string'; min?: number; max?: number; choices?: readonly string[] };
export type ClassMethod = { name: string; parameters: readonly ClassParameter[]; returns: ClassValueType };
export type ClassOperationTrace = { operations: string[]; arguments: Array<Array<number | string>> };
export type StatefulClassProtocol = {
  kind: 'stateful-class'; activityId: string; className: string;
  constructorParameters: readonly ClassParameter[]; methods: readonly ClassMethod[];
  chronologicalTime?: boolean;
  example: { trace: ClassOperationTrace; expected: Array<number | boolean | null> };
  checkLabels: readonly string[];
};

const integer = (name: string, min = -1_000_000_000, max = 1_000_000_000): ClassParameter => ({ name, type: 'integer', min, max });
const side: ClassParameter = { name: 'side', type: 'string', choices: ['buy', 'sell'] };
const id: ClassParameter = { name: 'id', type: 'string' };
const time = integer('time', 0);
const price = integer('price', 1);
const quantity = integer('quantity', 1, 1_000_000);

/** Public contracts and examples only. Full-suite inputs and answers live server-side. */
export const classDesignProtocols: readonly StatefulClassProtocol[] = [
  {
    kind: 'stateful-class', activityId: 'lru-cache-v1', className: 'LRUCache',
    constructorParameters: [integer('capacity', 1, 1_000)],
    methods: [
      { name: 'get', parameters: [integer('key')], returns: 'integer' },
      { name: 'put', parameters: [integer('key'), integer('value')], returns: 'void' },
    ],
    example: { trace: { operations: ['LRUCache', 'put', 'put', 'get', 'put', 'get', 'get'], arguments: [[2], [4, 40], [7, 70], [4], [9, 90], [7], [9]] }, expected: [null, null, null, 40, null, -1, 90] },
    checkLabels: ['retrieves stored values and misses', 'refreshes recency on reads', 'updates values without duplicate entries', 'evicts at capacity one', 'keeps missing reads from changing recency', 'handles signed keys and values', 'maintains recency through repeated operations', 'starts each trace with independent state'],
  },
  {
    kind: 'stateful-class', activityId: 'session-manager-v1', className: 'SessionManager',
    constructorParameters: [integer('ttl', 1, 1_000_000)], chronologicalTime: true,
    methods: [
      { name: 'create', parameters: [id, time], returns: 'void' },
      { name: 'renew', parameters: [id, time], returns: 'boolean' },
      { name: 'revoke', parameters: [id, time], returns: 'boolean' },
      { name: 'count', parameters: [time], returns: 'integer' },
    ],
    example: { trace: { operations: ['SessionManager', 'create', 'count', 'renew', 'count', 'count'], arguments: [[5], ['alpha', 0], [4], ['alpha', 4], [5], [9]] }, expected: [null, null, 1, true, 1, 0] },
    checkLabels: ['expires sessions at the exact deadline', 'extends only live sessions', 'overwrites an existing session deadline', 'revokes only live sessions', 'counts simultaneous independent sessions', 'handles repeated timestamps', 'does not revive expired sessions', 'starts each trace with independent state'],
  },
  {
    kind: 'stateful-class', activityId: 'order-book-v1', className: 'OrderBook', constructorParameters: [],
    methods: [
      { name: 'add', parameters: [side, price, quantity], returns: 'void' },
      { name: 'cancel', parameters: [side, price, quantity], returns: 'integer' },
      { name: 'best', parameters: [side], returns: 'integer' },
      { name: 'volume', parameters: [side, price], returns: 'integer' },
    ],
    example: { trace: { operations: ['OrderBook', 'add', 'add', 'add', 'best', 'cancel', 'volume', 'best'], arguments: [[], ['buy', 12, 4], ['buy', 15, 2], ['sell', 18, 3], ['buy'], ['buy', 15, 5], ['buy', 15], ['buy']] }, expected: [null, null, null, null, 15, 2, 0, 12] },
    checkLabels: ['reports empty and unknown price levels', 'aggregates repeated price levels', 'selects the correct best price on each side', 'partially cancels available volume', 'caps cancellation and removes empty levels', 'keeps buy and sell state independent', 'preserves other levels after cancellation', 'starts each trace with independent state'],
  },
];

export const getClassDesignProtocol = (activityId: string) => classDesignProtocols.find(protocol => protocol.activityId === activityId);
export const getClassDesignProtocolByName = (className: string) => classDesignProtocols.find(protocol => protocol.className === className);

/** At most 127 additions of <=1e6 units keeps every price level within signed int32. */
export const MAX_CLASS_TRACE_OPERATIONS = 128;
export function isClassOperationTrace(protocol: StatefulClassProtocol, value: unknown): value is ClassOperationTrace {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const trace = value as Record<string, unknown>;
  if (Object.keys(trace).length !== 2 || !Object.hasOwn(trace, 'operations') || !Object.hasOwn(trace, 'arguments')
    || !Array.isArray(trace.operations) || !Array.isArray(trace.arguments)) return false;
  const operations = trace.operations;
  const argumentRows = trace.arguments;
  if (operations.length < 1 || operations.length > MAX_CLASS_TRACE_OPERATIONS
    || operations.length !== argumentRows.length || operations[0] !== protocol.className) return false;
  let lastTime = 0;
  return operations.every((operation, index) => {
    const method = index === 0 ? undefined : protocol.methods.find(candidate => candidate.name === operation);
    if (index > 0 && !method) return false;
    const parameters = index === 0 ? protocol.constructorParameters : method!.parameters;
    const args: unknown = argumentRows[index];
    if (!Array.isArray(args) || args.length !== parameters.length) return false;
    return parameters.every((parameter, argumentIndex) => {
      const argument: unknown = args[argumentIndex];
      if (parameter.type === 'integer') {
        if (typeof argument !== 'number' || !Number.isSafeInteger(argument) || argument < parameter.min! || argument > parameter.max!) return false;
        if (protocol.chronologicalTime && parameter.name === 'time') {
          if (argument < lastTime) return false;
          lastTime = argument;
        }
        return true;
      }
      return typeof argument === 'string' && (parameter.choices ? parameter.choices.includes(argument) : /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(argument));
    });
  });
}

const typeNames: Record<ExecutionLanguage, Record<ClassValueType, string>> = {
  python: { integer: 'int', string: 'str', boolean: 'bool', void: 'None' },
  typescript: { integer: 'number', string: 'string', boolean: 'boolean', void: 'void' },
  cpp: { integer: 'int', string: 'string', boolean: 'bool', void: 'void' },
  java: { integer: 'int', string: 'String', boolean: 'boolean', void: 'void' },
};

export function classDesignStarter(protocol: StatefulClassProtocol, language: ExecutionLanguage, plan = ''): string {
  const types = typeNames[language];
  const parameters = (items: readonly ClassParameter[]) => items.map(parameter => language === 'python' || language === 'typescript'
    ? `${parameter.name}: ${types[parameter.type]}` : `${types[parameter.type]} ${parameter.name}`).join(', ');
  const comments = (plan || 'Translate your approved plan here.').split('\n').map(line => `${language === 'python' ? '    # ' : '  // '}${line}`).join('\n');
  if (language === 'python') return `${comments}\nclass ${protocol.className}:\n    def __init__(self${protocol.constructorParameters.length ? ', ' : ''}${parameters(protocol.constructorParameters)}):\n        pass\n\n${protocol.methods.map(method => `    def ${method.name}(self${method.parameters.length ? ', ' : ''}${parameters(method.parameters)}) -> ${types[method.returns]}:\n        raise NotImplementedError()`).join('\n\n')}`;
  const constructor = language === 'typescript' ? 'constructor' : protocol.className;
  const methods = protocol.methods.map(method => language === 'typescript'
    ? `  ${method.name}(${parameters(method.parameters)}): ${types[method.returns]} {\n    throw new Error("Not implemented");\n  }`
    : `  ${language === 'java' ? 'public ' : ''}${types[method.returns]} ${method.name}(${parameters(method.parameters)}) {\n    throw ${language === 'java' ? 'new UnsupportedOperationException' : 'runtime_error'}("Not implemented");\n  }`).join('\n');
  return `${comments}\nclass ${protocol.className} {\n${language === 'cpp' ? 'public:\n' : ''}  ${language === 'java' ? 'public ' : ''}${constructor}(${parameters(protocol.constructorParameters)}) {\n  }\n${methods}\n}${language === 'cpp' ? ';' : ''}`;
}
