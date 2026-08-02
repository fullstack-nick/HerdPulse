# Incident exercise: dashboard query latency grew with the herd

## Safe reproduction model

This narrative records the brownfield diagnosis without preserving an N+1 defect in mainline. A naive resolver loaded animal, device, risk assessment, tasks, comments, and timeline independently for every case. Query count therefore grew linearly with queue length and connection-pool contention amplified the delay.

## Remediation

The portfolio dataset stays intentionally small, but the durable model has queue-focused indexes on cases, tasks, event windows, and telemetry curves. The UI asks for bounded queues. The follow-up production design would batch nested reads with per-request data loaders or use a dedicated dashboard projection once measured load justifies it.

## Local evidence command

Use `EXPLAIN (ANALYZE, BUFFERS)` on the active-case and due-task queries documented in `docs/performance/dashboard-query.sql`. The checked-in query targets the same predicates and ordering used by the dashboard.
