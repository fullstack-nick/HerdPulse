EXPLAIN (ANALYZE, BUFFERS)
SELECT id, animal_id, priority, score, status, updated_at
FROM health_case
WHERE organization_id = 'org-demo-farm'
  AND status <> 'RESOLVED'
ORDER BY updated_at DESC
LIMIT 8;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, health_case_id, assignee_user_id, status, due_at
FROM task
WHERE organization_id = 'org-demo-farm'
  AND status IN ('OPEN', 'CLAIMED')
ORDER BY due_at
LIMIT 8;
