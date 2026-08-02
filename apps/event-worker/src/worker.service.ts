import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Database, JsonValue } from '@herdpulse/database';
import {
  AnimalEventType,
  DeviceConnectionStatus,
  HealthCaseStatus,
  TaskStatus,
  TelemetryMetric,
  calculateRisk,
  defaultRiskSettings,
  shouldCreateTask,
  type RiskSettings,
} from '@herdpulse/domain';
import {
  animalEventSchema,
  deadLetterSchema,
  deviceStatusSchema,
  telemetrySampleSchema,
  topics,
  type AnimalEventMessage,
  type DeviceStatusMessage,
  type TelemetrySampleMessage,
} from '@herdpulse/event-contracts';
import { Redis } from 'ioredis';
import { Kafka, logLevel, Partitioners, type EachMessagePayload } from 'kafkajs';
import type { Kysely, Transaction } from 'kysely';
import { ulid } from 'ulid';
import { DATABASE } from './tokens.js';

const inputTopics = [
  topics.animalEventReceived,
  topics.telemetrySampleReceived,
  topics.deviceStatusReceived,
];

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly kafka = new Kafka({
    clientId: 'herdpulse-worker',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
  });
  private readonly consumer = this.kafka.consumer({ groupId: 'herdpulse-health-v1' });
  private readonly producer = this.kafka.producer({
    allowAutoTopicCreation: true,
    createPartitioner: Partitioners.DefaultPartitioner,
  });
  private readonly redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  private relayTimer?: NodeJS.Timeout;
  private processed = 0;
  private duplicates = 0;
  private failures = 0;

  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  async onModuleInit() {
    const admin = this.kafka.admin();
    await admin.connect();
    const desiredTopics = [
      ...inputTopics,
      topics.healthCaseChanged,
      topics.taskChanged,
      topics.deadLetter,
    ];
    const existingTopics = new Set(await admin.listTopics());
    const missingTopics = desiredTopics.filter((topic) => !existingTopics.has(topic));
    if (missingTopics.length)
      await admin.createTopics({
        waitForLeaders: true,
        topics: missingTopics.map((topic) => ({ topic, numPartitions: 3, replicationFactor: 1 })),
      });
    await admin.disconnect();
    await Promise.all([this.producer.connect(), this.consumer.connect()]);
    for (const topic of inputTopics) await this.consumer.subscribe({ topic, fromBeginning: true });
    void this.consumer.run({ eachMessage: (payload) => this.handle(payload) });
    this.relayTimer = setInterval(() => void this.relayOutbox(), 500);
    this.relayTimer.unref();
    this.logger.log(`Consuming ${inputTopics.join(', ')}`);
  }

  stats() {
    return { processed: this.processed, duplicates: this.duplicates, failures: this.failures };
  }

  private async handle(payload: EachMessagePayload) {
    const raw = payload.message.value?.toString() ?? '';
    try {
      const message = JSON.parse(raw);
      if (payload.topic === topics.animalEventReceived) {
        await this.processAnimalEvent(animalEventSchema.parse(message), payload);
      } else if (payload.topic === topics.telemetrySampleReceived) {
        await this.processTelemetry(telemetrySampleSchema.parse(message), payload);
      } else if (payload.topic === topics.deviceStatusReceived) {
        await this.processDeviceStatus(deviceStatusSchema.parse(message), payload);
      }
      this.processed += 1;
    } catch (error) {
      this.failures += 1;
      if (
        error instanceof SyntaxError ||
        (error && typeof error === 'object' && 'issues' in error)
      ) {
        await this.deadLetter(payload, raw, error instanceof Error ? error.message : String(error));
        this.logger.warn(`Sent invalid ${payload.topic} record to the dead-letter topic.`);
        return;
      }
      this.logger.error(
        `Processing failed for ${payload.topic}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async claimInbox(
    trx: Transaction<Database>,
    eventId: string,
    payload: EachMessagePayload,
  ) {
    const inserted = await trx
      .insertInto('inboxMessage')
      .values({
        consumerName: 'herdpulse-health-v1',
        eventId,
        topic: payload.topic,
        partition: payload.partition,
        offsetValue: payload.message.offset,
      })
      .onConflict((oc) => oc.columns(['consumerName', 'eventId']).doNothing())
      .returning('eventId')
      .executeTakeFirst();
    if (!inserted) this.duplicates += 1;
    return Boolean(inserted);
  }

  private changeEnvelope(
    organizationId: string,
    entityId: string,
    entityVersion: number,
    changeType: 'CREATED' | 'UPDATED' | 'RESOLVED' | 'COMPLETED',
    source: string,
    data: Record<string, unknown>,
  ) {
    const now = new Date().toISOString();
    return {
      eventId: ulid(),
      schemaVersion: 1 as const,
      organizationId,
      occurredAt: now,
      receivedAt: now,
      correlationId: ulid(),
      source,
      entityId,
      entityVersion,
      changeType,
      data,
    };
  }

  private async queueChange(
    trx: Transaction<Database>,
    organizationId: string,
    topic: string,
    entityId: string,
    entityVersion: number,
    changeType: 'CREATED' | 'UPDATED' | 'RESOLVED' | 'COMPLETED',
    data: Record<string, unknown>,
  ) {
    await trx
      .insertInto('outboxMessage')
      .values({
        id: ulid(),
        organizationId,
        topic,
        eventKey: `${organizationId}:${entityId}`,
        payload: this.changeEnvelope(
          organizationId,
          entityId,
          entityVersion,
          changeType,
          'event-worker',
          data,
        ),
        publishedAt: null,
        lastError: null,
      })
      .execute();
  }

  private async processAnimalEvent(message: AnimalEventMessage, payload: EachMessagePayload) {
    await this.db.transaction().execute(async (trx) => {
      if (!(await this.claimInbox(trx, message.eventId, payload))) return;
      const animal = await trx
        .selectFrom('animal')
        .selectAll()
        .where('organizationId', '=', message.organizationId)
        .where('id', '=', message.animalId)
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('animalEvent')
        .values({
          id: message.eventId,
          organizationId: message.organizationId,
          animalId: message.animalId,
          externalEventId: message.eventId,
          type: message.eventType as AnimalEventType,
          occurredAt: message.occurredAt,
          receivedAt: message.receivedAt,
          source: message.source,
          schemaVersion: message.schemaVersion,
          payload: message.data,
        })
        .execute();

      const settingRow = await trx
        .selectFrom('organizationSetting')
        .select('riskSettings')
        .where('organizationId', '=', message.organizationId)
        .executeTakeFirst();
      const settings = {
        ...defaultRiskSettings,
        ...((settingRow?.riskSettings ?? {}) as Partial<RiskSettings>),
      } as RiskSettings;
      const now = new Date(message.receivedAt);
      const events = await trx
        .selectFrom('animalEvent')
        .select(['id', 'type', 'occurredAt'])
        .where('organizationId', '=', message.organizationId)
        .where('animalId', '=', message.animalId)
        .where('occurredAt', '>=', new Date(now.getTime() - settings.windowHours * 3_600_000))
        .where('occurredAt', '<=', now)
        .execute();
      const recentResolved = await trx
        .selectFrom('healthCase')
        .select('id')
        .where('organizationId', '=', message.organizationId)
        .where('animalId', '=', message.animalId)
        .where('status', '=', HealthCaseStatus.RESOLVED)
        .where('resolvedAt', '>=', new Date(now.getTime() - 86_400_000))
        .executeTakeFirst();
      const assessment = calculateRisk({
        animal,
        events,
        settings,
        now,
        reopenedWithin24Hours: Boolean(recentResolved),
      });
      let healthCase = await trx
        .selectFrom('healthCase')
        .selectAll()
        .where('organizationId', '=', message.organizationId)
        .where('animalId', '=', message.animalId)
        .where('status', 'in', [
          HealthCaseStatus.OPEN,
          HealthCaseStatus.ACKNOWLEDGED,
          HealthCaseStatus.IN_PROGRESS,
        ])
        .executeTakeFirst();
      const created = !healthCase;
      const caseId = healthCase?.id ?? ulid();
      if (!healthCase) {
        await trx
          .insertInto('healthCase')
          .values({
            id: caseId,
            organizationId: message.organizationId,
            animalId: message.animalId,
            priority: assessment.priority,
            status: HealthCaseStatus.OPEN,
            score: assessment.score,
            currentRiskAssessmentId: null,
            openedAt: now,
            acknowledgedAt: null,
            resolvedAt: null,
            resolution: null,
          })
          .execute();
        healthCase = await trx
          .selectFrom('healthCase')
          .selectAll()
          .where('id', '=', caseId)
          .executeTakeFirstOrThrow();
      }
      const riskId = ulid();
      await trx
        .insertInto('riskAssessment')
        .values({
          id: riskId,
          organizationId: message.organizationId,
          healthCaseId: caseId,
          rulesetVersion: settings.rulesetVersion,
          windowStart: assessment.windowStart,
          windowEnd: assessment.windowEnd,
          score: assessment.score,
          priority: assessment.priority,
          reasons: JSON.stringify(assessment.reasons) as unknown as JsonValue,
          consideredEventIds: JSON.stringify(assessment.consideredEventIds) as unknown as JsonValue,
        })
        .execute();
      const nextVersion = created ? healthCase.version : healthCase.version + 1;
      await trx
        .updateTable('healthCase')
        .set({
          priority: assessment.priority,
          score: assessment.score,
          currentRiskAssessmentId: riskId,
          version: nextVersion,
          updatedAt: new Date(),
        })
        .where('id', '=', caseId)
        .execute();
      await trx
        .insertInto('healthCaseEvent')
        .values({
          id: ulid(),
          organizationId: message.organizationId,
          healthCaseId: caseId,
          actorUserId: null,
          type: created ? 'CASE_OPENED' : 'RISK_RECALCULATED',
          data: {
            triggeringEventId: message.eventId,
            score: assessment.score,
            priority: assessment.priority,
          },
        })
        .execute();

      if (shouldCreateTask(assessment.priority, settings)) {
        const existingTask = await trx
          .selectFrom('task')
          .select('id')
          .where('organizationId', '=', message.organizationId)
          .where('healthCaseId', '=', caseId)
          .where('status', 'in', [TaskStatus.OPEN, TaskStatus.CLAIMED])
          .executeTakeFirst();
        if (!existingTask) {
          const sop = await trx
            .selectFrom('sopVersion')
            .selectAll()
            .where('organizationId', '=', message.organizationId)
            .where('triggerPriority', 'in', [assessment.priority, 'MEDIUM' as any])
            .orderBy('version', 'desc')
            .executeTakeFirst();
          const taskId = ulid();
          await trx
            .insertInto('task')
            .values({
              id: taskId,
              organizationId: message.organizationId,
              healthCaseId: caseId,
              sopVersionId: sop?.id ?? null,
              title: sop?.title ?? 'Check animal and record findings',
              instructions: sop?.instructions ?? 'Observe the animal and record findings.',
              assigneeUserId: null,
              dueAt: new Date(now.getTime() + (sop?.dueMinutes ?? 90) * 60_000),
              status: TaskStatus.OPEN,
              resolution: null,
              diagnosisCode: null,
              completedAt: null,
            })
            .execute();
          await this.queueChange(
            trx,
            message.organizationId,
            topics.taskChanged,
            taskId,
            1,
            'CREATED',
            { healthCaseId: caseId, animalId: message.animalId },
          );
        }
      }
      await this.queueChange(
        trx,
        message.organizationId,
        topics.healthCaseChanged,
        caseId,
        nextVersion,
        created ? 'CREATED' : 'UPDATED',
        { animalId: message.animalId, score: assessment.score, priority: assessment.priority },
      );
    });
  }

  private async processTelemetry(message: TelemetrySampleMessage, payload: EachMessagePayload) {
    await this.db.transaction().execute(async (trx) => {
      if (!(await this.claimInbox(trx, message.eventId, payload))) return;
      await trx
        .insertInto('telemetrySample')
        .values({
          id: message.eventId,
          organizationId: message.organizationId,
          animalId: message.animalId,
          deviceId: message.deviceId,
          externalSampleId: message.eventId,
          metric: message.metric as TelemetryMetric,
          value: message.value,
          unit: message.unit,
          occurredAt: message.occurredAt,
          receivedAt: message.receivedAt,
          source: message.source,
        })
        .execute();
    });
    await this.redis.set(
      `herdpulse:latest:${message.organizationId}:${message.animalId}:${message.metric}`,
      JSON.stringify(message),
      'EX',
      172800,
    );
  }

  private async processDeviceStatus(message: DeviceStatusMessage, payload: EachMessagePayload) {
    await this.db.transaction().execute(async (trx) => {
      if (!(await this.claimInbox(trx, message.eventId, payload))) return;
      await trx
        .updateTable('device')
        .set({
          status: message.status as DeviceConnectionStatus,
          lastSeenAt: message.occurredAt,
          batteryPercent: message.batteryPercent,
          signalStrength: message.signalStrength,
          updatedAt: new Date(),
        })
        .where('organizationId', '=', message.organizationId)
        .where('id', '=', message.deviceId)
        .execute();
    });
    await this.redis.publish(
      `herdpulse:device:${message.organizationId}`,
      JSON.stringify({
        entityId: message.deviceId,
        organizationId: message.organizationId,
        changeType: 'UPDATED',
      }),
    );
  }

  private async deadLetter(payload: EachMessagePayload, raw: string, error: string) {
    const message = deadLetterSchema.parse({
      deadLetterId: ulid(),
      originalTopic: payload.topic,
      originalPartition: payload.partition,
      originalOffset: payload.message.offset,
      failedAt: new Date().toISOString(),
      attempts: 1,
      category: 'VALIDATION',
      error,
      originalRecord: raw,
    });
    await this.producer.send({
      topic: topics.deadLetter,
      messages: [{ key: `${payload.topic}:${payload.partition}`, value: JSON.stringify(message) }],
    });
  }

  private async relayOutbox() {
    const rows = await this.db
      .selectFrom('outboxMessage')
      .selectAll()
      .where('publishedAt', 'is', null)
      .orderBy('createdAt')
      .limit(100)
      .execute();
    for (const row of rows) {
      try {
        await this.producer.send({
          topic: row.topic,
          messages: [{ key: row.eventKey, value: JSON.stringify(row.payload) }],
        });
        await this.db
          .updateTable('outboxMessage')
          .set({ publishedAt: new Date(), attempts: row.attempts + 1, lastError: null })
          .where('id', '=', row.id)
          .execute();
        const payload = row.payload as { entityId?: string; changeType?: string };
        const kind =
          row.topic === topics.healthCaseChanged
            ? 'case'
            : row.topic === topics.taskChanged
              ? 'task'
              : null;
        if (kind && payload.entityId)
          await this.redis.publish(
            `herdpulse:${kind}:${row.organizationId}`,
            JSON.stringify({
              entityId: payload.entityId,
              organizationId: row.organizationId,
              changeType: payload.changeType ?? 'UPDATED',
            }),
          );
      } catch (error) {
        await this.db
          .updateTable('outboxMessage')
          .set({
            attempts: row.attempts + 1,
            lastError: error instanceof Error ? error.message : String(error),
          })
          .where('id', '=', row.id)
          .execute();
      }
    }
  }

  async onModuleDestroy() {
    if (this.relayTimer) clearInterval(this.relayTimer);
    await Promise.allSettled([
      this.consumer.disconnect(),
      this.producer.disconnect(),
      this.redis.quit(),
    ]);
  }
}
