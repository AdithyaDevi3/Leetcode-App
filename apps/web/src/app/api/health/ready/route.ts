import { createDatabaseClient, databaseConfigFromEnv } from '@leetcode-app/database';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

/**
 * Readiness probe for hosted environments. Unlike /api/health (liveness), this
 * endpoint verifies the required Supabase configuration and can reach Postgres.
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { status: 'not_ready', checks: { supabase: 'missing_configuration', database: 'not_checked' } },
      { status: 503 },
    );
  }

  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    await db.query('SELECT 1');
    return Response.json({ status: 'ready', checks: { supabase: 'configured', database: 'reachable' } });
  } catch {
    return Response.json(
      { status: 'not_ready', checks: { supabase: 'configured', database: 'unreachable' } },
      { status: 503 },
    );
  } finally {
    await db.close();
  }
}
