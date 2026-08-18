import { describe, it, expect } from 'vitest';
import {
  PracticeSession,
  Attempt,
  PseudocodeRevision,
  SessionResumeState,
  CreatePracticeSessionInput,
  UpdatePracticeSessionInput,
  CreateAttemptInput,
  CreatePseudocodeRevisionInput,
} from './practice';

describe('Practice Domain Types', () => {
  describe('PracticeSession', () => {
    it('should create a valid practice session', () => {
      const session: PracticeSession = {
        id: 'session_123',
        userId: 'user_456',
        contentItemId: 'content_789',
        contentVersionId: 'version_101',
        stage: 'pseudocode',
        completionStatus: 'in-progress',
        codingLanguage: 'typescript',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        lastActivityAt: new Date('2024-01-01T10:30:00Z'),
        totalTimeSeconds: 1800,
        version: 1,
      };

      expect(session.id).toBe('session_123');
      expect(session.stage).toBe('pseudocode');
      expect(session.completionStatus).toBe('in-progress');
      expect(session.totalTimeSeconds).toBe(1800);
    });

    it('should support completed session state', () => {
      const session: PracticeSession = {
        id: 'session_123',
        userId: 'user_456',
        contentItemId: 'content_789',
        contentVersionId: 'version_101',
        stage: 'completed',
        completionStatus: 'fully-completed',
        codingLanguage: 'python',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        lastActivityAt: new Date('2024-01-01T12:00:00Z'),
        completedAt: new Date('2024-01-01T12:00:00Z'),
        totalTimeSeconds: 7200,
        version: 3,
      };

      expect(session.stage).toBe('completed');
      expect(session.completionStatus).toBe('fully-completed');
      expect(session.completedAt).toBeDefined();
    });

    it('should support all session stages', () => {
      const stages: PracticeSession['stage'][] = [
        'lesson',
        'pseudocode',
        'evaluation',
        'coding',
        'completed',
      ];

      stages.forEach((stage) => {
        const session: Partial<PracticeSession> = { stage };
        expect(session.stage).toBe(stage);
      });
    });
  });

  describe('Attempt', () => {
    it('should create a valid attempt', () => {
      const attempt: Attempt = {
        id: 'attempt_123',
        practiceSessionId: 'session_456',
        attemptNumber: 1,
        rubricVersionId: 'rubric_789',
        finalRevisionId: 'revision_101',
        passed: false,
        score: 65,
        unlockedCoding: false,
        createdAt: new Date(),
      };

      expect(attempt.id).toBe('attempt_123');
      expect(attempt.attemptNumber).toBe(1);
      expect(attempt.passed).toBe(false);
      expect(attempt.score).toBe(65);
      expect(attempt.unlockedCoding).toBe(false);
    });

    it('should support passing attempt that unlocks coding', () => {
      const attempt: Attempt = {
        id: 'attempt_456',
        practiceSessionId: 'session_789',
        attemptNumber: 2,
        rubricVersionId: 'rubric_101',
        finalRevisionId: 'revision_202',
        passed: true,
        score: 85,
        unlockedCoding: true,
        createdAt: new Date(),
      };

      expect(attempt.passed).toBe(true);
      expect(attempt.score).toBe(85);
      expect(attempt.unlockedCoding).toBe(true);
    });
  });

  describe('PseudocodeRevision', () => {
    it('should create a valid text revision', () => {
      const revision: PseudocodeRevision = {
        id: 'revision_123',
        practiceSessionId: 'session_456',
        revisionNumber: 1,
        editMode: 'text',
        content: '1. Initialize empty hash table\n2. Iterate through array',
        idempotencyKey: 'idem_abc123',
        isAutoSave: false,
        createdAt: new Date(),
      };

      expect(revision.id).toBe('revision_123');
      expect(revision.revisionNumber).toBe(1);
      expect(revision.editMode).toBe('text');
      expect(revision.isAutoSave).toBe(false);
    });

    it('should support block mode with JSON content', () => {
      const blocks = JSON.stringify([
        { type: 'step', content: 'Initialize variables' },
        { type: 'loop', content: 'For each element' },
      ]);

      const revision: PseudocodeRevision = {
        id: 'revision_456',
        practiceSessionId: 'session_789',
        revisionNumber: 3,
        editMode: 'blocks',
        content: blocks,
        idempotencyKey: 'idem_def456',
        isAutoSave: true,
        createdAt: new Date(),
      };

      expect(revision.editMode).toBe('blocks');
      expect(revision.isAutoSave).toBe(true);
      expect(() => JSON.parse(revision.content)).not.toThrow();
    });
  });

  describe('SessionResumeState', () => {
    it('should create a valid resume state', () => {
      const session: PracticeSession = {
        id: 'session_123',
        userId: 'user_456',
        contentItemId: 'content_789',
        contentVersionId: 'version_101',
        stage: 'pseudocode',
        completionStatus: 'in-progress',
        codingLanguage: 'typescript',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        totalTimeSeconds: 600,
        version: 1,
      };

      const revision: PseudocodeRevision = {
        id: 'revision_999',
        practiceSessionId: 'session_123',
        revisionNumber: 2,
        editMode: 'text',
        content: 'Draft pseudocode',
        idempotencyKey: 'idem_xyz',
        isAutoSave: true,
        createdAt: new Date(),
      };

      const attempts: Attempt[] = [];

      const resumeState: SessionResumeState = {
        session,
        latestRevision: revision,
        attempts,
      };

      expect(resumeState.session.id).toBe('session_123');
      expect(resumeState.latestRevision?.revisionNumber).toBe(2);
      expect(resumeState.attempts).toHaveLength(0);
    });
  });

  describe('Helper Types', () => {
    it('CreatePracticeSessionInput should omit generated fields', () => {
      const input: CreatePracticeSessionInput = {
        userId: 'user_123',
        contentItemId: 'content_456',
        contentVersionId: 'version_789',
        stage: 'lesson',
        completionStatus: 'in-progress',
        codingLanguage: 'python',
      };

      expect(input.userId).toBe('user_123');
      expect(input.codingLanguage).toBe('python');
      // @ts-expect-error - startedAt should not be present
      expect(input.startedAt).toBeUndefined();
    });

    it('UpdatePracticeSessionInput should be partial with required id and version', () => {
      const update: UpdatePracticeSessionInput = {
        id: 'session_123',
        version: 1,
        stage: 'evaluation',
        lastActivityAt: new Date(),
        totalTimeSeconds: 900,
      };

      expect(update.id).toBe('session_123');
      expect(update.version).toBe(1);
      expect(update.stage).toBe('evaluation');
    });

    it('CreateAttemptInput should omit auto-generated fields', () => {
      const input: CreateAttemptInput = {
        practiceSessionId: 'session_123',
        attemptNumber: 1,
        rubricVersionId: 'rubric_456',
        finalRevisionId: 'revision_789',
        passed: true,
        score: 90,
        unlockedCoding: true,
      };

      expect(input.attemptNumber).toBe(1);
      expect(input.passed).toBe(true);
      // @ts-expect-error - createdAt should not be present
      expect(input.createdAt).toBeUndefined();
    });

    it('CreatePseudocodeRevisionInput should omit auto-generated fields', () => {
      const input: CreatePseudocodeRevisionInput = {
        practiceSessionId: 'session_123',
        editMode: 'text',
        content: 'New pseudocode',
        idempotencyKey: 'idem_abc',
        isAutoSave: false,
      };

      expect(input.practiceSessionId).toBe('session_123');
      expect(input.editMode).toBe('text');
      // @ts-expect-error - revisionNumber should not be present
      expect(input.revisionNumber).toBeUndefined();
    });
  });
});
