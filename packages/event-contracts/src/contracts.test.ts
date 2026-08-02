import { describe, expect, it } from 'vitest';
import { animalEventSchema, eventKey } from './index.js';

describe('event contracts', () => {
  it('validates a versioned animal event and creates a stable partition key', () => {
    const event = animalEventSchema.parse({
      eventId: 'event-1',
      eventType: 'TEMPERATURE_INCREASE',
      schemaVersion: 1,
      organizationId: 'org-1',
      animalId: 'animal-1',
      officialId: 'DE001',
      occurredAt: '2026-08-02T10:00:00.000Z',
      receivedAt: '2026-08-02T10:00:01.000Z',
      correlationId: 'correlation-1',
      source: 'test',
      data: { value: 1.2, unit: 'DELTA_CELSIUS' },
    });

    expect(event.eventType).toBe('TEMPERATURE_INCREASE');
    expect(eventKey(event.organizationId, event.animalId)).toBe('org-1:animal-1');
  });
});
