import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE gradebook_applicability_revisions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_id uuid NOT NULL,
      policy_id uuid NOT NULL,
      sequence integer NOT NULL CHECK (sequence > 0),
      supersedes_id uuid,
      applicability text NOT NULL CHECK (applicability IN ('assigned', 'excused')),
      reason text NOT NULL CHECK (length(btrim(reason)) > 0 AND length(reason) <= 4000),
      authored_by uuid REFERENCES users(id) ON DELETE RESTRICT,
      source text NOT NULL DEFAULT 'instructor' CHECK (source IN ('system', 'instructor')),
      request_key text NOT NULL CHECK (length(btrim(request_key)) > 0 AND length(request_key) <= 128),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      UNIQUE (id, recipient_id, policy_id),
      UNIQUE (recipient_id, sequence),
      UNIQUE (recipient_id, request_key),
      UNIQUE (supersedes_id),
      FOREIGN KEY (recipient_id, policy_id)
        REFERENCES gradebook_recipients(id, policy_id) ON DELETE CASCADE,
      FOREIGN KEY (supersedes_id, recipient_id, policy_id)
        REFERENCES gradebook_applicability_revisions(id, recipient_id, policy_id),
      CONSTRAINT gradebook_applicability_authorship CHECK (
        (source = 'system' AND authored_by IS NULL)
        OR (source = 'instructor' AND authored_by IS NOT NULL)
      ),
      CONSTRAINT gradebook_applicability_initial_shape CHECK (
        (sequence = 1 AND supersedes_id IS NULL AND applicability = 'assigned' AND source = 'system')
        OR (sequence > 1 AND supersedes_id IS NOT NULL AND source = 'instructor')
      )
    );
    CREATE INDEX gradebook_applicability_recipient_latest_idx
      ON gradebook_applicability_revisions(recipient_id, sequence DESC);
    CREATE INDEX gradebook_applicability_author_idx
      ON gradebook_applicability_revisions(authored_by, created_at DESC)
      WHERE authored_by IS NOT NULL;

    CREATE FUNCTION gradebook_validate_applicability_revision() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
      AS $function$
      DECLARE
        prior_sequence integer;
      BEGIN
        IF NEW.sequence = 1 THEN
          RETURN NEW;
        END IF;

        SELECT sequence INTO prior_sequence
        FROM public.gradebook_applicability_revisions
        WHERE id = NEW.supersedes_id
          AND recipient_id = NEW.recipient_id
          AND policy_id = NEW.policy_id;

        IF NOT FOUND OR NEW.sequence <> prior_sequence + 1 THEN
          RAISE EXCEPTION 'Applicability revisions must extend the preceding revision'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $function$;
    REVOKE ALL ON FUNCTION gradebook_validate_applicability_revision() FROM PUBLIC, anon, authenticated;
    CREATE TRIGGER gradebook_applicability_lineage
      BEFORE INSERT ON gradebook_applicability_revisions
      FOR EACH ROW EXECUTE FUNCTION gradebook_validate_applicability_revision();

    CREATE FUNCTION gradebook_initialize_recipient_applicability() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
      AS $function$
      BEGIN
        INSERT INTO public.gradebook_applicability_revisions
          (id, recipient_id, policy_id, sequence, applicability, reason, source, request_key, created_at)
        VALUES (
          md5('gradebook-applicability:' || NEW.id::text)::uuid,
          NEW.id,
          NEW.policy_id,
          1,
          'assigned',
          'Assignment recipient initialized as assigned',
          'system',
          'system-initial:' || NEW.id::text,
          NEW.created_at
        );
        RETURN NEW;
      END;
      $function$;
    REVOKE ALL ON FUNCTION gradebook_initialize_recipient_applicability() FROM PUBLIC, anon, authenticated;
    CREATE TRIGGER gradebook_recipient_initial_applicability
      AFTER INSERT ON gradebook_recipients
      FOR EACH ROW EXECUTE FUNCTION gradebook_initialize_recipient_applicability();

    INSERT INTO gradebook_applicability_revisions
      (id, recipient_id, policy_id, sequence, applicability, reason, source, request_key, created_at)
    SELECT
      md5('gradebook-applicability:' || r.id::text)::uuid,
      r.id,
      r.policy_id,
      1,
      'assigned',
      'Assignment recipient initialized as assigned',
      'system',
      'system-initial:' || r.id::text,
      r.created_at
    FROM gradebook_recipients r
    ORDER BY r.id
    ON CONFLICT (recipient_id, sequence) DO NOTHING;

    ALTER TABLE gradebook_applicability_revisions ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE gradebook_applicability_revisions FROM PUBLIC, anon, authenticated;
    CREATE TRIGGER gradebook_applicability_revisions_immutable
      BEFORE UPDATE ON gradebook_applicability_revisions
      FOR EACH ROW EXECUTE FUNCTION gradebook_reject_update();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TRIGGER gradebook_recipient_initial_applicability ON gradebook_recipients');
  pgm.sql('DROP FUNCTION gradebook_initialize_recipient_applicability()');
  pgm.dropTable('gradebook_applicability_revisions');
  pgm.sql('DROP FUNCTION gradebook_validate_applicability_revision()');
}
