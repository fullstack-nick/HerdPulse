import 'dotenv/config';
import {
  DeviceConnectionStatus,
  LactationPhase,
  OrganizationRole,
  Priority,
  TelemetryMetric,
  defaultRiskSettings,
} from '@herdpulse/domain';
import { ulid } from 'ulid';
import { createDatabase } from './database.js';

const db = createDatabase();
const organizationId = 'org-demo-farm';

function seededValue(index: number, metric: TelemetryMetric, point: number): number {
  const wave = Math.sin((point + index * 3) / 12);
  if (metric === TelemetryMetric.TEMPERATURE) return Number((38.5 + wave * 0.18).toFixed(2));
  if (metric === TelemetryMetric.RUMINATION) return Math.round(430 + wave * 55);
  if (metric === TelemetryMetric.ACTIVITY) return Math.round(52 + wave * 18);
  if (metric === TelemetryMetric.DRINKING) return Math.round(10 + wave * 3);
  return Number((6.2 + wave * 0.08).toFixed(2));
}

try {
  await db
    .insertInto('organization')
    .values({
      id: organizationId,
      name: 'Meadow Ridge Dairy',
      timezone: 'Europe/Berlin',
      defaultLanguage: 'en',
    })
    .onConflict((oc) => oc.column('id').doUpdateSet({ name: 'Meadow Ridge Dairy' }))
    .execute();

  await db
    .insertInto('organizationSetting')
    .values({ organizationId, riskSettings: defaultRiskSettings })
    .onConflict((oc) =>
      oc.column('organizationId').doUpdateSet({ riskSettings: defaultRiskSettings }),
    )
    .execute();

  const users = [
    ['user-owner', 'owner@herdpulse.local', 'Alex Morgan', OrganizationRole.OWNER],
    ['user-manager', 'manager@herdpulse.local', 'Maya Chen', OrganizationRole.MANAGER],
    ['user-worker', 'worker@herdpulse.local', 'Jon Bell', OrganizationRole.WORKER],
    ['user-vet', 'vet@herdpulse.local', 'Dr. Sam Rivera', OrganizationRole.VET],
    ['user-consultant', 'consultant@herdpulse.local', 'Taylor Reed', OrganizationRole.CONSULTANT],
  ] as const;

  for (const [id, email, displayName, role] of users) {
    await db
      .insertInto('user')
      .values({ id, email, displayName, oidcSubject: id })
      .onConflict((oc) => oc.column('id').doUpdateSet({ displayName }))
      .execute();
    await db
      .insertInto('organizationMembership')
      .values({ organizationId, userId: id, role, preferredLanguage: 'en' })
      .onConflict((oc) =>
        oc.columns(['organizationId', 'userId']).doUpdateSet({ role, active: true }),
      )
      .execute();
  }

  const groups = [
    ['group-fresh', 'Fresh cows'],
    ['group-high', 'High production'],
    ['group-close', 'Close-up'],
    ['group-dry', 'Dry cows'],
  ] as const;
  for (const [id, name] of groups) {
    await db
      .insertInto('animalGroup')
      .values({ id, organizationId, name })
      .onConflict((oc) => oc.column('id').doUpdateSet({ name }))
      .execute();
  }

  const now = new Date();
  const animalCount = Number(process.env.SEED_ANIMAL_COUNT ?? 36);
  for (let index = 1; index <= animalCount; index += 1) {
    const animalId = `animal-${String(index).padStart(3, '0')}`;
    const deviceId = `device-${String(index).padStart(3, '0')}`;
    const fresh = index % 7 === 0;
    const close = index % 11 === 0;
    const dry = index % 9 === 0;
    const lactationPhase = fresh
      ? LactationPhase.FRESH
      : close
        ? LactationPhase.CLOSE_UP
        : dry
          ? LactationPhase.DRY
          : LactationPhase.LACTATING;
    const groupId = fresh
      ? 'group-fresh'
      : close
        ? 'group-close'
        : dry
          ? 'group-dry'
          : 'group-high';

    await db
      .insertInto('device')
      .values({
        id: deviceId,
        organizationId,
        hardwareId: `HP-${String(index).padStart(6, '0')}`,
        status: index % 13 === 0 ? DeviceConnectionStatus.STALE : DeviceConnectionStatus.ONLINE,
        lastSeenAt: new Date(now.getTime() - (index % 13 === 0 ? 3 * 60 * 60_000 : 5 * 60_000)),
        batteryPercent: 56 + (index % 44),
        signalStrength: -42 - (index % 28),
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();

    await db
      .insertInto('animal')
      .values({
        id: animalId,
        organizationId,
        officialId: `DE${String(100000000 + index)}`,
        displayName:
          ['Hazel', 'Willow', 'Maple', 'Clover', 'Iris', 'Daisy'][index % 6] + ` ${index}`,
        groupId,
        deviceId,
        lactationPhase,
        parity: 1 + (index % 5),
        lastCalvingAt: fresh ? new Date(now.getTime() - (2 + (index % 5)) * 86_400_000) : null,
        expectedCalvingAt: close ? new Date(now.getTime() + (3 + (index % 8)) * 86_400_000) : null,
        archivedAt: null,
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();
  }

  const existingTelemetry = await db
    .selectFrom('telemetrySample')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .where('organizationId', '=', organizationId)
    .executeTakeFirst();

  if (Number(existingTelemetry?.count ?? 0) === 0) {
    const metrics = [
      TelemetryMetric.TEMPERATURE,
      TelemetryMetric.RUMINATION,
      TelemetryMetric.ACTIVITY,
      TelemetryMetric.DRINKING,
    ];
    const rows = [];
    for (let index = 1; index <= animalCount; index += 1) {
      for (let point = 0; point < 144; point += 1) {
        const occurredAt = new Date(now.getTime() - (143 - point) * 10 * 60_000);
        for (const metric of metrics) {
          rows.push({
            id: ulid(occurredAt.getTime()),
            organizationId,
            animalId: `animal-${String(index).padStart(3, '0')}`,
            deviceId: `device-${String(index).padStart(3, '0')}`,
            externalSampleId: `seed-${index}-${point}-${metric}`,
            metric,
            value: seededValue(index, metric, point),
            unit:
              metric === TelemetryMetric.TEMPERATURE
                ? 'CELSIUS'
                : metric === TelemetryMetric.RUMINATION
                  ? 'MINUTES_PER_DAY'
                  : 'INDEX',
            occurredAt,
            receivedAt: new Date(occurredAt.getTime() + 20_000),
            source: 'seed',
          });
        }
      }
    }
    for (let offset = 0; offset < rows.length; offset += 1000) {
      await db
        .insertInto('telemetrySample')
        .values(rows.slice(offset, offset + 1000))
        .execute();
    }
  }

  await db
    .insertInto('sop')
    .values({ id: 'sop-health-check', organizationId, name: 'Priority animal health check' })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
  await db
    .insertInto('sopVersion')
    .values({
      id: 'sop-health-check-v1',
      organizationId,
      sopId: 'sop-health-check',
      version: 1,
      title: 'Check animal and record findings',
      instructions:
        'Locate the animal, observe posture and appetite, measure temperature if needed, record findings, and escalate if symptoms are severe.',
      triggerPriority: Priority.MEDIUM,
      dueMinutes: 90,
    })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();

  console.log(
    `Seeded ${animalCount} animals and a 24-hour telemetry window for ${organizationId}.`,
  );
} finally {
  await db.destroy();
}
