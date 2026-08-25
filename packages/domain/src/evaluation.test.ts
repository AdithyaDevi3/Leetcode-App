import { describe, it, expect } from 'vitest';
import {
  Evaluation,
  EvaluationFinding,
  EvaluationSummary,
  UserEvaluationStats,
  CreateEvaluationInput,
  UpdateEvaluationInput,
  CreateEvaluationFindingInput,
} from './evaluation';

describe('Evaluation Domain Types', () => {
  describe('Evaluation', () => {
    it('should create a valid pending evaluation', () => {
      const evaluation: Evaluation = {
        id: 'eval_123',
        practiceSessionId: 'session_456',
        attemptId: 'attempt_789',
        revisionId: 'revision_101',
        rubricVersionId: 'rubric_202',
        status: 'pending',
        passed: false,
        score: 0,
        pointsEarned: 0,
        maxPoints: 100,
        startedAt: new Date(),
        version: 1,
      };

      expect(evaluation.id).toBe('eval_123');
      expect(evaluation.status).toBe('pending');
      expect(evaluation.passed).toBe(false);
      expect(evaluation.score).toBe(0);
    });

    it('should support completed evaluation', () => {
      const startedAt = new Date('2024-01-01T10:00:00Z');
      const completedAt = new Date('2024-01-01T10:00:02.500Z');

      const evaluation: Evaluation = {
        id: 'eval_456',
        practiceSessionId: 'session_789',
        attemptId: 'attempt_101',
        revisionId: 'revision_202',
        rubricVersionId: 'rubric_303',
        status: 'completed',
        passed: true,
        score: 85,
        pointsEarned: 85,
        maxPoints: 100,
        startedAt,
        completedAt,
        durationMs: 2500,
        version: 2,
      };

      expect(evaluation.status).toBe('completed');
      expect(evaluation.passed).toBe(true);
      expect(evaluation.score).toBe(85);
      expect(evaluation.completedAt).toBeDefined();
      expect(evaluation.durationMs).toBe(2500);
    });

    it('should support failed evaluation with error', () => {
      const evaluation: Evaluation = {
        id: 'eval_789',
        practiceSessionId: 'session_101',
        attemptId: 'attempt_202',
        revisionId: 'revision_303',
        rubricVersionId: 'rubric_404',
        status: 'failed',
        passed: false,
        score: 0,
        pointsEarned: 0,
        maxPoints: 100,
        startedAt: new Date(),
        errorMessage: 'Rubric evaluation service unavailable',
        version: 1,
      };

      expect(evaluation.status).toBe('failed');
      expect(evaluation.errorMessage).toBe('Rubric evaluation service unavailable');
    });
  });

  describe('EvaluationFinding', () => {
    it('should create a finding for a passed rule', () => {
      const finding: EvaluationFinding = {
        id: 'finding_123',
        evaluationId: 'eval_456',
        ruleId: 'rule_789',
        ruleType: 'contains-keyword',
        severity: 'error',
        passed: true,
        message: 'Required keyword "hash table" found',
        pointsDeducted: 0,
        createdAt: new Date(),
      };

      expect(finding.id).toBe('finding_123');
      expect(finding.passed).toBe(true);
      expect(finding.pointsDeducted).toBe(0);
    });

    it('should create a finding for a failed rule with deduction', () => {
      const finding: EvaluationFinding = {
        id: 'finding_456',
        evaluationId: 'eval_789',
        ruleId: 'rule_101',
        ruleType: 'structure-check',
        severity: 'error',
        passed: false,
        message: 'Missing initialization step',
        explanation: 'Your pseudocode should start with variable initialization',
        lineNumber: 1,
        pointsDeducted: 15,
        createdAt: new Date(),
      };

      expect(finding.passed).toBe(false);
      expect(finding.severity).toBe('error');
      expect(finding.pointsDeducted).toBe(15);
      expect(finding.explanation).toBeDefined();
      expect(finding.lineNumber).toBe(1);
    });

    it('should support all severity levels', () => {
      const errorFinding: EvaluationFinding = {
        id: 'finding_1',
        evaluationId: 'eval_123',
        ruleId: 'rule_1',
        ruleType: 'structure-check',
        severity: 'error',
        passed: false,
        message: 'Critical error',
        pointsDeducted: 20,
        createdAt: new Date(),
      };

      const warningFinding: EvaluationFinding = {
        id: 'finding_2',
        evaluationId: 'eval_123',
        ruleId: 'rule_2',
        ruleType: 'complexity-check',
        severity: 'warning',
        passed: false,
        message: 'Suboptimal complexity',
        pointsDeducted: 10,
        createdAt: new Date(),
      };

      const suggestionFinding: EvaluationFinding = {
        id: 'finding_3',
        evaluationId: 'eval_123',
        ruleId: 'rule_3',
        ruleType: 'completeness-check',
        severity: 'suggestion',
        passed: false,
        message: 'Consider edge cases',
        pointsDeducted: 0,
        createdAt: new Date(),
      };

      expect(errorFinding.severity).toBe('error');
      expect(warningFinding.severity).toBe('warning');
      expect(suggestionFinding.severity).toBe('suggestion');
    });
  });

  describe('EvaluationSummary', () => {
    it('should create a complete evaluation summary', () => {
      const evaluation: Evaluation = {
        id: 'eval_123',
        practiceSessionId: 'session_456',
        attemptId: 'attempt_789',
        revisionId: 'revision_101',
        rubricVersionId: 'rubric_202',
        status: 'completed',
        passed: false,
        score: 65,
        pointsEarned: 65,
        maxPoints: 100,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 1500,
        version: 1,
      };

      const findings: EvaluationFinding[] = [
        {
          id: 'finding_1',
          evaluationId: 'eval_123',
          ruleId: 'rule_1',
          ruleType: 'structure-check',
          severity: 'error',
          passed: false,
          message: 'Error',
          pointsDeducted: 20,
          createdAt: new Date(),
        },
        {
          id: 'finding_2',
          evaluationId: 'eval_123',
          ruleId: 'rule_2',
          ruleType: 'complexity-check',
          severity: 'warning',
          passed: false,
          message: 'Warning',
          pointsDeducted: 10,
          createdAt: new Date(),
        },
        {
          id: 'finding_3',
          evaluationId: 'eval_123',
          ruleId: 'rule_3',
          ruleType: 'contains-keyword',
          severity: 'suggestion',
          passed: false,
          message: 'Suggestion',
          pointsDeducted: 5,
          createdAt: new Date(),
        },
        {
          id: 'finding_4',
          evaluationId: 'eval_123',
          ruleId: 'rule_4',
          ruleType: 'contains-keyword',
          severity: 'error',
          passed: true,
          message: 'Passed',
          pointsDeducted: 0,
          createdAt: new Date(),
        },
      ];

      const summary: EvaluationSummary = {
        evaluation,
        findings,
        passedCount: 1,
        failedCount: 3,
        errorCount: 1,
        warningCount: 1,
        suggestionCount: 1,
      };

      expect(summary.evaluation.id).toBe('eval_123');
      expect(summary.findings).toHaveLength(4);
      expect(summary.passedCount).toBe(1);
      expect(summary.failedCount).toBe(3);
      expect(summary.errorCount).toBe(1);
      expect(summary.warningCount).toBe(1);
      expect(summary.suggestionCount).toBe(1);
    });
  });

  describe('UserEvaluationStats', () => {
    it('should create valid user evaluation statistics', () => {
      const stats: UserEvaluationStats = {
        userId: 'user_123',
        totalEvaluations: 50,
        passedEvaluations: 35,
        failedEvaluations: 15,
        averageScore: 78.5,
        averageDurationMs: 2250,
        firstEvaluationAt: new Date('2024-01-01T00:00:00Z'),
        lastEvaluationAt: new Date('2024-03-15T10:30:00Z'),
      };

      expect(stats.userId).toBe('user_123');
      expect(stats.totalEvaluations).toBe(50);
      expect(stats.passedEvaluations).toBe(35);
      expect(stats.failedEvaluations).toBe(15);
      expect(stats.averageScore).toBe(78.5);
      expect(stats.firstEvaluationAt).toBeDefined();
      expect(stats.lastEvaluationAt).toBeDefined();
    });
  });

  describe('Helper Types', () => {
    it('CreateEvaluationInput should omit auto-generated fields', () => {
      const input: CreateEvaluationInput = {
        practiceSessionId: 'session_123',
        attemptId: 'attempt_456',
        revisionId: 'revision_789',
        rubricVersionId: 'rubric_101',
        maxPoints: 100,
      };

      expect(input.practiceSessionId).toBe('session_123');
      expect(input.maxPoints).toBe(100);
      // @ts-expect-error - status should not be present
      expect(input.status).toBeUndefined();
      // @ts-expect-error - score should not be present
      expect(input.score).toBeUndefined();
    });

    it('UpdateEvaluationInput should be partial with required id and version', () => {
      const update: UpdateEvaluationInput = {
        id: 'eval_123',
        version: 1,
        status: 'completed',
        passed: true,
        score: 90,
        pointsEarned: 90,
        completedAt: new Date(),
        durationMs: 3000,
      };

      expect(update.id).toBe('eval_123');
      expect(update.version).toBe(1);
      expect(update.status).toBe('completed');
      expect(update.passed).toBe(true);
    });

    it('CreateEvaluationFindingInput should omit auto-generated fields', () => {
      const input: CreateEvaluationFindingInput = {
        evaluationId: 'eval_123',
        ruleId: 'rule_456',
        ruleType: 'contains-keyword',
        severity: 'error',
        passed: false,
        message: 'Keyword not found',
        pointsDeducted: 10,
      };

      expect(input.evaluationId).toBe('eval_123');
      expect(input.passed).toBe(false);
      // @ts-expect-error - createdAt should not be present
      expect(input.createdAt).toBeUndefined();
    });
  });
});
