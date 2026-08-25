import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create hash-map content item
  pgm.sql(`
    INSERT INTO content_items (id, slug, type, status, difficulty, estimated_minutes, tags)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'hash-map-fundamentals',
      'problem',
      'published',
      'beginner',
      45,
      ARRAY['hash-map', 'data-structures', 'fundamentals']
    );
  `);

  // Create content version
  pgm.sql(`
    INSERT INTO content_versions (content_id, version, title, description, markdown_content, starter_code, solution_code, test_cases)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      1,
      'Hash Map Fundamentals',
      'Learn the fundamentals of hash maps through hands-on practice',
      '# Hash Map Fundamentals

## Learning Objectives
- Understand hash map data structure
- Learn about key-value pair storage
- Practice implementing basic hash map operations

## Problem Statement
Implement a function that uses a hash map to count the frequency of elements in an array.

### Example
\`\`\`
Input: [1, 2, 2, 3, 3, 3]
Output: {1: 1, 2: 2, 3: 3}
\`\`\`

### Constraints
- Array length: 1 ≤ n ≤ 10,000
- Element values: -10^6 ≤ value ≤ 10^6',
      'function countFrequency(arr: number[]): Record<number, number> {
  // TODO: Implement this function
  return {};
}',
      'function countFrequency(arr: number[]): Record<number, number> {
  const frequency: Record<number, number> = {};
  
  for (const num of arr) {
    frequency[num] = (frequency[num] || 0) + 1;
  }
  
  return frequency;
}',
      '[
        {
          "input": "[1, 2, 2, 3, 3, 3]",
          "expected": "{\"1\": 1, \"2\": 2, \"3\": 3}",
          "description": "Basic frequency count"
        },
        {
          "input": "[5, 5, 5, 5]",
          "expected": "{\"5\": 4}",
          "description": "All same elements"
        },
        {
          "input": "[1, 2, 3, 4, 5]",
          "expected": "{\"1\": 1, \"2\": 1, \"3\": 1, \"4\": 1, \"5\": 1}",
          "description": "All unique elements"
        }
      ]'::jsonb
    );
  `);

  // Create rubric version
  pgm.sql(`
    INSERT INTO rubric_versions (content_id, version, criteria)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      1,
      '{
        "correctness": {
          "weight": 40,
          "description": "Code produces correct results for all test cases"
        },
        "efficiency": {
          "weight": 20,
          "description": "Solution uses O(n) time complexity"
        },
        "code_quality": {
          "weight": 20,
          "description": "Code is clean, readable, and well-structured"
        },
        "understanding": {
          "weight": 20,
          "description": "Demonstrates understanding of hash map concepts"
        }
      }'::jsonb
    );
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DELETE FROM rubric_versions WHERE content_id = '00000000-0000-0000-0000-000000000001';
  `);
  pgm.sql(`
    DELETE FROM content_versions WHERE content_id = '00000000-0000-0000-0000-000000000001';
  `);
  pgm.sql(`
    DELETE FROM content_items WHERE id = '00000000-0000-0000-0000-000000000001';
  `);
}
