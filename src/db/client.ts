import pg from "pg";
import { getDbConfig } from "./config.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const config = getDbConfig();
    pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.name,
      user: config.user,
      password: config.password,
      max: config.maxConnections,
    });
  }
  return pool;
}

export async function query<T = pg.QueryResult>(text: string, params?: unknown[]): Promise<T> {
  const pool = getPool();
  return pool.query(text, params) as Promise<T>;
}

export async function getClient(): Promise<pg.PoolClient> {
  return getPool().connect();
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export type { pg };
