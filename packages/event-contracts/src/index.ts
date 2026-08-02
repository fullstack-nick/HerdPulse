import { z } from 'zod';

export const topics = {
  animalEventReceived: 'animal.event.received.v1',
  telemetrySampleReceived: 'telemetry.sample.received.v1',
  deviceStatusReceived: 'device.status.received.v1',
  healthCaseChanged: 'health-case.changed.v1',
  taskChanged: 'task.changed.v1',
  deadLetter: 'animal.event.dlq.v1',
} as const;

const baseEnvelope = z.object({
  eventId: z.string().min(1),
  schemaVersion: z.literal(1),
  organizationId: z.string().min(1),
  occurredAt: z.iso.datetime({ offset: true }),
  receivedAt: z.iso.datetime({ offset: true }),
  correlationId: z.string().min(1),
  traceparent: z.string().optional(),
  source: z.string().min(1),
});

export const animalEventTypes = [
  'TEMPERATURE_INCREASE',
  'TEMPERATURE_DROP',
  'RUMINATION_DECREASE',
  'INSUFFICIENT_WATER_INTAKE',
  'DRINKING_CYCLES_INCREASED',
  'ACTIVITY_INCREASE',
  'ACTIVITY_DROP',
  'HEAT_STRESS',
  'IMMINENT_CALVING',
  'HEAT_DETECTED',
  'INSEMINATION_RECORDED',
  'PREGNANCY_RESULT_RECORDED',
  'CALVING_CONFIRMED',
  'DIAGNOSIS_RECORDED',
] as const;

export const animalEventSchema = baseEnvelope.extend({
  eventType: z.enum(animalEventTypes),
  animalId: z.string().min(1),
  officialId: z.string().min(1),
  deviceId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export const telemetrySampleSchema = baseEnvelope.extend({
  animalId: z.string().min(1),
  deviceId: z.string().min(1),
  metric: z.enum(['TEMPERATURE', 'RUMINATION', 'ACTIVITY', 'DRINKING', 'PH']),
  value: z.number().finite(),
  unit: z.string().min(1),
});

export const deviceStatusSchema = baseEnvelope.extend({
  deviceId: z.string().min(1),
  animalId: z.string().optional(),
  status: z.enum(['ONLINE', 'STALE', 'OFFLINE']),
  batteryPercent: z.number().min(0).max(100).optional(),
  signalStrength: z.number().optional(),
});

export const entityChangeSchema = baseEnvelope.extend({
  entityId: z.string().min(1),
  entityVersion: z.number().int().positive(),
  changeType: z.enum(['CREATED', 'UPDATED', 'RESOLVED', 'COMPLETED']),
  data: z.record(z.string(), z.unknown()),
});

export const deadLetterSchema = z.object({
  deadLetterId: z.string().min(1),
  originalTopic: z.string().min(1),
  originalPartition: z.number().int().nonnegative(),
  originalOffset: z.string(),
  failedAt: z.iso.datetime({ offset: true }),
  attempts: z.number().int().positive(),
  category: z.string().min(1),
  error: z.string().min(1),
  originalRecord: z.string(),
});

export type AnimalEventMessage = z.infer<typeof animalEventSchema>;
export type TelemetrySampleMessage = z.infer<typeof telemetrySampleSchema>;
export type DeviceStatusMessage = z.infer<typeof deviceStatusSchema>;
export type EntityChangeMessage = z.infer<typeof entityChangeSchema>;
export type DeadLetterMessage = z.infer<typeof deadLetterSchema>;

export function eventKey(organizationId: string, animalId: string): string {
  return `${organizationId}:${animalId}`;
}
