import { runner } from 'node-pg-migrate';
import type { DatabaseConfig } from '../client.js';

export async function runMigrations(config: DatabaseConfig, direction: 'up' | 'down' = 'up'): Promise<void> {
  await runner({
    databaseUrl: `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${encodeURIComponent(config.database)}${config.ssl ? '?sslmode=require' : ''}`,
    direction,
    dir: 'migrations',
    migrationsTable: 'pgmigrations',
    count: Infinity,
    createSchema: true,
    createMigrationsSchema: true,
    checkOrder: true,
  });
}
