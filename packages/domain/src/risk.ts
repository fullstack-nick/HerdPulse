import {
  LactationPhase,
  Priority,
  type AnimalContext,
  type RiskAssessmentResult,
  type RiskEvent,
  type RiskSettings,
} from './types.js';

const HOUR_MS = 60 * 60 * 1000;

export function priorityForScore(score: number, settings: RiskSettings): Priority {
  if (score >= settings.highThreshold) return Priority.HIGH;
  if (score >= settings.mediumThreshold) return Priority.MEDIUM;
  return Priority.LOW;
}

export function calculateRisk(input: {
  animal: AnimalContext;
  events: RiskEvent[];
  settings: RiskSettings;
  now: Date;
  reopenedWithin24Hours?: boolean;
}): RiskAssessmentResult {
  const { animal, settings, now } = input;
  const windowStart = new Date(now.getTime() - settings.windowHours * HOUR_MS);
  const events = input.events
    .filter((event) => event.occurredAt >= windowStart && event.occurredAt <= now)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const reasons: RiskAssessmentResult['reasons'] = [];
  const types = new Set<string>();

  for (const event of events) {
    if (types.has(event.type)) continue;
    types.add(event.type);
    const points = settings.eventWeights[event.type] ?? 0;
    if (points > 0) {
      reasons.push({
        code: event.type,
        points,
        detail: { occurredAt: event.occurredAt.toISOString() },
      });
    }
  }

  if (types.size >= 2 && settings.differentTypeBonus > 0) {
    reasons.push({
      code: 'MULTIPLE_ALERT_TYPES',
      points: settings.differentTypeBonus,
      detail: { distinctTypes: types.size },
    });
  }

  if (
    (animal.lactationPhase === LactationPhase.FRESH ||
      animal.lactationPhase === LactationPhase.CLOSE_UP) &&
    settings.transitionPhaseBonus > 0
  ) {
    reasons.push({
      code: 'TRANSITION_PHASE',
      points: settings.transitionPhaseBonus,
      detail: { lactationPhase: animal.lactationPhase },
    });
  }

  if (input.reopenedWithin24Hours && settings.reopenedCaseBonus > 0) {
    reasons.push({ code: 'RECENTLY_REOPENED', points: settings.reopenedCaseBonus });
  }

  const score = reasons.reduce((total, reason) => total + reason.points, 0);
  return {
    score,
    priority: priorityForScore(score, settings),
    reasons,
    consideredEventIds: events.map((event) => event.id),
    windowStart,
    windowEnd: now,
  };
}

export function shouldCreateTask(priority: Priority, settings: RiskSettings): boolean {
  const rank = { [Priority.LOW]: 0, [Priority.MEDIUM]: 1, [Priority.HIGH]: 2 };
  return rank[priority] >= rank[settings.taskMinimumPriority];
}
