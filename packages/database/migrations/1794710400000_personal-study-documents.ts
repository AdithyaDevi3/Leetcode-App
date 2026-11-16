import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'personal-study-documents',
      'personal-study-documents',
      false,
      15728640,
      ARRAY[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain'
      ]
    )
    ON CONFLICT (id) DO UPDATE SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

    CREATE TABLE personal_study_documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      storage_path text NOT NULL UNIQUE CHECK(storage_path ~ '^[0-9a-f-]+/[0-9a-f-]+$'),
      filename text NOT NULL CHECK(length(btrim(filename)) BETWEEN 1 AND 180),
      content_type text NOT NULL CHECK(content_type IN (
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain'
      )),
      byte_size integer NOT NULL CHECK(byte_size > 0 AND byte_size <= 15728640),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE INDEX personal_study_documents_user_idx
      ON personal_study_documents(user_id, created_at DESC, id DESC);
    ALTER TABLE personal_study_documents ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE personal_study_documents FROM PUBLIC, anon, authenticated;

    CREATE POLICY personal_study_documents_own_rows ON personal_study_documents
      FOR ALL TO authenticated
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()));

    CREATE POLICY personal_study_documents_read_own_files ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'personal-study-documents' AND (storage.foldername(name))[1] = (select auth.uid()::text));
    CREATE POLICY personal_study_documents_upload_own_files ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'personal-study-documents' AND (storage.foldername(name))[1] = (select auth.uid()::text));
    CREATE POLICY personal_study_documents_delete_own_files ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'personal-study-documents' AND (storage.foldername(name))[1] = (select auth.uid()::text));
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP POLICY IF EXISTS personal_study_documents_delete_own_files ON storage.objects;
    DROP POLICY IF EXISTS personal_study_documents_upload_own_files ON storage.objects;
    DROP POLICY IF EXISTS personal_study_documents_read_own_files ON storage.objects;
    DROP POLICY IF EXISTS personal_study_documents_own_rows ON personal_study_documents;
    DROP TABLE personal_study_documents;
    DELETE FROM storage.buckets WHERE id = 'personal-study-documents';
  `);
}
