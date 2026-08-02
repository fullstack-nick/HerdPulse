import { HealthCaseStatus, TaskStatus } from './types.js';

const healthCaseTransitions: Record<HealthCaseStatus, HealthCaseStatus[]> = {
  [HealthCaseStatus.OPEN]: [HealthCaseStatus.ACKNOWLEDGED, HealthCaseStatus.RESOLVED],
  [HealthCaseStatus.ACKNOWLEDGED]: [HealthCaseStatus.IN_PROGRESS, HealthCaseStatus.RESOLVED],
  [HealthCaseStatus.IN_PROGRESS]: [HealthCaseStatus.RESOLVED],
  [HealthCaseStatus.RESOLVED]: [HealthCaseStatus.OPEN],
};

const taskTransitions: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.OPEN]: [TaskStatus.CLAIMED, TaskStatus.CANCELLED],
  [TaskStatus.CLAIMED]: [TaskStatus.COMPLETED, TaskStatus.OPEN, TaskStatus.CANCELLED],
  [TaskStatus.COMPLETED]: [],
  [TaskStatus.CANCELLED]: [],
};

export function assertHealthCaseTransition(from: HealthCaseStatus, to: HealthCaseStatus): void {
  if (!healthCaseTransitions[from].includes(to)) {
    throw new Error(`Invalid health case transition: ${from} -> ${to}`);
  }
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!taskTransitions[from].includes(to)) {
    throw new Error(`Invalid task transition: ${from} -> ${to}`);
  }
}
