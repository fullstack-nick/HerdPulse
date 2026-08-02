export const CASE_FIELDS = `
  id status priority score version openedAt acknowledgedAt resolvedAt resolution updatedAt
  animal { id officialId displayName lactationPhase parity group { id name } device { id hardwareId status lastSeenAt batteryPercent signalStrength } }
  riskAssessment { id score priority rulesetVersion windowStart windowEnd reasons { code points detail } consideredEventIds createdAt }
  tasks { id title instructions status dueAt isOverdue version assigneeId assigneeName animalId animalName caseId priority resolution diagnosisCode completedAt comments { id body authorName createdAt } }
  timeline { id kind title detail occurredAt }
`;
export const TASK_FIELDS = `id title instructions status dueAt isOverdue version assigneeId assigneeName animalId animalName caseId priority resolution diagnosisCode completedAt comments { id body authorName createdAt }`;
