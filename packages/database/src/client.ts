import pg from 'pg';

const { Pool } = pg;

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  /** Server-only connection string for managed PostgreSQL providers. */
  connectionString?: string;
}

export class DatabaseClient {
  private pool: pg.Pool;

  constructor(config: DatabaseConfig) {
    const connectionString = config.connectionString ?? process.env.DATABASE_URL;
    this.pool = new Pool({
      ...(connectionString
        ? { connectionString }
        : {
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: config.password,
          }),
      ssl: config.ssl,
    });
  }

  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  getPool(): pg.Pool {
    return this.pool;
  }
}

export function createDatabaseClient(config: DatabaseConfig): DatabaseClient {
  return new DatabaseClient(config);
}
