import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE assessment_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
      current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0 AND current_version <= revision),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE INDEX assessment_templates_owner_updated_idx ON assessment_templates(owner_id,updated_at DESC,id);
    CREATE TABLE assessment_template_versions (
      template_id uuid NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
      version integer NOT NULL CHECK (version > 0),
      title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
      instructions text NOT NULL CHECK (length(instructions) <= 2000),
      questions jsonb NOT NULL,
      max_units integer GENERATED ALWAYS AS (assessment_draft_question_units(questions)) STORED NOT NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(template_id,version), CHECK (max_units BETWEEN 1 AND 1000000)
    );
    ALTER TABLE assessment_templates ADD CONSTRAINT assessment_templates_current_version_fk
      FOREIGN KEY(id,current_version) REFERENCES assessment_template_versions(template_id,version) DEFERRABLE INITIALLY DEFERRED;
    CREATE TABLE assessment_template_mutations (
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_key text NOT NULL CHECK (length(request_key) BETWEEN 1 AND 128 AND length(btrim(request_key)) > 0),
      template_id uuid NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
      fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
      snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(actor_id,request_key)
    );
    CREATE INDEX assessment_template_mutations_template_idx ON assessment_template_mutations(template_id);
    CREATE FUNCTION assessment_template_guard_head() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $function$
      BEGIN
        IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
          OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.revision <> OLD.revision+1
          OR NEW.current_version NOT IN(OLD.current_version,OLD.current_version+1) THEN
          RAISE EXCEPTION 'Invalid template head transition' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END; $function$;
    REVOKE ALL ON FUNCTION assessment_template_guard_head() FROM PUBLIC,anon,authenticated;
    CREATE TRIGGER assessment_templates_guard BEFORE UPDATE ON assessment_templates
      FOR EACH ROW EXECUTE FUNCTION assessment_template_guard_head();
    CREATE FUNCTION assessment_template_reject_version_change() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $function$
      BEGIN
        IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM public.assessment_templates WHERE id=OLD.template_id) THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'Template versions are immutable' USING ERRCODE='23514';
      END; $function$;
    REVOKE ALL ON FUNCTION assessment_template_reject_version_change() FROM PUBLIC,anon,authenticated;
    CREATE TRIGGER assessment_template_versions_immutable BEFORE UPDATE OR DELETE ON assessment_template_versions
      FOR EACH ROW EXECUTE FUNCTION assessment_template_reject_version_change();
    CREATE FUNCTION assessment_template_reject_receipt_change() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $function$
      BEGIN
        IF TG_OP='DELETE' AND (NOT EXISTS(SELECT 1 FROM public.assessment_templates WHERE id=OLD.template_id)
          OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=OLD.actor_id)) THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'Template receipts are immutable' USING ERRCODE='23514';
      END; $function$;
    REVOKE ALL ON FUNCTION assessment_template_reject_receipt_change() FROM PUBLIC,anon,authenticated;
    CREATE TRIGGER assessment_template_mutations_immutable BEFORE UPDATE OR DELETE ON assessment_template_mutations
      FOR EACH ROW EXECUTE FUNCTION assessment_template_reject_receipt_change();
    ALTER TABLE assessment_templates ENABLE ROW LEVEL SECURITY;
    ALTER TABLE assessment_template_versions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE assessment_template_mutations ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE assessment_templates,assessment_template_versions,assessment_template_mutations FROM PUBLIC,anon,authenticated;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $guard$ BEGIN
      IF EXISTS(SELECT 1 FROM assessment_templates)
        OR EXISTS(SELECT 1 FROM assessment_template_versions)
        OR EXISTS(SELECT 1 FROM assessment_template_mutations) THEN
        RAISE EXCEPTION 'Private template storage is forward-only after content has been saved' USING ERRCODE='55000';
      END IF;
    END; $guard$;
    DROP TABLE assessment_template_mutations;
    ALTER TABLE assessment_templates DROP CONSTRAINT assessment_templates_current_version_fk;
    DROP TABLE assessment_template_versions;
    DROP TABLE assessment_templates;
    DROP FUNCTION assessment_template_guard_head();
    DROP FUNCTION assessment_template_reject_version_change();
    DROP FUNCTION assessment_template_reject_receipt_change();
  `);
}
