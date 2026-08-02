import 'dotenv/config';
import {
  deviceStatusSchema,
  eventKey,
  telemetrySampleSchema,
  topics,
  animalEventSchema,
} from '@herdpulse/event-contracts';
import { Kafka, logLevel, Partitioners } from 'kafkajs';
import { ulid } from 'ulid';

const organizationId = 'org-demo-farm';
const kafka = new Kafka({
  clientId: 'herdpulse-simulator',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  logLevel: logLevel.WARN,
});
const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });

function base(source = 'local-simulator', occurredAt = new Date()) {
  const eventId = ulid();
  return {
    eventId,
    schemaVersion: 1 as const,
    organizationId,
    occurredAt: occurredAt.toISOString(),
    receivedAt: new Date().toISOString(),
    correlationId: eventId,
    source,
  };
}

function animalEvent(animalNumber: number, eventType: string, occurredAt = new Date()) {
  const suffix = String(animalNumber).padStart(3, '0');
  return animalEventSchema.parse({
    ...base('local-simulator', occurredAt),
    animalId: `animal-${suffix}`,
    officialId: `DE${100000000 + animalNumber}`,
    deviceId: `device-${suffix}`,
    eventType,
    data: { fixture: 'demo' },
  });
}

async function send(topic: string, value: unknown, key: string) {
  await producer.send({ topic, messages: [{ key, value: JSON.stringify(value) }] });
}

async function demo() {
  const now = new Date();
  const animalId = 'animal-007';
  const first = animalEvent(7, 'TEMPERATURE_INCREASE', new Date(now.getTime() - 45 * 60_000));
  const second = animalEvent(7, 'RUMINATION_DECREASE', new Date(now.getTime() - 70 * 60_000));
  await send(topics.animalEventReceived, first, eventKey(organizationId, animalId));
  await send(topics.animalEventReceived, first, eventKey(organizationId, animalId));
  await send(topics.animalEventReceived, second, eventKey(organizationId, animalId));

  for (const [metric, value, unit] of [
    ['TEMPERATURE', 39.7, 'CELSIUS'],
    ['RUMINATION', 268, 'MINUTES_PER_DAY'],
    ['ACTIVITY', 31, 'INDEX'],
    ['DRINKING', 6, 'INDEX'],
  ] as const) {
    const sample = telemetrySampleSchema.parse({
      ...base(),
      animalId,
      deviceId: 'device-007',
      metric,
      value,
      unit,
    });
    await send(topics.telemetrySampleReceived, sample, eventKey(organizationId, animalId));
  }
  const status = deviceStatusSchema.parse({
    ...base(),
    deviceId: 'device-013',
    animalId: 'animal-013',
    status: 'OFFLINE',
    batteryPercent: 61,
    signalStrength: -97,
  });
  await send(topics.deviceStatusReceived, status, `${organizationId}:device-013`);
  console.log(
    'Demo queued: duplicate alert, out-of-order second signal, telemetry burst, and offline heartbeat.',
  );
  console.log(
    'Expected result: one high-priority case and one task for Willow 7; duplicate ignored.',
  );
}

async function duplicateIncident() {
  const fixture = animalEvent(14, 'ACTIVITY_DROP');
  for (let attempt = 0; attempt < 5; attempt += 1)
    await send(topics.animalEventReceived, fixture, eventKey(organizationId, fixture.animalId));
  console.log(
    `Sent event ${fixture.eventId} five times. Inbox idempotency should process it once.`,
  );
}

async function schemaIncident() {
  const broken = animalEvent(21, 'TEMPERATURE_INCREASE') as Record<string, unknown>;
  delete broken.schemaVersion;
  await send(topics.animalEventReceived, broken, eventKey(organizationId, 'animal-021'));
  console.log('Sent a record without schemaVersion. It should appear on the dead-letter topic.');
}

async function replayDlq() {
  const consumer = kafka.consumer({ groupId: `herdpulse-dlq-replay-${ulid()}` });
  await consumer.connect();
  await consumer.subscribe({ topic: topics.deadLetter, fromBeginning: true });
  let replayed = 0;
  const run = consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const dead = JSON.parse(message.value?.toString() ?? '{}');
        const original = JSON.parse(dead.originalRecord);
        if (dead.originalTopic === topics.animalEventReceived) {
          original.schemaVersion = 1;
          original.receivedAt = new Date().toISOString();
          const repaired = animalEventSchema.parse(original);
          await send(
            dead.originalTopic,
            repaired,
            eventKey(repaired.organizationId, repaired.animalId),
          );
          replayed += 1;
        }
      } catch (error) {
        console.warn(
          `Skipped unrecoverable dead-letter record: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await consumer.disconnect();
  await run;
  console.log(`Replayed ${replayed} repaired dead-letter record(s) with their original event IDs.`);
}

async function stream() {
  console.log('Streaming realistic telemetry every five seconds. Press Ctrl+C to stop.');
  let point = 0;
  while (true) {
    const animalNumber = 1 + (point % 36);
    const suffix = String(animalNumber).padStart(3, '0');
    const animalId = `animal-${suffix}`;
    const wave = Math.sin(point / 8);
    for (const [metric, value, unit] of [
      ['TEMPERATURE', 38.5 + wave * 0.2, 'CELSIUS'],
      ['RUMINATION', 430 + wave * 40, 'MINUTES_PER_DAY'],
      ['ACTIVITY', 52 + wave * 15, 'INDEX'],
    ] as const) {
      const sample = telemetrySampleSchema.parse({
        ...base(),
        animalId,
        deviceId: `device-${suffix}`,
        metric,
        value,
        unit,
      });
      await send(topics.telemetrySampleReceived, sample, eventKey(organizationId, animalId));
    }
    point += 1;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

await producer.connect();
try {
  const command = process.argv[2] || 'demo';
  if (command === 'demo') await demo();
  else if (command === 'duplicate') await duplicateIncident();
  else if (command === 'schema-break') await schemaIncident();
  else if (command === 'replay-dlq') await replayDlq();
  else if (command === 'stream') await stream();
  else throw new Error(`Unknown simulator command: ${command}`);
} finally {
  await producer.disconnect();
}
