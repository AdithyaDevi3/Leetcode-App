import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE gradebook_release_batches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      assignment_id uuid NOT NULL REFERENCES class_assignments(id) ON DELETE CASCADE,
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_key text NOT NULL CHECK(length(btrim(request_key)) BETWEEN 1 AND 128),
      fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(actor_id,request_key)
    );
    CREATE INDEX gradebook_release_batches_assignment_idx ON gradebook_release_batches(assignment_id);
    CREATE INDEX gradebook_release_batches_class_idx ON gradebook_release_batches(class_id);
    CREATE TABLE gradebook_release_batch_items (
      batch_id uuid NOT NULL REFERENCES gradebook_release_batches(id) ON DELETE CASCADE,
      recipient_id uuid NOT NULL REFERENCES gradebook_recipients(id) ON DELETE CASCADE,
      publication_id uuid NOT NULL REFERENCES gradebook_publications(id) ON DELETE CASCADE,
      PRIMARY KEY(batch_id,recipient_id), UNIQUE(batch_id,publication_id)
    );
    CREATE INDEX gradebook_release_batch_items_recipient_idx ON gradebook_release_batch_items(recipient_id);
    CREATE INDEX gradebook_release_batch_items_publication_idx ON gradebook_release_batch_items(publication_id);
    CREATE TABLE gradebook_class_result_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      assignment_id uuid NOT NULL REFERENCES class_assignments(id) ON DELETE CASCADE,
      sequence integer NOT NULL CHECK(sequence > 0),
      shared boolean NOT NULL,
      recipient_count integer NOT NULL CHECK(recipient_count BETWEEN 0 AND 500),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(assignment_id,sequence), CHECK(shared OR recipient_count=0)
    );
    CREATE INDEX gradebook_class_result_events_class_idx ON gradebook_class_result_events(class_id);
    CREATE TABLE gradebook_class_result_targets (
      event_id uuid NOT NULL REFERENCES gradebook_class_result_events(id) ON DELETE CASCADE,
      recipient_id uuid NOT NULL REFERENCES gradebook_recipients(id) ON DELETE CASCADE,
      grade_revision_id uuid NOT NULL REFERENCES gradebook_grade_revisions(id) ON DELETE CASCADE,
      publication_id uuid NOT NULL REFERENCES gradebook_publications(id) ON DELETE CASCADE,
      attempt_id uuid REFERENCES gradebook_attempts(id) ON DELETE CASCADE,
      PRIMARY KEY(event_id,recipient_id)
    );
    CREATE INDEX gradebook_class_result_targets_recipient_idx ON gradebook_class_result_targets(recipient_id);
    CREATE INDEX gradebook_class_result_targets_grade_idx ON gradebook_class_result_targets(grade_revision_id);
    CREATE INDEX gradebook_class_result_targets_publication_idx ON gradebook_class_result_targets(publication_id);
    CREATE INDEX gradebook_class_result_targets_attempt_idx ON gradebook_class_result_targets(attempt_id);
    CREATE TABLE gradebook_class_result_commands (
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_key text NOT NULL CHECK(length(btrim(request_key)) BETWEEN 1 AND 128),
      event_id uuid NOT NULL REFERENCES gradebook_class_result_events(id) ON DELETE CASCADE,
      fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(actor_id,request_key)
    );
    CREATE INDEX gradebook_class_result_commands_event_idx ON gradebook_class_result_commands(event_id);
    CREATE FUNCTION gradebook_release_scope_guard() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $function$
      BEGIN
        IF NOT EXISTS(SELECT 1 FROM public.class_assignments a WHERE a.id=NEW.assignment_id AND a.class_id=NEW.class_id) THEN
          RAISE EXCEPTION 'Release assignment must belong to its class' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END; $function$;
    REVOKE ALL ON FUNCTION gradebook_release_scope_guard() FROM PUBLIC,anon,authenticated;
    CREATE TRIGGER gradebook_release_batch_scope BEFORE INSERT ON gradebook_release_batches
      FOR EACH ROW EXECUTE FUNCTION gradebook_release_scope_guard();
    CREATE TRIGGER gradebook_class_result_scope BEFORE INSERT ON gradebook_class_result_events
      FOR EACH ROW EXECUTE FUNCTION gradebook_release_scope_guard();
    CREATE FUNCTION gradebook_release_item_guard() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $function$
      BEGIN
        IF NOT EXISTS(SELECT 1 FROM public.gradebook_release_batches b
          JOIN public.gradebook_policies p ON p.assignment_id=b.assignment_id
          JOIN public.gradebook_recipients r ON r.policy_id=p.id AND r.id=NEW.recipient_id
          JOIN public.gradebook_publications g ON g.id=NEW.publication_id AND g.recipient_id=r.id AND g.policy_id=p.id
          WHERE b.id=NEW.batch_id) THEN
          RAISE EXCEPTION 'Release receipt must reference the matching recipient publication' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END; $function$;
    REVOKE ALL ON FUNCTION gradebook_release_item_guard() FROM PUBLIC,anon,authenticated;
    CREATE TRIGGER gradebook_release_item_scope BEFORE INSERT ON gradebook_release_batch_items
      FOR EACH ROW EXECUTE FUNCTION gradebook_release_item_guard();
    CREATE FUNCTION gradebook_class_result_target_guard() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $function$
      BEGIN
        IF NOT EXISTS(SELECT 1 FROM public.gradebook_class_result_events e
          JOIN public.gradebook_policies p ON p.assignment_id=e.assignment_id
          JOIN public.gradebook_recipients r ON r.policy_id=p.id AND r.id=NEW.recipient_id
          JOIN public.gradebook_publications pub ON pub.id=NEW.publication_id AND pub.recipient_id=r.id AND pub.policy_id=p.id
          JOIN public.gradebook_grade_revisions g ON g.id=NEW.grade_revision_id AND g.id=pub.grade_revision_id
            AND g.recipient_id=r.id AND g.policy_id=p.id AND g.attempt_id IS NOT DISTINCT FROM NEW.attempt_id
          WHERE e.id=NEW.event_id AND e.shared) THEN
          RAISE EXCEPTION 'Shared result must pin the matching released grade and response' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END; $function$;
    REVOKE ALL ON FUNCTION gradebook_class_result_target_guard() FROM PUBLIC,anon,authenticated;
    CREATE TRIGGER gradebook_class_result_target_scope BEFORE INSERT ON gradebook_class_result_targets
      FOR EACH ROW EXECUTE FUNCTION gradebook_class_result_target_guard();
  `);
  for (const table of ['gradebook_release_batches','gradebook_release_batch_items','gradebook_class_result_events','gradebook_class_result_targets','gradebook_class_result_commands']) {
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE ${table} FROM PUBLIC,anon,authenticated;
      CREATE TRIGGER ${table}_immutable BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION gradebook_reject_update();`);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DO $guard$ BEGIN
    IF EXISTS(SELECT 1 FROM gradebook_release_batches) OR EXISTS(SELECT 1 FROM gradebook_class_result_events) THEN
      RAISE EXCEPTION 'Grade release history is forward-only after publication' USING ERRCODE='55000';
    END IF;
  END; $guard$;
  DROP TABLE gradebook_class_result_commands;
  DROP TABLE gradebook_class_result_targets;
  DROP TABLE gradebook_class_result_events;
  DROP TABLE gradebook_release_batch_items;
  DROP TABLE gradebook_release_batches;
  DROP FUNCTION gradebook_class_result_target_guard();
  DROP FUNCTION gradebook_release_item_guard();
  DROP FUNCTION gradebook_release_scope_guard();`);
}
