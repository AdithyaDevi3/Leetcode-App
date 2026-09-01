import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * The first authored curriculum set. Every prompt, example, hint, and
 * walkthrough in this migration is original to LeetBot; it is not imported
 * or adapted from third-party interview-prep sites.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('curriculum_tracks', {
    id: { type: 'varchar(80)', primaryKey: true },
    title: { type: 'varchar(160)', notNull: true },
    description: { type: 'text', notNull: true },
    position: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('curriculum_track_items', {
    track_id: { type: 'varchar(80)', notNull: true, references: 'curriculum_tracks(id)', onDelete: 'CASCADE' },
    content_id: { type: 'uuid', notNull: true, references: 'content_items(id)', onDelete: 'CASCADE' },
    position: { type: 'integer', notNull: true },
    required: { type: 'boolean', notNull: true, default: true },
  }, { constraints: { primaryKey: ['track_id', 'content_id'] } });
  pgm.createIndex('curriculum_track_items', ['track_id', 'position'], { unique: true });

  pgm.createTable('content_concepts', {
    content_id: { type: 'uuid', notNull: true, references: 'content_items(id)', onDelete: 'CASCADE' },
    concept_id: { type: 'varchar(255)', notNull: true },
    position: { type: 'integer', notNull: true, default: 0 },
  }, { constraints: { primaryKey: ['content_id', 'concept_id'] } });
  pgm.createIndex('content_concepts', ['concept_id']);

  // These tables are intentionally server-accessed through DATABASE_URL. RLS
  // prevents accidental exposure through Supabase's public Data API.
  pgm.sql('ALTER TABLE curriculum_tracks ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE curriculum_track_items ENABLE ROW LEVEL SECURITY');
  pgm.sql('ALTER TABLE content_concepts ENABLE ROW LEVEL SECURITY');

  pgm.sql(`
    INSERT INTO curriculum_tracks (id, title, description, position) VALUES
      ('algorithm-patterns-foundation', 'Algorithm patterns: foundations', 'Learn to turn observations into a simple invariant before writing code.', 1),
      ('system-design-foundation', 'System design: foundations', 'Practice making explicit trade-offs from requirements, load shape, and failure modes.', 2);

    INSERT INTO content_items (id, slug, type, status, difficulty, estimated_minutes, tags) VALUES
      ('10000000-0000-0000-0000-000000000001', 'frequency-ledger', 'problem', 'published', 'beginner', 35, ARRAY['algorithms', 'hash-map', 'counting', 'original']),
      ('10000000-0000-0000-0000-000000000002', 'bounded-variety-streak', 'problem', 'published', 'intermediate', 45, ARRAY['algorithms', 'sliding-window', 'two-pointers', 'original']),
      ('10000000-0000-0000-0000-000000000003', 'study-room-notification-digest', 'problem', 'published', 'intermediate', 50, ARRAY['system-design', 'queues', 'reliability', 'original']);

    INSERT INTO content_versions (content_id, version, title, description, markdown_content, starter_code, solution_code, test_cases) VALUES
      (
        '10000000-0000-0000-0000-000000000001', 1,
        'Frequency Ledger',
        'Build a summary of event labels and explain why each update is constant-time on average.',
        $content$
# Frequency Ledger

## Scenario
An internal study tool records a stream of event labels such as \`opened\`, \`hint\`, and \`submitted\`. Write a function that returns how many times each label appears. Labels are case-sensitive strings; return an empty object for an empty input.

## Before you code
The output needs one independent running total per distinct label. Ask: *what single piece of state lets me update that total the moment I see an event?* A key-value lookup is a direct fit: label → count.

## Thought process
1. State the invariant: after processing the first \`i\` events, the ledger contains the exact count for every label in that prefix.
2. For the next label, read its current count (zero if absent), then write back one more.
3. The invariant now holds for the longer prefix; after the final event, it describes the full input.

## Hints
- Start with an empty record, not an array.
- Treat a missing key as count zero.
- A second pass is unnecessary because the answer is complete after the first pass.

## Complexity
Time is O(n) for n events. Space is O(d), where d is the number of distinct labels.

## Reflection
Name the invariant in one sentence before submitting. If you cannot name it, pause before adding more code.
$content$,
        $code$function buildFrequencyLedger(events: string[]): Record<string, number> {
  // Return the count for each event label.
  return {};
}$code$,
        $solution$function buildFrequencyLedger(events: string[]): Record<string, number> {
  const ledger: Record<string, number> = {};
  for (const event of events) ledger[event] = (ledger[event] ?? 0) + 1;
  return ledger;
}$solution$,
        jsonb_build_array(
          jsonb_build_object('input', '["opened", "hint", "opened"]', 'expected', '{"opened":2,"hint":1}', 'description', 'Counts repeated labels'),
          jsonb_build_object('input', '[]', 'expected', '{}', 'description', 'Handles no events')
        )
      ),
      (
        '10000000-0000-0000-0000-000000000002', 1,
        'Bounded-Variety Streak',
        'Find the longest consecutive activity streak containing no more than a chosen number of categories.',
        $content$
# Bounded-Variety Streak

## Scenario
Given an array of activity categories and an integer \`limit\`, return the length of the longest consecutive segment containing at most \`limit\` distinct categories. A category may appear more than once. If \`limit\` is zero or the activity list is empty, return zero.

## Before you code
You are optimizing a **contiguous** segment, and validity can change one item at a time. That is a strong clue for a moving window. The window needs to remember category counts, not merely which categories appeared: removing one occurrence should not remove a category that is still present.

## Thought process
1. Expand the right edge and increment that category count.
2. If there are too many distinct categories, advance the left edge until the window is valid again, decrementing counts as you go.
3. At every valid point, compare the window length with the best length found so far.

## Hints
- The count map makes the number of distinct categories available as \`map.size\`.
- Delete a key only when its count becomes zero.
- Each index moves forward at most once, so nested loops here are still linear overall.

## Complexity
Time is O(n); the left and right pointers never move backward. Space is O(k), where k is the number of categories represented in the current window.

## Reflection
Explain what condition makes the window valid and why shrinking restores it.
$content$,
        $code$function longestBoundedVarietyStreak(categories: string[], limit: number): number {
  return 0;
}$code$,
        $solution$function longestBoundedVarietyStreak(categories: string[], limit: number): number {
  if (limit <= 0) return 0;
  const counts = new Map<string, number>();
  let left = 0;
  let best = 0;
  for (let right = 0; right < categories.length; right += 1) {
    counts.set(categories[right], (counts.get(categories[right]) ?? 0) + 1);
    while (counts.size > limit) {
      const category = categories[left++];
      const next = (counts.get(category) ?? 1) - 1;
      if (next === 0) counts.delete(category); else counts.set(category, next);
    }
    best = Math.max(best, right - left + 1);
  }
  return best;
}$solution$,
        jsonb_build_array(
          jsonb_build_object('input', '(["read","solve","read","review","solve"], 2)', 'expected', '4', 'description', 'A four-event streak uses only two categories'),
          jsonb_build_object('input', '(["read","solve"], 0)', 'expected', '0', 'description', 'A zero limit accepts no window')
        )
      ),
      (
        '10000000-0000-0000-0000-000000000003', 1,
        'Study Room Notification Digest',
        'Design an original notification-digest service for collaborative study rooms, with explicit reliability trade-offs.',
        $content$
# Study Room Notification Digest

## Scenario
Design a service that turns study-room events (new message, mentor note, session reminder) into a digest for each learner. A learner should receive at most one digest every 30 minutes, may mute a room, and must not receive the same event twice. The first version serves 20,000 daily active learners; delivery may be delayed by a few minutes, but losing an accepted event is not acceptable.

## Thought process
Start with questions, not boxes:
1. What is the write path? Events arrive quickly and independently, so accept them durably before asynchronous processing.
2. What is the read/delivery boundary? Group events by learner and delivery window, then materialize one digest candidate per window.
3. What can repeat? Producers, queues, and delivery providers can retry. Give every event a stable idempotency key and record successful sends.
4. What fails? A provider timeout must not silently discard work; retry with backoff and expose a dead-letter path for investigation.

## A reasonable first design
- An API validates and stores an event with an event ID.
- A queue decouples event acceptance from digest assembly.
- A digest worker checks preferences and appends the event to the learner and window bucket.
- A scheduler closes due buckets and asks a delivery worker to send them.
- The delivery worker records the provider response against the bucket id before acknowledging completion.

## Trade-offs to explain
- A single relational store is enough initially; it gives durable event and idempotency records without premature distributed storage.
- At-least-once queue delivery is acceptable when consumers are idempotent.
- A 30-minute window improves signal-to-noise but intentionally trades immediacy for focus.

## Prompts
- What table or key prevents duplicate event inclusion?
- How would you honor a mute that happens after an event arrives but before delivery?
- Which metric would tell you learners are receiving digests late?

## Reflection
Describe one failure mode, its user impact, and the recovery path in plain language.
$content$,
        NULL,
        NULL,
        jsonb_build_array(
          jsonb_build_object('prompt', 'A learner mutes a room five minutes before a digest closes. What does the worker check?', 'expected', 'Current delivery preferences before sending', 'description', 'Preference changes must be honored at delivery time'),
          jsonb_build_object('prompt', 'A provider returns a timeout after accepting a request. What property limits duplicate digests?', 'expected', 'An idempotency key and durable send record', 'description', 'Retries must be safe')
        )
      );

    INSERT INTO rubric_versions (content_id, version, criteria) VALUES
      ('10000000-0000-0000-0000-000000000001', 1, jsonb_build_object('invariant', jsonb_build_object('weight', 35, 'description', 'Explains the prefix-count invariant'), 'correctness', jsonb_build_object('weight', 45, 'description', 'Updates and returns counts correctly'), 'complexity', jsonb_build_object('weight', 20, 'description', 'Identifies linear time and distinct-key space'))),
      ('10000000-0000-0000-0000-000000000002', 1, jsonb_build_object('window_invariant', jsonb_build_object('weight', 35, 'description', 'Keeps at most limit distinct categories'), 'pointer_updates', jsonb_build_object('weight', 35, 'description', 'Moves each boundary safely forward'), 'complexity', jsonb_build_object('weight', 30, 'description', 'Explains amortized linear movement'))),
      ('10000000-0000-0000-0000-000000000003', 1, jsonb_build_object('requirements', jsonb_build_object('weight', 25, 'description', 'Addresses digest window, mute, and no-loss requirements'), 'durability', jsonb_build_object('weight', 30, 'description', 'Uses durable acceptance and safe retries'), 'idempotency', jsonb_build_object('weight', 25, 'description', 'Explains duplicate prevention'), 'tradeoffs', jsonb_build_object('weight', 20, 'description', 'Names a deliberate trade-off and metric')));

    INSERT INTO curriculum_track_items (track_id, content_id, position, required) VALUES
      ('algorithm-patterns-foundation', '10000000-0000-0000-0000-000000000001', 1, true),
      ('algorithm-patterns-foundation', '10000000-0000-0000-0000-000000000002', 2, true),
      ('system-design-foundation', '10000000-0000-0000-0000-000000000003', 1, true);

    INSERT INTO content_concepts (content_id, concept_id, position) VALUES
      ('10000000-0000-0000-0000-000000000001', 'hash-map-counting', 1),
      ('10000000-0000-0000-0000-000000000001', 'loop-invariants', 2),
      ('10000000-0000-0000-0000-000000000002', 'sliding-window', 1),
      ('10000000-0000-0000-0000-000000000002', 'two-pointers', 2),
      ('10000000-0000-0000-0000-000000000003', 'durable-event-ingestion', 1),
      ('10000000-0000-0000-0000-000000000003', 'idempotency', 2),
      ('10000000-0000-0000-0000-000000000003', 'asynchronous-delivery', 3);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DELETE FROM content_items
    WHERE id IN (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000003'
    );
  `);
  pgm.dropTable('content_concepts');
  pgm.dropTable('curriculum_track_items');
  pgm.dropTable('curriculum_tracks');
}
