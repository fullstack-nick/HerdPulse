export interface Device {
  id: string;
  hardwareId: string;
  status: string;
  lastSeenAt?: string;
  batteryPercent?: number;
  signalStrength?: number;
}
export interface Animal {
  id: string;
  officialId: string;
  displayName: string;
  lactationPhase: string;
  parity: number;
  group?: { id: string; name: string };
  device?: Device;
  activeCase?: HealthCase;
}
export interface RiskReason {
  code: string;
  points: number;
  detail?: string;
}
export interface Risk {
  id: string;
  score: number;
  priority: string;
  rulesetVersion: number;
  windowStart: string;
  windowEnd: string;
  reasons: RiskReason[];
  consideredEventIds: string[];
  createdAt: string;
}
export interface Comment {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
}
export interface Task {
  id: string;
  title: string;
  instructions: string;
  status: string;
  dueAt: string;
  isOverdue: boolean;
  version: number;
  assigneeId?: string;
  assigneeName?: string;
  animalId: string;
  animalName: string;
  caseId: string;
  priority: string;
  resolution?: string;
  diagnosisCode?: string;
  completedAt?: string;
  comments: Comment[];
}
export interface HealthCase {
  id: string;
  status: string;
  priority: string;
  score: number;
  version: number;
  openedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  resolution?: string;
  updatedAt: string;
  animal: Animal;
  riskAssessment?: Risk;
  tasks: Task[];
  timeline: { id: string; kind: string; title: string; detail?: string; occurredAt: string }[];
}
export interface Dashboard {
  totalAnimals: number;
  activeCases: number;
  highPriorityCases: number;
  openTasks: number;
  overdueTasks: number;
  offlineDevices: number;
  cases: HealthCase[];
  tasks: Task[];
}
