import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './types.js';

const { Pool } = pg;

export function createDatabase(
  databaseUrl = process.env.DATABASE_URL || 'postgresql://herd:herd_dev@localhost:5432/herd_pulse',
): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: databaseUrl,
        max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
      }),
    }),
    plugins: [new CamelCasePlugin({ maintainNestedObjectKeys: true })],
  });
}
