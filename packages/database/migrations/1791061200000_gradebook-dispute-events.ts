import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE gradebook_publications
      ADD CONSTRAINT gradebook_publications_dispute_identity
      UNIQUE (id, recipient_id, policy_id, grade_revision_id);

    CREATE TABLE gradebook_dispute_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_id uuid NOT NULL,
      policy_id uuid NOT NULL,
      publication_id uuid NOT NULL,
      grade_revision_id uuid NOT NULL,
      sequence integer NOT NULL CHECK (sequence > 0),
      supersedes_id uuid,
      status text NOT NULL CHECK (
        status IN ('submitted', 'in_review', 'resolved', 'withdrawn', 'superseded')
      ),
      outcome text CHECK (outcome IN ('upheld', 'changed')),
      replacement_grade_revision_id uuid,
      actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
      actor_role text NOT NULL CHECK (actor_role IN ('learner', 'instructor', 'system')),
      reason text NOT NULL CHECK (length(btrim(reason)) > 0 AND length(reason) <= 4000),
      message text CHECK (length(message) <= 4000),
      request_key text NOT NULL CHECK (
        length(btrim(request_key)) > 0 AND length(request_key) <= 128
      ),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE (id, recipient_id, policy_id),
      UNIQUE (recipient_id, sequence),
      UNIQUE (recipient_id, request_key),
      UNIQUE (supersedes_id),
      FOREIGN KEY (recipient_id, policy_id)
        REFERENCES gradebook_recipients(id, policy_id) ON DELETE CASCADE,
      FOREIGN KEY (publication_id, recipient_id, policy_id, grade_revision_id)
        REFERENCES gradebook_publications(id, recipient_id, policy_id, grade_revision_id),
      FOREIGN KEY (grade_revision_id, recipient_id, policy_id)
        REFERENCES gradebook_grade_revisions(id, recipient_id, policy_id),
      FOREIGN KEY (replacement_grade_revision_id, recipient_id, policy_id)
        REFERENCES gradebook_grade_revisions(id, recipient_id, policy_id),
      FOREIGN KEY (supersedes_id, recipient_id, policy_id)
        REFERENCES gradebook_dispute_events(id, recipient_id, policy_id),
      CONSTRAINT gradebook_dispute_actor CHECK (
        (actor_role = 'system' AND actor_id IS NULL)
        OR (actor_role IN ('learner', 'instructor') AND actor_id IS NOT NULL)
      ),
      CONSTRAINT gradebook_dispute_resolution CHECK (
        (status <> 'resolved' AND outcome IS NULL AND replacement_grade_revision_id IS NULL)
        OR (status = 'resolved' AND outcome = 'upheld' AND replacement_grade_revision_id IS NULL)
        OR (status = 'resolved' AND outcome = 'changed' AND replacement_grade_revision_id IS NOT NULL)
      ),
      CONSTRAINT gradebook_dispute_initial_shape CHECK (
        (sequence = 1 AND supersedes_id IS NULL AND status = 'submitted' AND actor_role = 'learner')
        OR (sequence > 1 AND supersedes_id IS NOT NULL)
      ),
      CHECK (replacement_grade_revision_id IS NULL OR replacement_grade_revision_id <> grade_revision_id)
    );
    CREATE UNIQUE INDEX gradebook_dispute_one_lineage_per_publication_idx
      ON gradebook_dispute_events(publication_id) WHERE sequence = 1;
    CREATE INDEX gradebook_dispute_recipient_latest_idx
      ON gradebook_dispute_events(recipient_id, sequence DESC);
    CREATE INDEX gradebook_dispute_actor_idx
      ON gradebook_dispute_events(actor_id, created_at DESC) WHERE actor_id IS NOT NULL;

    CREATE FUNCTION gradebook_validate_dispute_event() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
      AS $function$
      DECLARE
        prior public.gradebook_dispute_events%ROWTYPE;
      BEGIN
        IF NEW.sequence = 1 THEN
          RETURN NEW;
        END IF;

        SELECT * INTO prior
        FROM public.gradebook_dispute_events
        WHERE id = NEW.supersedes_id
          AND recipient_id = NEW.recipient_id
          AND policy_id = NEW.policy_id;

        IF NOT FOUND OR NEW.sequence <> prior.sequence + 1 THEN
          RAISE EXCEPTION 'Dispute events must extend the preceding event'
            USING ERRCODE = '23514';
        END IF;

        IF prior.status IN ('resolved', 'withdrawn', 'superseded') THEN
          IF NEW.status <> 'submitted' OR NEW.actor_role <> 'learner'
            OR NEW.publication_id = prior.publication_id THEN
            RAISE EXCEPTION 'A terminal dispute can only be followed by a new publication dispute'
              USING ERRCODE = '23514';
          END IF;
          RETURN NEW;
        END IF;

        IF NEW.publication_id <> prior.publication_id
          OR NEW.grade_revision_id <> prior.grade_revision_id THEN
          RAISE EXCEPTION 'Active dispute transitions must preserve their target'
            USING ERRCODE = '23514';
        END IF;

        IF NOT (
          (prior.status = 'submitted' AND NEW.status IN ('in_review', 'resolved', 'withdrawn', 'superseded'))
          OR (prior.status = 'in_review' AND NEW.status IN ('resolved', 'withdrawn', 'superseded'))
        ) THEN
          RAISE EXCEPTION 'Invalid dispute status transition'
            USING ERRCODE = '23514';
        END IF;

        IF (NEW.status = 'withdrawn' AND NEW.actor_role <> 'learner')
          OR (NEW.status IN ('in_review', 'resolved') AND NEW.actor_role <> 'instructor')
          OR (NEW.status = 'superseded' AND NEW.actor_role <> 'system') THEN
          RAISE EXCEPTION 'Dispute event actor cannot perform this transition'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $function$;
    REVOKE ALL ON FUNCTION gradebook_validate_dispute_event() FROM PUBLIC, anon, authenticated;
    CREATE TRIGGER gradebook_dispute_event_lineage
      BEFORE INSERT ON gradebook_dispute_events
      FOR EACH ROW EXECUTE FUNCTION gradebook_validate_dispute_event();

    ALTER TABLE gradebook_dispute_events ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE gradebook_dispute_events FROM PUBLIC, anon, authenticated;
    CREATE TRIGGER gradebook_dispute_events_immutable
      BEFORE UPDATE ON gradebook_dispute_events
      FOR EACH ROW EXECUTE FUNCTION gradebook_reject_update();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('gradebook_dispute_events');
  pgm.sql('DROP FUNCTION gradebook_validate_dispute_event()');
  pgm.sql(`
    ALTER TABLE gradebook_publications
      DROP CONSTRAINT gradebook_publications_dispute_identity;
  `);
}
