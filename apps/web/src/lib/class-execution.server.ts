import 'server-only';
import type { ExecutionLanguage } from '@leetcode-app/domain';
import { isClassOperationTrace, type ClassOperationTrace, type ClassParameter, type StatefulClassProtocol } from './class-design';

type Helpers = {
  cppPreamble: string; javaPreamble: string; javaJson: string;
};

/** Fixed metadata controls dispatch. Only validated trace values enter generated programs. */
export function buildClassExecutionSource(input: {
  protocol: StatefulClassProtocol; language: ExecutionLanguage; source: string; cases: { args: unknown[] }[]; marker: string;
}, helpers: Helpers): string {
  const { protocol, language, source, marker } = input;
  const traces: ClassOperationTrace[] = input.cases.map(item => {
    if (item.args.length !== 1 || !isClassOperationTrace(protocol, item.args[0])) throw new Error('Invalid class operation trace');
    return item.args[0];
  });
  const problemId = JSON.stringify(protocol.activityId);
  const className = protocol.className;
  if (language === 'python') return `from __future__ import annotations
import json
${source}
__method_outputs = []
for __method_trace in json.loads(${JSON.stringify(JSON.stringify(traces))}):
    try:
        __method_instance = ${className}(*__method_trace["arguments"][0])
        __method_values = [None]
        for __method_name, __method_args in zip(__method_trace["operations"][1:], __method_trace["arguments"][1:]):
${protocol.methods.map((method, index) => `            ${index ? 'elif' : 'if'} __method_name == ${JSON.stringify(method.name)}:
                __method_value = __method_instance.${method.name}(*__method_args)
                __method_values.append(${method.returns === 'void' ? 'None' : '__method_value'})`).join('\n')}
        __method_outputs.append({"actual": json.loads(json.dumps(__method_values, allow_nan=False))})
    except Exception as __method_error:
        __method_outputs.append({"error": str(__method_error)[:160] or "Execution failed"})
print(${JSON.stringify(marker)} + json.dumps({"problemId": ${problemId}, "outputs": __method_outputs}, allow_nan=False))`;

  if (language === 'typescript') return `${source}
const __method_outputs = ${JSON.stringify(traces)}.map((trace) => {
  try {
    const Constructor = ${className} as unknown as new (...args: any[]) => any;
    const instance = new Constructor(...trace.arguments[0]);
    const values: unknown[] = [null];
    for (let i = 1; i < trace.operations.length; i++) {
${protocol.methods.map((method, index) => `      ${index ? 'else ' : ''}if (trace.operations[i] === ${JSON.stringify(method.name)}) {
        const actual = instance.${method.name}(...trace.arguments[i]);
        values.push(${method.returns === 'void' ? 'null' : 'actual'});
      }`).join('\n')}
    }
    const encoded = JSON.stringify(values, (_key, value) => {
      if ((typeof value === 'number' && !Number.isFinite(value)) || ['undefined', 'function', 'symbol', 'bigint'].includes(typeof value)) throw new Error('Return a JSON-compatible result');
      return value;
    });
    return { actual: JSON.parse(encoded) };
  } catch (error) { return { error: (error instanceof Error ? error.message : 'Execution failed').slice(0,160) }; }
});
console.log(${JSON.stringify(marker)} + JSON.stringify({ problemId: ${problemId}, outputs: __method_outputs }));`;

  // Operation numbers keep native-language traces compact even at the full Run limit.
  const operationNumber = (name: string) => name === className ? 0 : protocol.methods.findIndex(method => method.name === name) + 1;
  if (language === 'cpp') {
    const argument = (parameter: ClassParameter, index: number, row: string) => `get<${parameter.type === 'integer' ? 'int' : 'string'}>(${row}[${index}])`;
    const cases = traces.map(trace => `{${trace.operations.map((name, index) => `{${operationNumber(name)},{${trace.arguments[index].map(value => typeof value === 'string' ? `string(${JSON.stringify(value)})` : value).join(',')}}}`).join(',')}}`).join(',');
    return `${helpers.cppPreamble}
#include <variant>
#include <map>
#include <list>
${source}
int main() {
  using Arg = variant<int,string>;
  using Operation = pair<int,vector<Arg>>;
  vector<vector<Operation>> traces = {${cases}};
  vector<string> outputs;
  for (auto& trace : traces) {
    try {
      ${className} instance{${protocol.constructorParameters.map((parameter, index) => argument(parameter, index, 'trace[0].second')).join(',')}};
      string values = "[null";
      for (size_t i=1;i<trace.size();++i) {
        auto& args = trace[i].second;
        switch (trace[i].first) {
${protocol.methods.map((method, index) => `          case ${index + 1}: { ${method.returns === 'void' ? `instance.${method.name}(${method.parameters.map((parameter, argumentIndex) => argument(parameter, argumentIndex, 'args')).join(',')}); values += ",null";` : `auto actual = instance.${method.name}(${method.parameters.map((parameter, argumentIndex) => argument(parameter, argumentIndex, 'args')).join(',')}); values += "," + __method_json(actual);`} break; }`).join('\n')}
        }
      }
      outputs.push_back("{\\\"actual\\\":" + values + "]}");
    } catch (const exception& error) { outputs.push_back("{\\\"error\\\":" + __method_json(string(error.what()).substr(0,160)) + "}"); }
    catch (...) { outputs.push_back("{\\\"error\\\":\\\"Execution failed\\\"}"); }
  }
  cout << ${JSON.stringify(marker)} << "{\\\"problemId\\\":\\\"${protocol.activityId}\\\",\\\"outputs\\\":[";
  for (size_t i=0;i<outputs.size();++i) { if(i) cout << ','; cout << outputs[i]; }
  cout << "]}" << endl;
}`;
  }

  const imports: string[] = [];
  const learner = source.replace(/^\s*import\s+[^;]+;[ \t]*$/gm, value => { imports.push(value.trim()); return ''; });
  const argument = (parameter: ClassParameter, index: number, row: string) => `(${parameter.type === 'integer' ? 'Integer' : 'String'})${row}[${index + 1}]`;
  const cases = traces.map(trace => `new Object[][]{${trace.operations.map((name, index) => `new Object[]{${operationNumber(name)}${trace.arguments[index].map(value => `,${JSON.stringify(value)}`).join('')}}`).join(',')}}`).join(',');
  return `${imports.join('\n')}
${helpers.javaPreamble}
${learner}
public class Main {
${helpers.javaJson}
  public static void main(String[] argv) {
    Object[][][] traces = new Object[][][]{${cases}};
    List<String> outputs = new ArrayList<>();
    for (Object[][] trace : traces) {
      try {
        ${className} instance = new ${className}(${protocol.constructorParameters.map((parameter, index) => argument(parameter, index, 'trace[0]')).join(',')});
        List<Object> values = new ArrayList<>(); values.add(null);
        for (int i=1;i<trace.length;i++) {
          Object[] args = trace[i];
          switch ((Integer)args[0]) {
${protocol.methods.map((method, index) => `            case ${index + 1}: { ${method.returns === 'void' ? `instance.${method.name}(${method.parameters.map((parameter, argumentIndex) => argument(parameter, argumentIndex, 'args')).join(',')}); values.add(null);` : `values.add(instance.${method.name}(${method.parameters.map((parameter, argumentIndex) => argument(parameter, argumentIndex, 'args')).join(',')}));`} break; }`).join('\n')}
          }
        }
        outputs.add("{\\\"actual\\\":" + json(values) + "}");
      } catch (Throwable error) { outputs.add("{\\\"error\\\":" + json(error.getClass().getSimpleName()) + "}"); }
    }
    System.out.println(${JSON.stringify(marker)} + "{\\\"problemId\\\":\\\"${protocol.activityId}\\\",\\\"outputs\\\":[" + String.join(",",outputs) + "]}");
  }
}`;
}
