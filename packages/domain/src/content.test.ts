import { describe, it, expect } from 'vitest';
import {
  ContentItem,
  ContentVersion,
  RubricVersion,
  ContentBlock,
  RubricRule,
  CreateContentItemInput,
  CreateContentVersionInput,
  CreateRubricVersionInput,
} from './content';

describe('Content Domain Types', () => {
  describe('ContentItem', () => {
    it('should create a valid content item', () => {
      const item: ContentItem = {
        id: 'content_123',
        slug: 'two-sum',
        type: 'problem',
        title: 'Two Sum',
        description: 'Find two numbers that add up to a target',
        difficulty: 'easy',
        categories: ['array', 'hash-table'],
        supportedLanguages: ['typescript', 'python', 'java'],
        status: 'published',
        authorId: 'user_456',
        estimatedMinutes: 15,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        version: 1,
      };

      expect(item.id).toBe('content_123');
      expect(item.slug).toBe('two-sum');
      expect(item.type).toBe('problem');
      expect(item.difficulty).toBe('easy');
      expect(item.categories).toContain('array');
      expect(item.categories).toContain('hash-table');
    });

    it('should support optional currentVersionId and publishedAt', () => {
      const item: ContentItem = {
        id: 'content_123',
        slug: 'binary-search',
        type: 'lesson',
        title: 'Binary Search',
        description: 'Learn binary search algorithm',
        difficulty: 'medium',
        categories: ['searching', 'divide-and-conquer'],
        supportedLanguages: ['typescript', 'python'],
        currentVersionId: 'version_789',
        status: 'published',
        authorId: 'user_456',
        estimatedMinutes: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: new Date(),
        version: 2,
      };

      expect(item.currentVersionId).toBe('version_789');
      expect(item.publishedAt).toBeDefined();
    });
  });

  describe('ContentVersion', () => {
    it('should create a valid content version with blocks', () => {
      const block: ContentBlock = {
        id: 'block_1',
        type: 'text',
        content: '# Introduction\n\nThis is a lesson.',
        order: 1,
      };

      const version: ContentVersion = {
        id: 'version_123',
        contentItemId: 'content_456',
        versionNumber: 1,
        blocks: [block],
        rubricVersionId: 'rubric_789',
        authorId: 'user_123',
        createdAt: new Date(),
      };

      expect(version.id).toBe('version_123');
      expect(version.versionNumber).toBe(1);
      expect(version.blocks).toHaveLength(1);
      expect(version.blocks[0].type).toBe('text');
    });

    it('should support multiple block types', () => {
      const blocks: ContentBlock[] = [
        {
          id: 'block_1',
          type: 'text',
          content: 'Introduction text',
          order: 1,
        },
        {
          id: 'block_2',
          type: 'code',
          content: 'function example() {}',
          metadata: { language: 'typescript' },
          order: 2,
        },
        {
          id: 'block_3',
          type: 'hint',
          content: 'Try using a hash table',
          order: 3,
        },
      ];

      const version: ContentVersion = {
        id: 'version_123',
        contentItemId: 'content_456',
        versionNumber: 2,
        blocks,
        rubricVersionId: 'rubric_789',
        changeLog: 'Added code example and hint',
        authorId: 'user_123',
        createdAt: new Date(),
      };

      expect(version.blocks).toHaveLength(3);
      expect(version.blocks[1].type).toBe('code');
      expect(version.blocks[2].type).toBe('hint');
      expect(version.changeLog).toBeDefined();
    });
  });

  describe('RubricVersion', () => {
    it('should create a valid rubric version with rules', () => {
      const rule: RubricRule = {
        id: 'rule_1',
        type: 'contains-keyword',
        description: 'Must mention "hash table"',
        severity: 'error',
        config: { keyword: 'hash table' },
        pointsDeduction: 10,
        order: 1,
      };

      const rubric: RubricVersion = {
        id: 'rubric_123',
        contentItemId: 'content_456',
        versionNumber: 1,
        rules: [rule],
        passingThreshold: 70,
        maxScore: 100,
        authorId: 'user_789',
        createdAt: new Date(),
      };

      expect(rubric.id).toBe('rubric_123');
      expect(rubric.rules).toHaveLength(1);
      expect(rubric.passingThreshold).toBe(70);
      expect(rubric.maxScore).toBe(100);
    });

    it('should support multiple rules with different severities', () => {
      const rules: RubricRule[] = [
        {
          id: 'rule_1',
          type: 'structure-check',
          description: 'Must have initialization step',
          severity: 'error',
          config: { checkType: 'initialization' },
          pointsDeduction: 20,
          order: 1,
        },
        {
          id: 'rule_2',
          type: 'complexity-check',
          description: 'Should be O(n) time complexity',
          severity: 'warning',
          config: { maxComplexity: 'O(n)' },
          pointsDeduction: 10,
          order: 2,
        },
        {
          id: 'rule_3',
          type: 'completeness-check',
          description: 'Consider edge cases',
          severity: 'suggestion',
          config: { edgeCases: ['empty array', 'single element'] },
          order: 3,
        },
      ];

      const rubric: RubricVersion = {
        id: 'rubric_123',
        contentItemId: 'content_456',
        versionNumber: 2,
        rules,
        passingThreshold: 60,
        maxScore: 100,
        changeLog: 'Relaxed passing threshold',
        authorId: 'user_789',
        createdAt: new Date(),
      };

      expect(rubric.rules).toHaveLength(3);
      expect(rubric.rules[0].severity).toBe('error');
      expect(rubric.rules[1].severity).toBe('warning');
      expect(rubric.rules[2].severity).toBe('suggestion');
      expect(rubric.rules[2].pointsDeduction).toBeUndefined();
    });
  });

  describe('Helper Types', () => {
    it('CreateContentItemInput should omit generated fields', () => {
      const input: CreateContentItemInput = {
        slug: 'new-problem',
        type: 'problem',
        title: 'New Problem',
        description: 'A new problem',
        difficulty: 'medium',
        categories: ['tree'],
        supportedLanguages: ['python'],
        status: 'draft',
        authorId: 'user_123',
        estimatedMinutes: 20,
      };

      expect(input.slug).toBe('new-problem');
      // @ts-expect-error - id should not be present
      expect(input.id).toBeUndefined();
    });

    it('CreateContentVersionInput should omit auto-generated fields', () => {
      const input: CreateContentVersionInput = {
        contentItemId: 'content_123',
        blocks: [],
        rubricVersionId: 'rubric_456',
        authorId: 'user_789',
      };

      expect(input.contentItemId).toBe('content_123');
      // @ts-expect-error - versionNumber should not be present
      expect(input.versionNumber).toBeUndefined();
    });

    it('CreateRubricVersionInput should omit auto-generated fields', () => {
      const input: CreateRubricVersionInput = {
        contentItemId: 'content_123',
        rules: [],
        passingThreshold: 75,
        maxScore: 100,
        authorId: 'user_456',
      };

      expect(input.passingThreshold).toBe(75);
      // @ts-expect-error - versionNumber should not be present
      expect(input.versionNumber).toBeUndefined();
    });
  });
});
