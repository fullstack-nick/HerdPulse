import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Database, JsonValue } from '@herdpulse/database';
import { DeviceConnectionStatus, HealthCaseStatus, Priority, TaskStatus } from '@herdpulse/domain';
import { topics } from '@herdpulse/event-contracts';
import type { Kysely, Transaction } from 'kysely';
import { ulid } from 'ulid';
import type { RequestUser } from './auth.service.js';
import { RealtimeService } from './pubsub.service.js';
import { DATABASE } from './tokens.js';

function iso(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

function assertVersion(updated: bigint | number | undefined) {
  if (Number(updated ?? 0) === 0)
    throw new ConflictException('This item changed. Refresh and try again.');
}

@Injectable()
export class DataService {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<Database>,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
  ) {}

  private async membership(user: RequestUser, organizationId: string) {
    if (user.organizationId !== organizationId)
      throw new ForbiddenException('Organization access denied.');
    const membership = await this.db
      .selectFrom('organizationMembership')
      .select(['role'])
      .where('organizationId', '=', organizationId)
      .where('userId', '=', user.id)
      .where('active', '=', true)
      .executeTakeFirst();
    if (!membership) throw new ForbiddenException('No active organization membership.');
    return membership;
  }

  private async requireRole(user: RequestUser, organizationId: string, roles: string[]) {
    const { role } = await this.membership(user, organizationId);
    if (!roles.includes(role))
      throw new ForbiddenException(`Requires one of: ${roles.join(', ')}.`);
  }

  async viewer(user: RequestUser) {
    const row = await this.db
      .selectFrom('user')
      .innerJoin('organizationMembership', 'organizationMembership.userId', 'user.id')
      .innerJoin('organization', 'organization.id', 'organizationMembership.organizationId')
      .select([
        'user.id',
        'user.displayName',
        'user.email',
        'organization.id as organizationId',
        'organization.name as organizationName',
        'organizationMembership.role',
      ])
      .where('user.id', '=', user.id)
      .where('organization.id', '=', user.organizationId)
      .executeTakeFirstOrThrow();
    return row;
  }

  async animalView(
    organizationId: string,
    animalId: string,
    includeActiveCase = true,
  ): Promise<any> {
    const row = await this.db
      .selectFrom('animal')
      .leftJoin('animalGroup', 'animalGroup.id', 'animal.groupId')
      .leftJoin('device', 'device.id', 'animal.deviceId')
      .select([
        'animal.id',
        'animal.officialId',
        'animal.displayName',
        'animal.lactationPhase',
        'animal.parity',
        'animalGroup.id as groupId',
        'animalGroup.name as groupName',
        'device.id as deviceId',
        'device.hardwareId',
        'device.status as deviceStatus',
        'device.lastSeenAt',
        'device.batteryPercent',
        'device.signalStrength',
      ])
      .where('animal.organizationId', '=', organizationId)
      .where('animal.id', '=', animalId)
      .where('animal.archivedAt', 'is', null)
      .executeTakeFirst();
    if (!row) return null;
    const active = includeActiveCase
      ? await this.db
          .selectFrom('healthCase')
          .select('id')
          .where('organizationId', '=', organizationId)
          .where('animalId', '=', animalId)
          .where('status', 'in', [
            HealthCaseStatus.OPEN,
            HealthCaseStatus.ACKNOWLEDGED,
            HealthCaseStatus.IN_PROGRESS,
          ])
          .executeTakeFirst()
      : null;
    return {
      id: row.id,
      officialId: row.officialId,
      displayName: row.displayName,
      lactationPhase: row.lactationPhase,
      parity: row.parity,
      group: row.groupId ? { id: row.groupId, name: row.groupName } : null,
      device: row.deviceId
        ? {
            id: row.deviceId,
            hardwareId: row.hardwareId,
            status: row.deviceStatus,
            lastSeenAt: iso(row.lastSeenAt),
            batteryPercent: row.batteryPercent,
            signalStrength: row.signalStrength,
          }
        : null,
      activeCase: active ? await this.caseView(organizationId, active.id, false) : null,
    };
  }

  async taskView(organizationId: string, taskId: string): Promise<any> {
    const row = await this.db
      .selectFrom('task')
      .innerJoin('healthCase', 'healthCase.id', 'task.healthCaseId')
      .innerJoin('animal', 'animal.id', 'healthCase.animalId')
      .leftJoin('user as assignee', 'assignee.id', 'task.assigneeUserId')
      .select([
        'task.id',
        'task.title',
        'task.instructions',
        'task.status',
        'task.dueAt',
        'task.version',
        'task.assigneeUserId as assigneeId',
        'assignee.displayName as assigneeName',
        'task.healthCaseId as caseId',
        'healthCase.priority',
        'animal.id as animalId',
        'animal.displayName as animalName',
        'task.resolution',
        'task.diagnosisCode',
        'task.completedAt',
      ])
      .where('task.organizationId', '=', organizationId)
      .where('task.id', '=', taskId)
      .executeTakeFirst();
    if (!row) return null;
    const comments = await this.db
      .selectFrom('taskComment')
      .innerJoin('user', 'user.id', 'taskComment.authorUserId')
      .select([
        'taskComment.id',
        'taskComment.body',
        'user.displayName as authorName',
        'taskComment.createdAt',
      ])
      .where('taskComment.organizationId', '=', organizationId)
      .where('taskComment.taskId', '=', taskId)
      .orderBy('taskComment.createdAt')
      .execute();
    return {
      ...row,
      dueAt: iso(row.dueAt),
      completedAt: iso(row.completedAt),
      isOverdue: row.status !== TaskStatus.COMPLETED && new Date(row.dueAt).getTime() < Date.now(),
      comments: comments.map((comment) => ({ ...comment, createdAt: iso(comment.createdAt) })),
    };
  }

  async caseView(organizationId: string, caseId: string, includeAnimalCase = false): Promise<any> {
    const row = await this.db
      .selectFrom('healthCase')
      .selectAll()
      .where('organizationId', '=', organizationId)
      .where('id', '=', caseId)
      .executeTakeFirst();
    if (!row) return null;
    const [animal, risk, taskRows, history] = await Promise.all([
      this.animalView(organizationId, row.animalId, includeAnimalCase),
      row.currentRiskAssessmentId
        ? this.db
            .selectFrom('riskAssessment')
            .selectAll()
            .where('id', '=', row.currentRiskAssessmentId)
            .executeTakeFirst()
        : null,
      this.db
        .selectFrom('task')
        .select('id')
        .where('organizationId', '=', organizationId)
        .where('healthCaseId', '=', caseId)
        .orderBy('createdAt')
        .execute(),
      this.db
        .selectFrom('healthCaseEvent')
        .selectAll()
        .where('organizationId', '=', organizationId)
        .where('healthCaseId', '=', caseId)
        .orderBy('createdAt', 'desc')
        .execute(),
    ]);
    const tasks = await Promise.all(taskRows.map((task) => this.taskView(organizationId, task.id)));
    const reasons = Array.isArray(risk?.reasons)
      ? (risk.reasons as Array<Record<string, unknown>>)
      : [];
    return {
      ...row,
      openedAt: iso(row.openedAt),
      acknowledgedAt: iso(row.acknowledgedAt),
      resolvedAt: iso(row.resolvedAt),
      updatedAt: iso(row.updatedAt),
      animal,
      riskAssessment: risk
        ? {
            ...risk,
            windowStart: iso(risk.windowStart),
            windowEnd: iso(risk.windowEnd),
            createdAt: iso(risk.createdAt),
            reasons: reasons.map((reason) => ({
              ...reason,
              detail: reason.detail ? JSON.stringify(reason.detail) : null,
            })),
            consideredEventIds: Array.isArray(risk.consideredEventIds)
              ? risk.consideredEventIds
              : [],
          }
        : null,
      tasks,
      timeline: history.map((entry) => ({
        id: entry.id,
        kind: entry.type,
        title: entry.type
          .replaceAll('_', ' ')
          .toLowerCase()
          .replace(/^./, (letter) => letter.toUpperCase()),
        detail: Object.keys(entry.data).length ? JSON.stringify(entry.data) : null,
        occurredAt: iso(entry.createdAt),
      })),
    };
  }

  async dashboard(user: RequestUser, organizationId: string) {
    await this.membership(user, organizationId);
    const [animalCount, caseRows, taskRows, offline] = await Promise.all([
      this.db
        .selectFrom('animal')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('organizationId', '=', organizationId)
        .where('archivedAt', 'is', null)
        .executeTakeFirst(),
      this.db
        .selectFrom('healthCase')
        .select('id')
        .where('organizationId', '=', organizationId)
        .where('status', '!=', HealthCaseStatus.RESOLVED)
        .orderBy('updatedAt', 'desc')
        .limit(8)
        .execute(),
      this.db
        .selectFrom('task')
        .select('id')
        .where('organizationId', '=', organizationId)
        .where('status', 'in', [TaskStatus.OPEN, TaskStatus.CLAIMED])
        .orderBy('dueAt')
        .limit(8)
        .execute(),
      this.db
        .selectFrom('device')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('organizationId', '=', organizationId)
        .where('status', '!=', DeviceConnectionStatus.ONLINE)
        .executeTakeFirst(),
    ]);
    const [activeCases, highCases, openTasks, overdueTasks] = await Promise.all([
      this.db
        .selectFrom('healthCase')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('organizationId', '=', organizationId)
        .where('status', '!=', HealthCaseStatus.RESOLVED)
        .executeTakeFirst(),
      this.db
        .selectFrom('healthCase')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('organizationId', '=', organizationId)
        .where('status', '!=', HealthCaseStatus.RESOLVED)
        .where('priority', '=', Priority.HIGH)
        .executeTakeFirst(),
      this.db
        .selectFrom('task')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('organizationId', '=', organizationId)
        .where('status', 'in', [TaskStatus.OPEN, TaskStatus.CLAIMED])
        .executeTakeFirst(),
      this.db
        .selectFrom('task')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .where('organizationId', '=', organizationId)
        .where('status', 'in', [TaskStatus.OPEN, TaskStatus.CLAIMED])
        .where('dueAt', '<', new Date())
        .executeTakeFirst(),
    ]);
    return {
      totalAnimals: Number(animalCount?.count ?? 0),
      activeCases: Number(activeCases?.count ?? 0),
      highPriorityCases: Number(highCases?.count ?? 0),
      openTasks: Number(openTasks?.count ?? 0),
      overdueTasks: Number(overdueTasks?.count ?? 0),
      offlineDevices: Number(offline?.count ?? 0),
      cases: await Promise.all(caseRows.map((item) => this.caseView(organizationId, item.id))),
      tasks: await Promise.all(taskRows.map((item) => this.taskView(organizationId, item.id))),
    };
  }

  async healthCases(
    user: RequestUser,
    organizationId: string,
    status?: HealthCaseStatus,
    priority?: Priority,
    limit = 50,
  ) {
    await this.membership(user, organizationId);
    let query = this.db
      .selectFrom('healthCase')
      .select('id')
      .where('organizationId', '=', organizationId);
    if (status) query = query.where('status', '=', status);
    if (priority) query = query.where('priority', '=', priority);
    const rows = await query.orderBy('updatedAt', 'desc').limit(Math.min(limit, 100)).execute();
    return Promise.all(rows.map((item) => this.caseView(organizationId, item.id)));
  }

  async healthCase(user: RequestUser, organizationId: string, id: string) {
    await this.membership(user, organizationId);
    return this.caseView(organizationId, id);
  }

  async animals(user: RequestUser, organizationId: string, search?: string, limit = 100) {
    await this.membership(user, organizationId);
    let query = this.db
      .selectFrom('animal')
      .select('id')
      .where('organizationId', '=', organizationId)
      .where('archivedAt', 'is', null);
    if (search)
      query = query.where((eb) =>
        eb.or([
          eb('displayName', 'ilike', `%${search}%`),
          eb('officialId', 'ilike', `%${search}%`),
        ]),
      );
    const rows = await query.orderBy('displayName').limit(Math.min(limit, 200)).execute();
    return Promise.all(rows.map((item) => this.animalView(organizationId, item.id)));
  }

  async animal(user: RequestUser, organizationId: string, id: string) {
    await this.membership(user, organizationId);
    return this.animalView(organizationId, id);
  }

  async telemetry(
    user: RequestUser,
    organizationId: string,
    animalId: string,
    metric?: string,
    hours = 24,
  ) {
    await this.membership(user, organizationId);
    let query = this.db
      .selectFrom('telemetrySample')
      .select(['id', 'metric', 'value', 'unit', 'occurredAt'])
      .where('organizationId', '=', organizationId)
      .where('animalId', '=', animalId)
      .where('occurredAt', '>=', new Date(Date.now() - Math.min(hours, 168) * 3_600_000));
    if (metric) query = query.where('metric', '=', metric as any);
    const rows = await query.orderBy('occurredAt').limit(2000).execute();
    return rows.map((row) => ({ ...row, occurredAt: iso(row.occurredAt) }));
  }

  async tasks(
    user: RequestUser,
    organizationId: string,
    status?: TaskStatus,
    mine = false,
    limit = 100,
  ) {
    await this.membership(user, organizationId);
    let query = this.db
      .selectFrom('task')
      .select('id')
      .where('organizationId', '=', organizationId);
    if (status) query = query.where('status', '=', status);
    if (mine) query = query.where('assigneeUserId', '=', user.id);
    const rows = await query.orderBy('dueAt').limit(Math.min(limit, 200)).execute();
    return Promise.all(rows.map((item) => this.taskView(organizationId, item.id)));
  }

  private async recordChange(
    trx: Transaction<Database>,
    data: {
      organizationId: string;
      actorUserId: string;
      action: string;
      entityType: string;
      entityId: string;
      detail?: JsonValue;
    },
  ) {
    await trx
      .insertInto('auditLog')
      .values({
        id: ulid(),
        organizationId: data.organizationId,
        actorUserId: data.actorUserId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        data: data.detail ?? {},
      })
      .execute();
  }

  async acknowledgeCase(
    user: RequestUser,
    organizationId: string,
    id: string,
    expectedVersion: number,
  ) {
    await this.membership(user, organizationId);
    await this.db.transaction().execute(async (trx) => {
      const result = await trx
        .updateTable('healthCase')
        .set({
          status: HealthCaseStatus.ACKNOWLEDGED,
          acknowledgedAt: new Date(),
          version: expectedVersion + 1,
          updatedAt: new Date(),
        })
        .where('organizationId', '=', organizationId)
        .where('id', '=', id)
        .where('status', '=', HealthCaseStatus.OPEN)
        .where('version', '=', expectedVersion)
        .executeTakeFirst();
      assertVersion(result.numUpdatedRows);
      await trx
        .insertInto('healthCaseEvent')
        .values({
          id: ulid(),
          organizationId,
          healthCaseId: id,
          actorUserId: user.id,
          type: 'CASE_ACKNOWLEDGED',
          data: {},
        })
        .execute();
      await this.recordChange(trx, {
        organizationId,
        actorUserId: user.id,
        action: 'ACKNOWLEDGE',
        entityType: 'HEALTH_CASE',
        entityId: id,
      });
    });
    const entity = await this.caseView(organizationId, id);
    await this.realtime.emit('case', organizationId, entity);
    return { ok: true, message: 'Case acknowledged.', entityId: id };
  }

  async claimTask(user: RequestUser, organizationId: string, id: string, expectedVersion: number) {
    await this.membership(user, organizationId);
    await this.db.transaction().execute(async (trx) => {
      const result = await trx
        .updateTable('task')
        .set({
          status: TaskStatus.CLAIMED,
          assigneeUserId: user.id,
          version: expectedVersion + 1,
          updatedAt: new Date(),
        })
        .where('organizationId', '=', organizationId)
        .where('id', '=', id)
        .where('status', '=', TaskStatus.OPEN)
        .where('version', '=', expectedVersion)
        .executeTakeFirst();
      assertVersion(result.numUpdatedRows);
      await this.recordChange(trx, {
        organizationId,
        actorUserId: user.id,
        action: 'CLAIM',
        entityType: 'TASK',
        entityId: id,
      });
    });
    const entity = await this.taskView(organizationId, id);
    await this.realtime.emit('task', organizationId, entity);
    return { ok: true, message: 'Task claimed.', entityId: id };
  }

  async assignTask(
    user: RequestUser,
    organizationId: string,
    id: string,
    assigneeId: string,
    expectedVersion: number,
  ) {
    await this.requireRole(user, organizationId, ['OWNER', 'MANAGER', 'VET']);
    const result = await this.db
      .updateTable('task')
      .set({
        assigneeUserId: assigneeId,
        status: TaskStatus.CLAIMED,
        version: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where('organizationId', '=', organizationId)
      .where('id', '=', id)
      .where('version', '=', expectedVersion)
      .executeTakeFirst();
    assertVersion(result.numUpdatedRows);
    const entity = await this.taskView(organizationId, id);
    await this.realtime.emit('task', organizationId, entity);
    return { ok: true, message: 'Task assigned.', entityId: id };
  }

  async addTaskComment(user: RequestUser, organizationId: string, taskId: string, body: string) {
    await this.membership(user, organizationId);
    const clean = body.trim();
    if (!clean || clean.length > 2000)
      throw new ConflictException('Comment must contain 1–2000 characters.');
    const task = await this.db
      .selectFrom('task')
      .select('id')
      .where('organizationId', '=', organizationId)
      .where('id', '=', taskId)
      .executeTakeFirst();
    if (!task) throw new NotFoundException('Task not found.');
    await this.db
      .insertInto('taskComment')
      .values({ id: ulid(), organizationId, taskId, authorUserId: user.id, body: clean })
      .execute();
    const entity = await this.taskView(organizationId, taskId);
    await this.realtime.emit('task', organizationId, entity);
    return { ok: true, message: 'Comment added.', entityId: taskId };
  }

  async completeTask(
    user: RequestUser,
    organizationId: string,
    id: string,
    resolution: string,
    diagnosisCode: string | undefined,
    expectedVersion: number,
  ) {
    await this.membership(user, organizationId);
    const result = await this.db
      .updateTable('task')
      .set({
        status: TaskStatus.COMPLETED,
        resolution: resolution.trim(),
        diagnosisCode: diagnosisCode?.trim() || null,
        completedAt: new Date(),
        version: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where('organizationId', '=', organizationId)
      .where('id', '=', id)
      .where('version', '=', expectedVersion)
      .where('status', 'in', [TaskStatus.OPEN, TaskStatus.CLAIMED])
      .executeTakeFirst();
    assertVersion(result.numUpdatedRows);
    const entity = await this.taskView(organizationId, id);
    await this.realtime.emit('task', organizationId, entity);
    return { ok: true, message: 'Task completed.', entityId: id };
  }

  async resolveCase(
    user: RequestUser,
    organizationId: string,
    id: string,
    resolution: string,
    expectedVersion: number,
  ) {
    await this.requireRole(user, organizationId, ['OWNER', 'MANAGER', 'VET']);
    await this.db.transaction().execute(async (trx) => {
      const result = await trx
        .updateTable('healthCase')
        .set({
          status: HealthCaseStatus.RESOLVED,
          resolution: resolution.trim(),
          resolvedAt: new Date(),
          version: expectedVersion + 1,
          updatedAt: new Date(),
        })
        .where('organizationId', '=', organizationId)
        .where('id', '=', id)
        .where('version', '=', expectedVersion)
        .where('status', '!=', HealthCaseStatus.RESOLVED)
        .executeTakeFirst();
      assertVersion(result.numUpdatedRows);
      await trx
        .insertInto('healthCaseEvent')
        .values({
          id: ulid(),
          organizationId,
          healthCaseId: id,
          actorUserId: user.id,
          type: 'CASE_RESOLVED',
          data: { resolution },
        })
        .execute();
      await this.recordChange(trx, {
        organizationId,
        actorUserId: user.id,
        action: 'RESOLVE',
        entityType: 'HEALTH_CASE',
        entityId: id,
      });
    });
    const entity = await this.caseView(organizationId, id);
    await this.realtime.emit('case', organizationId, entity);
    return { ok: true, message: 'Case resolved.', entityId: id };
  }

  async recordAnimalEvent(
    user: RequestUser,
    organizationId: string,
    animalId: string,
    eventType: string,
    occurredAt?: string,
  ) {
    await this.requireRole(user, organizationId, ['OWNER', 'MANAGER', 'VET']);
    const animal = await this.db
      .selectFrom('animal')
      .select(['officialId', 'deviceId'])
      .where('organizationId', '=', organizationId)
      .where('id', '=', animalId)
      .executeTakeFirstOrThrow();
    const now = new Date();
    const eventId = ulid();
    const payload = {
      eventId,
      schemaVersion: 1,
      organizationId,
      animalId,
      officialId: animal.officialId,
      deviceId: animal.deviceId ?? undefined,
      eventType,
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : now.toISOString(),
      receivedAt: now.toISOString(),
      correlationId: eventId,
      source: 'manual-entry',
      data: { actorUserId: user.id },
    };
    await this.db
      .insertInto('outboxMessage')
      .values({
        id: ulid(),
        organizationId,
        topic: topics.animalEventReceived,
        eventKey: `${organizationId}:${animalId}`,
        payload,
        publishedAt: null,
        lastError: null,
      })
      .execute();
    return { ok: true, message: 'Event queued for processing.', entityId: eventId };
  }

  async replayOutbox(user: RequestUser, organizationId: string) {
    await this.requireRole(user, organizationId, ['OWNER', 'MANAGER']);
    const result = await this.db
      .updateTable('outboxMessage')
      .set({ publishedAt: null, lastError: null })
      .where('organizationId', '=', organizationId)
      .where('lastError', 'is not', null)
      .executeTakeFirst();
    return {
      ok: true,
      message: `${Number(result.numUpdatedRows ?? 0)} failed messages queued for replay.`,
    };
  }
}
