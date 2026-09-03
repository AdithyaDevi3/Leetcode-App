import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // This event-trigger helper runs with elevated privileges and is not an RPC.
  // Prevent browser roles from invoking it through the exposed public schema.
  pgm.sql(`
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
    ALTER FUNCTION public.update_updated_at_column() SET search_path = pg_catalog;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER FUNCTION public.update_updated_at_column() RESET search_path;
    GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC, anon, authenticated;
  `);
}
