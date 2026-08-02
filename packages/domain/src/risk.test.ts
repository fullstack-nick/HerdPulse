import { describe, expect, it } from 'vitest';
import {
  AnimalEventType,
  LactationPhase,
  Priority,
  calculateRisk,
  defaultRiskSettings,
  shouldCreateTask,
} from './index.js';

describe('risk calculation', () => {
  it('opens an explainable high-priority path for correlated transition-cow alerts', () => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const result = calculateRisk({
      now,
      settings: defaultRiskSettings,
      animal: {
        id: 'animal-1',
        organizationId: 'org-1',
        lactationPhase: LactationPhase.FRESH,
      },
      events: [
        {
          id: 'event-1',
          type: AnimalEventType.TEMPERATURE_INCREASE,
          occurredAt: new Date('2026-08-02T09:00:00.000Z'),
        },
        {
          id: 'event-2',
          type: AnimalEventType.RUMINATION_DECREASE,
          occurredAt: new Date('2026-08-02T09:40:00.000Z'),
        },
      ],
    });

    expect(result.priority).toBe(Priority.HIGH);
    expect(result.score).toBe(8);
    expect(result.reasons.map((reason) => reason.code)).toEqual([
      AnimalEventType.TEMPERATURE_INCREASE,
      AnimalEventType.RUMINATION_DECREASE,
      'MULTIPLE_ALERT_TYPES',
      'TRANSITION_PHASE',
    ]);
    expect(shouldCreateTask(result.priority, defaultRiskSettings)).toBe(true);
  });

  it('ignores old events and scores one event type only once', () => {
    const now = new Date('2026-08-02T10:00:00.000Z');
    const result = calculateRisk({
      now,
      settings: defaultRiskSettings,
      animal: {
        id: 'animal-1',
        organizationId: 'org-1',
        lactationPhase: LactationPhase.LACTATING,
      },
      events: [
        {
          id: 'old',
          type: AnimalEventType.TEMPERATURE_INCREASE,
          occurredAt: new Date('2026-07-20T10:00:00.000Z'),
        },
        {
          id: 'new-1',
          type: AnimalEventType.TEMPERATURE_INCREASE,
          occurredAt: new Date('2026-08-02T09:00:00.000Z'),
        },
        {
          id: 'new-2',
          type: AnimalEventType.TEMPERATURE_INCREASE,
          occurredAt: new Date('2026-08-02T09:30:00.000Z'),
        },
      ],
    });

    expect(result.score).toBe(2);
    expect(result.priority).toBe(Priority.LOW);
    expect(result.consideredEventIds).toEqual(['new-1', 'new-2']);
  });
});
