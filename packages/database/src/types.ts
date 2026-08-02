import type { ColumnType, Generated } from 'kysely';
import type {
  AnimalEventType,
  DeviceConnectionStatus,
  HealthCaseStatus,
  LactationPhase,
  OrganizationRole,
  Priority,
  TaskStatus,
  TelemetryMetric,
} from '@herdpulse/domain';

export type Timestamp = ColumnType<Date, Date | string, Date | string>;
export type GeneratedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
export type JsonValue = object | unknown[];

export interface OrganizationTable {
  id: string;
  name: string;
  timezone: string;
  defaultLanguage: string;
  createdAt: GeneratedTimestamp;
}

export interface OrganizationSettingTable {
  organizationId: string;
  riskSettings: JsonValue;
  version: Generated<number>;
  updatedAt: GeneratedTimestamp;
}

export interface UserTable {
  id: string;
  email: string;
  displayName: string;
  oidcSubject: string | null;
  createdAt: GeneratedTimestamp;
}

export interface OrganizationMembershipTable {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  preferredLanguage: string;
  active: Generated<boolean>;
}

export interface AnimalGroupTable {
  id: string;
  organizationId: string;
  name: string;
  createdAt: GeneratedTimestamp;
}

export interface DeviceTable {
  id: string;
  organizationId: string;
  hardwareId: string;
  status: DeviceConnectionStatus;
  lastSeenAt: Timestamp | null;
  batteryPercent: number | null;
  signalStrength: number | null;
  updatedAt: GeneratedTimestamp;
}

export interface AnimalTable {
  id: string;
  organizationId: string;
  officialId: string;
  displayName: string;
  groupId: string | null;
  deviceId: string | null;
  lactationPhase: LactationPhase;
  parity: number;
  lastCalvingAt: Timestamp | null;
  expectedCalvingAt: Timestamp | null;
  archivedAt: Timestamp | null;
  createdAt: GeneratedTimestamp;
}

export interface TelemetrySampleTable {
  id: string;
  organizationId: string;
  animalId: string;
  deviceId: string;
  externalSampleId: string;
  metric: TelemetryMetric;
  value: number;
  unit: string;
  occurredAt: Timestamp;
  receivedAt: Timestamp;
  source: string;
}

export interface AnimalEventTable {
  id: string;
  organizationId: string;
  animalId: string;
  externalEventId: string;
  type: AnimalEventType;
  occurredAt: Timestamp;
  receivedAt: Timestamp;
  source: string;
  schemaVersion: number;
  payload: JsonValue;
  createdAt: GeneratedTimestamp;
}

export interface HealthCaseTable {
  id: string;
  organizationId: string;
  animalId: string;
  priority: Priority;
  status: HealthCaseStatus;
  score: number;
  currentRiskAssessmentId: string | null;
  openedAt: Timestamp;
  acknowledgedAt: Timestamp | null;
  resolvedAt: Timestamp | null;
  resolution: string | null;
  version: Generated<number>;
  updatedAt: GeneratedTimestamp;
}

export interface RiskAssessmentTable {
  id: string;
  organizationId: string;
  healthCaseId: string;
  rulesetVersion: number;
  windowStart: Timestamp;
  windowEnd: Timestamp;
  score: number;
  priority: Priority;
  reasons: JsonValue;
  consideredEventIds: JsonValue;
  createdAt: GeneratedTimestamp;
}

export interface HealthCaseEventTable {
  id: string;
  organizationId: string;
  healthCaseId: string;
  actorUserId: string | null;
  type: string;
  data: JsonValue;
  createdAt: GeneratedTimestamp;
}

export interface SopTable {
  id: string;
  organizationId: string;
  name: string;
  active: Generated<boolean>;
  createdAt: GeneratedTimestamp;
}

export interface SopVersionTable {
  id: string;
  organizationId: string;
  sopId: string;
  version: number;
  title: string;
  instructions: string;
  triggerPriority: Priority;
  dueMinutes: number;
  createdAt: GeneratedTimestamp;
}

export interface TaskTable {
  id: string;
  organizationId: string;
  healthCaseId: string;
  sopVersionId: string | null;
  title: string;
  instructions: string;
  assigneeUserId: string | null;
  dueAt: Timestamp;
  status: TaskStatus;
  resolution: string | null;
  diagnosisCode: string | null;
  version: Generated<number>;
  createdAt: GeneratedTimestamp;
  updatedAt: GeneratedTimestamp;
  completedAt: Timestamp | null;
}

export interface TaskCommentTable {
  id: string;
  organizationId: string;
  taskId: string;
  authorUserId: string;
  body: string;
  createdAt: GeneratedTimestamp;
}

export interface InboxMessageTable {
  consumerName: string;
  eventId: string;
  topic: string;
  partition: number;
  offsetValue: string;
  processedAt: GeneratedTimestamp;
}

export interface OutboxMessageTable {
  id: string;
  organizationId: string;
  topic: string;
  eventKey: string;
  payload: JsonValue;
  attempts: Generated<number>;
  createdAt: GeneratedTimestamp;
  publishedAt: Timestamp | null;
  lastError: string | null;
}

export interface AuditLogTable {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  data: JsonValue;
  createdAt: GeneratedTimestamp;
}

export interface Database {
  organization: OrganizationTable;
  organizationSetting: OrganizationSettingTable;
  user: UserTable;
  organizationMembership: OrganizationMembershipTable;
  animalGroup: AnimalGroupTable;
  device: DeviceTable;
  animal: AnimalTable;
  telemetrySample: TelemetrySampleTable;
  animalEvent: AnimalEventTable;
  healthCase: HealthCaseTable;
  riskAssessment: RiskAssessmentTable;
  healthCaseEvent: HealthCaseEventTable;
  sop: SopTable;
  sopVersion: SopVersionTable;
  task: TaskTable;
  taskComment: TaskCommentTable;
  inboxMessage: InboxMessageTable;
  outboxMessage: OutboxMessageTable;
  auditLog: AuditLogTable;
}
