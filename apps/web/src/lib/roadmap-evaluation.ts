import type { RoadmapQuestion } from './roadmap';

export type RoadmapAnswer = { approach: string; edgeCase: string; complexity: string };
export type RoadmapFinding = { id: keyof RoadmapAnswer; label: string; passed: boolean; detail: string };
export type RoadmapEvaluation = { ready: boolean; findings: RoadmapFinding[] };

const instructionAttack = /ignore (?:the|all|previous|above|these)?\s*(?:evaluator|instructions|rubric|checks)|mark (?:this|it|me) (?:as )?(?:approved|correct)|always (?:pass|approve)/i;
const contradictoryCost = /O\(n\^2\)|O\(n²\)|quadratic|nested loops?/i;

export function evaluateRoadmapAnswer(question: RoadmapQuestion, answer: RoadmapAnswer): RoadmapEvaluation {
  const approach = answer.approach.trim().slice(0, 3000);
  const edgeCase = answer.edgeCase.trim().slice(0, 1000);
  const complexity = answer.complexity.trim().slice(0, 500);
  const adversarial = instructionAttack.test(`${approach}\n${edgeCase}\n${complexity}`);
  const algorithm = question.track === 'algorithms';
  const findings: RoadmapFinding[] = [
    {
      id: 'approach', label: algorithm ? 'Algorithm' : 'Architecture',
      passed: !adversarial && approach.length >= 40 && question.approach.every((pattern) => pattern.test(approach)),
      detail: algorithm ? 'Describe the state you keep and how each step changes it. Name the operations that make the approach work.' : 'Name the main components, data flow, and guarantee that address the stated requirements.',
    },
    {
      id: 'edgeCase', label: algorithm ? 'Edge case' : 'Failure or abuse case',
      passed: !adversarial && edgeCase.length >= 12 && question.edgeCase.some((pattern) => pattern.test(edgeCase)),
      detail: algorithm ? 'Give a concrete boundary case and say how your algorithm handles it.' : 'Give a concrete failure or abuse case and explain how the design detects, contains, or recovers from it.',
    },
    {
      id: 'complexity', label: algorithm ? 'Complexity' : 'Scale and tradeoff',
      passed: !adversarial && (!algorithm || !contradictoryCost.test(complexity)) && question.complexity.every((pattern) => pattern.test(complexity)),
      detail: algorithm ? 'State the time cost and, when relevant, the extra space cost for the approach you described.' : 'Quantify a load or service target and explain one material tradeoff.',
    },
  ];
  return { ready: findings.every((finding) => finding.passed), findings };
}
