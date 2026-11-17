import type { OriginalCodingQuestion } from '@leetcode-app/domain';
import type { CodingLanguage } from '@/lib/practice-session';

type Parameter = Readonly<{ name: string; type: string }>;

function splitParameters(signature: string): string[] {
  const values: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < signature.length; index += 1) {
    const character = signature[index];
    if ('([{<'.includes(character)) depth += 1;
    if (')]}>'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) {
      values.push(signature.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(signature.slice(start).trim());
  return values.filter(Boolean);
}

function parseParameters(signature: string): readonly Parameter[] {
  return splitParameters(signature).map((parameter) => {
    const separator = parameter.indexOf(':');
    if (separator < 1) throw new Error('The coding-question function signature is invalid.');
    return Object.freeze({
      name: parameter.slice(0, separator).trim(),
      type: parameter.slice(separator + 1).trim(),
    });
  });
}

function snakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function typescriptStarter(question: OriginalCodingQuestion): string {
  return `function ${question.functionName}(${question.functionSignature}) {
  // Write your solution here.
  throw new Error('Not implemented');
}`;
}

function pythonStarter(question: OriginalCodingQuestion, parameters: readonly Parameter[]): string {
  const signature = parameters.map(parameter => parameter.name).join(', ');
  return `def ${snakeCase(question.functionName)}(${signature}):
    # Contract: ${question.functionName}(${question.functionSignature})
    # Write your solution here.
    raise NotImplementedError`;
}

function cppStarter(question: OriginalCodingQuestion, parameters: readonly Parameter[]): string {
  const signature = parameters.map(parameter => `auto ${parameter.name}`).join(', ');
  return `auto ${question.functionName}(${signature}) {
  // Contract: ${question.functionName}(${question.functionSignature})
  // Write your solution here.
  throw runtime_error("Not implemented");
}`;
}

function javaStarter(question: OriginalCodingQuestion, parameters: readonly Parameter[]): string {
  const signature = parameters.map(parameter => `Object ${parameter.name}`).join(', ');
  return `class Solution {
    public Object ${question.functionName}(${signature}) {
        // Contract: ${question.functionName}(${question.functionSignature})
        // Write your solution here.
        throw new UnsupportedOperationException("Not implemented");
    }
}`;
}

/** Create learner-visible starter code. Server checks are intentionally separate. */
export function createOriginalCodingStarter(
  question: OriginalCodingQuestion,
  language: CodingLanguage,
): string {
  const parameters = parseParameters(question.functionSignature);
  if (language === 'python') return pythonStarter(question, parameters);
  if (language === 'cpp') return cppStarter(question, parameters);
  if (language === 'java') return javaStarter(question, parameters);
  return typescriptStarter(question);
}
