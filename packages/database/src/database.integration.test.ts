import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from './types.js';
import { createDatabase } from './database.js';

describe('local PostgreSQL integration', () => {
  let db: Kysely<Database>;

  beforeAll(() => {
    db = createDatabase();
  });

  afterAll(async () => {
    await db.destroy();
  });

  it('exposes the seeded tenant and preserves nested scoring keys', async () => {
    const [animals, settings] = await Promise.all([
      db
        .selectFrom('animal')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('organizationId', '=', 'org-demo-farm')
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('organizationSetting')
        .select('riskSettings')
        .where('organizationId', '=', 'org-demo-farm')
        .executeTakeFirstOrThrow(),
    ]);

    expect(Number(animals.count)).toBeGreaterThanOrEqual(36);
    expect(
      (settings.riskSettings as { eventWeights: Record<string, number> }).eventWeights,
    ).toMatchObject({ TEMPERATURE_INCREASE: 2, RUMINATION_DECREASE: 2 });
  });

  it('keeps at most one active case for an animal', async () => {
    const rows = await db
      .selectFrom('healthCase')
      .select('id')
      .where('organizationId', '=', 'org-demo-farm')
      .where('animalId', '=', 'animal-007')
      .where('status', 'in', ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'])
      .execute();

    expect(rows).toHaveLength(1);
  });
});
