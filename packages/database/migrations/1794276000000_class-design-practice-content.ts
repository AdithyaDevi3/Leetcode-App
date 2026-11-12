import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/** Register the original stateful exercises for durable practice and assignment
 * foreign keys. Private execution suites remain server-only application code.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO content_items (id, slug, type, status, difficulty, estimated_minutes, tags)
    VALUES
      ('20000000-0000-0000-0000-000000000011', 'lru-cache-v1', 'problem', 'published', 'intermediate', 40, ARRAY['class-design', 'hash-map', 'linked-list', 'original']),
      ('20000000-0000-0000-0000-000000000012', 'session-manager-v1', 'problem', 'published', 'intermediate', 45, ARRAY['class-design', 'state', 'expiry', 'original']),
      ('20000000-0000-0000-0000-000000000013', 'order-book-v1', 'problem', 'published', 'advanced', 50, ARRAY['class-design', 'ordered-map', 'aggregation', 'original'])
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO content_versions
      (id, content_id, version, title, description, markdown_content, starter_code, solution_code, test_cases)
    VALUES
      ('21000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011', 1,
       'LRU Cache', 'Design a bounded least-recently-used cache.',
       'Implement the linked class-design activity and explain the state invariants that make get and put efficient.',
       NULL, NULL, '[]'::jsonb),
      ('21000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000012', 1,
       'Session Manager', 'Design a logical-time session manager with renewal, revocation and expiry.',
       'Implement the linked class-design activity and explain how expiry boundaries prevent inactive sessions from returning.',
       NULL, NULL, '[]'::jsonb),
      ('21000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000013', 1,
       'Order Book', 'Design an aggregated price-level order book without trade matching.',
       'Implement the linked class-design activity and explain the per-order and per-price invariants used by add, cancel, best and volume.',
       NULL, NULL, '[]'::jsonb)
    ON CONFLICT (content_id, version) DO NOTHING;

    DO $migration$
    BEGIN
      IF (SELECT count(*) FROM content_items
          WHERE (id, slug, type::text, status::text) IN (
            ('20000000-0000-0000-0000-000000000011'::uuid, 'lru-cache-v1', 'problem', 'published'),
            ('20000000-0000-0000-0000-000000000012'::uuid, 'session-manager-v1', 'problem', 'published'),
            ('20000000-0000-0000-0000-000000000013'::uuid, 'order-book-v1', 'problem', 'published')
          )) <> 3 THEN
        RAISE EXCEPTION 'Class-design content identifiers conflict with existing content';
      END IF;
      IF (SELECT count(*) FROM content_versions
          WHERE (id, content_id, version) IN (
            ('21000000-0000-0000-0000-000000000011'::uuid, '20000000-0000-0000-0000-000000000011'::uuid, 1),
            ('21000000-0000-0000-0000-000000000012'::uuid, '20000000-0000-0000-0000-000000000012'::uuid, 1),
            ('21000000-0000-0000-0000-000000000013'::uuid, '20000000-0000-0000-0000-000000000013'::uuid, 1)
          )) <> 3 THEN
        RAISE EXCEPTION 'Class-design content versions conflict with existing content';
      END IF;
    END $migration$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $migration$
    BEGIN
      -- FOR UPDATE conflicts with the KEY SHARE lock taken by concurrent foreign
      -- key inserts, closing the check/delete race before any cascades can run.
      PERFORM 1 FROM content_items WHERE id IN (
        '20000000-0000-0000-0000-000000000011',
        '20000000-0000-0000-0000-000000000012',
        '20000000-0000-0000-0000-000000000013'
      ) FOR UPDATE;
      IF EXISTS (
        SELECT 1 FROM content_versions
        WHERE content_id IN (
          '20000000-0000-0000-0000-000000000011',
          '20000000-0000-0000-0000-000000000012',
          '20000000-0000-0000-0000-000000000013'
        ) AND id NOT IN (
          '21000000-0000-0000-0000-000000000011',
          '21000000-0000-0000-0000-000000000012',
          '21000000-0000-0000-0000-000000000013'
        )
      ) THEN
        RAISE EXCEPTION 'Cannot remove class-design content after additional versions exist';
      END IF;
      IF EXISTS (
        SELECT 1 FROM practice_sessions WHERE content_id IN (
          '20000000-0000-0000-0000-000000000011',
          '20000000-0000-0000-0000-000000000012',
          '20000000-0000-0000-0000-000000000013'
        )
        UNION ALL SELECT 1 FROM class_assignments WHERE content_id IN (
          '20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000013'
        )
        UNION ALL SELECT 1 FROM learner_notes WHERE content_id IN (
          '20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000013'
        )
        UNION ALL SELECT 1 FROM learner_bookmarks WHERE content_id IN (
          '20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000013'
        )
        UNION ALL SELECT 1 FROM curriculum_track_items WHERE content_id IN (
          '20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000013'
        )
        UNION ALL SELECT 1 FROM content_concepts WHERE content_id IN (
          '20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000013'
        )
        UNION ALL SELECT 1 FROM rubric_versions WHERE content_id IN (
          '20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000013'
        )
        UNION ALL SELECT 1 FROM learning_recommendation_selections WHERE content_id IN (
          '20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000013'
        )
      ) THEN
        RAISE EXCEPTION 'Cannot remove class-design content after dependent work exists';
      END IF;
    END $migration$;

    DELETE FROM content_versions WHERE id IN (
      '21000000-0000-0000-0000-000000000011',
      '21000000-0000-0000-0000-000000000012',
      '21000000-0000-0000-0000-000000000013'
    );
    DELETE FROM content_items WHERE id IN (
      '20000000-0000-0000-0000-000000000011',
      '20000000-0000-0000-0000-000000000012',
      '20000000-0000-0000-0000-000000000013'
    );
  `);
}
