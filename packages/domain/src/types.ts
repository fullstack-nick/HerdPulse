export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum HealthCaseStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
}

export enum TaskStatus {
  OPEN = 'OPEN',
  CLAIMED = 'CLAIMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum OrganizationRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  WORKER = 'WORKER',
  VET = 'VET',
  CONSULTANT = 'CONSULTANT',
}

export enum LactationPhase {
  HEIFER = 'HEIFER',
  CLOSE_UP = 'CLOSE_UP',
  FRESH = 'FRESH',
  LACTATING = 'LACTATING',
  DRY = 'DRY',
}

export enum AnimalEventType {
  TEMPERATURE_INCREASE = 'TEMPERATURE_INCREASE',
  TEMPERATURE_DROP = 'TEMPERATURE_DROP',
  RUMINATION_DECREASE = 'RUMINATION_DECREASE',
  INSUFFICIENT_WATER_INTAKE = 'INSUFFICIENT_WATER_INTAKE',
  DRINKING_CYCLES_INCREASED = 'DRINKING_CYCLES_INCREASED',
  ACTIVITY_INCREASE = 'ACTIVITY_INCREASE',
  ACTIVITY_DROP = 'ACTIVITY_DROP',
  HEAT_STRESS = 'HEAT_STRESS',
  IMMINENT_CALVING = 'IMMINENT_CALVING',
  HEAT_DETECTED = 'HEAT_DETECTED',
  INSEMINATION_RECORDED = 'INSEMINATION_RECORDED',
  PREGNANCY_RESULT_RECORDED = 'PREGNANCY_RESULT_RECORDED',
  CALVING_CONFIRMED = 'CALVING_CONFIRMED',
  DIAGNOSIS_RECORDED = 'DIAGNOSIS_RECORDED',
}

export enum TelemetryMetric {
  TEMPERATURE = 'TEMPERATURE',
  RUMINATION = 'RUMINATION',
  ACTIVITY = 'ACTIVITY',
  DRINKING = 'DRINKING',
  PH = 'PH',
}

export enum DeviceConnectionStatus {
  ONLINE = 'ONLINE',
  STALE = 'STALE',
  OFFLINE = 'OFFLINE',
}

export interface AnimalContext {
  id: string;
  organizationId: string;
  lactationPhase: LactationPhase;
  lastCalvingAt?: Date | null;
  expectedCalvingAt?: Date | null;
}

export interface RiskEvent {
  id: string;
  type: AnimalEventType;
  occurredAt: Date;
}

export interface RiskReason {
  code: string;
  points: number;
  detail?: Record<string, string | number | boolean>;
}

export interface RiskAssessmentResult {
  score: number;
  priority: Priority;
  reasons: RiskReason[];
  consideredEventIds: string[];
  windowStart: Date;
  windowEnd: Date;
}

export interface RiskSettings {
  rulesetVersion: number;
  windowHours: number;
  eventWeights: Partial<Record<AnimalEventType, number>>;
  differentTypeBonus: number;
  transitionPhaseBonus: number;
  reopenedCaseBonus: number;
  mediumThreshold: number;
  highThreshold: number;
  taskMinimumPriority: Priority;
}

export const defaultRiskSettings: RiskSettings = {
  rulesetVersion: 1,
  windowHours: 72,
  eventWeights: {
    [AnimalEventType.TEMPERATURE_INCREASE]: 2,
    [AnimalEventType.TEMPERATURE_DROP]: 2,
    [AnimalEventType.RUMINATION_DECREASE]: 2,
    [AnimalEventType.INSUFFICIENT_WATER_INTAKE]: 1,
    [AnimalEventType.DRINKING_CYCLES_INCREASED]: 1,
    [AnimalEventType.ACTIVITY_INCREASE]: 1,
    [AnimalEventType.ACTIVITY_DROP]: 1,
    [AnimalEventType.HEAT_STRESS]: 1,
    [AnimalEventType.IMMINENT_CALVING]: 2,
  },
  differentTypeBonus: 2,
  transitionPhaseBonus: 2,
  reopenedCaseBonus: 1,
  mediumThreshold: 3,
  highThreshold: 6,
  taskMinimumPriority: Priority.MEDIUM,
};
