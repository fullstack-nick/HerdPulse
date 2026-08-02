import 'dotenv/config';
import { sql } from 'kysely';
import { createDatabase } from './database.js';
import { migration001 } from './migration-001.js';

const db = createDatabase();

try {
  await sql
    .raw(
      `
    CREATE TABLE IF NOT EXISTS schema_migration (
      version integer PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `,
    )
    .execute(db);
  const applied = await sql<{ version: number }>`SELECT version FROM schema_migration`.execute(db);
  const versions = new Set(applied.rows.map((row) => row.version));
  if (!versions.has(1)) {
    await migration001(db);
    console.log('Applied migration 001: initial HerdPulse schema.');
  } else {
    console.log('Database is already up to date.');
  }
} finally {
  await db.destroy();
}
