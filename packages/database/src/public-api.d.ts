import type { Pool, PoolClient } from 'pg';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

export class DatabaseClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
  transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  getPool(): Pool;
}

export function createDatabaseClient(config: DatabaseConfig): DatabaseClient;

export class PostgresUserRepository {
  constructor(db: DatabaseClient);
  findById(id: string): Promise<any | null>;
  findByEmail(email: string): Promise<any | null>;
  create(user: any): Promise<any>;
  update(...args: any[]): Promise<any>;
  delete(...args: any[]): Promise<void>;
  upgradeGuestToUser(guestId: string, userId: string): Promise<void>;
}

export class PostgresGuestIdentityRepository {
  constructor(db: DatabaseClient);
  findById(id: string): Promise<any | null>;
  findBySessionToken(token: string): Promise<any | null>;
  create(guest: any): Promise<any>;
  upgradeToUser(guestId: string, userId: string): Promise<void>;
}
