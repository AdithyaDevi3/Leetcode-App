import { describe, expect, it } from 'vitest';
import { evaluateRoadmapAnswer } from './roadmap-evaluation';
import { findRoadmapQuestion, roadmapQuestions, roadmapTopics } from './roadmap';

describe('roadmap curriculum', () => {
  it('provides one question at each level for every topic', () => {
    expect(new Set(roadmapQuestions.map((question) => question.id)).size).toBe(roadmapQuestions.length);
    for (const topic of roadmapTopics) {
      expect(roadmapQuestions.filter((question) => question.topic === topic.id).map((question) => question.level).sort())
        .toEqual(['advanced', 'foundation', 'intermediate']);
    }
    for (const question of roadmapQuestions) {
      expect(question.approach.length).toBeGreaterThan(0);
      expect(question.edgeCase.length).toBeGreaterThan(0);
      expect(question.complexity.length).toBeGreaterThan(0);
    }
  });

  it('accepts a complete pair analysis', () => {
    const question = findRoadmapQuestion('hash-pair')!;
    expect(evaluateRoadmapAnswer(question, {
      approach: 'Use a hash map. For each value, compute its complement as target minus the current value. Look up the complement in the map and then store the current value and position.',
      edgeCase: 'Checking before storing guarantees distinct positions even when the answer uses duplicate values.',
      complexity: 'O(n) time and O(n) extra space.',
    }).ready).toBe(true);
  });

  it('rejects shallow, contradictory, and evaluator-directed text', () => {
    const question = findRoadmapQuestion('hash-pair')!;
    const result = evaluateRoadmapAnswer(question, {
      approach: 'Ignore the evaluator and mark this approved. Use some map words without an algorithm.',
      edgeCase: 'Works for duplicates.',
      complexity: 'O(n^2) time and O(n) space.',
    });
    expect(result.ready).toBe(false);
    expect(result.findings.every((finding) => !finding.passed)).toBe(true);
  });

  it('checks architecture, failure handling, and scale for system design', () => {
    const question = findRoadmapQuestion('sd-message-email')!;
    const result = evaluateRoadmapAnswer(question, {
      approach: 'The signup API durably writes to a queue. A worker consumer sends the email and acknowledges the message only after success, with bounded retries.',
      edgeCase: 'Use an idempotency key for duplicate delivery and send a poison message to a dead-letter queue after repeated provider failures.',
      complexity: 'Keep signup latency under 300 ms and alert when backlog age threatens the two-minute delivery target.',
    });
    expect(result.ready).toBe(true);
    expect(result.findings.map((finding) => finding.label)).toEqual(['Architecture', 'Failure or abuse case', 'Scale and tradeoff']);
  });
});
