# Local operations runbook

## Fast health check

1. `docker compose ps` — PostgreSQL, Redis, Kafka, and Keycloak should be healthy/running.
2. `curl http://localhost:4000/health` — API process is alive.
3. `curl http://localhost:4000/ready` — API can query PostgreSQL.
4. `curl http://localhost:4001/health` — worker process and message counters.
5. `docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list` — expected topics exist.

## Message is not reflected in the UI

Check worker counters, then inspect unpublished outbox records:

```sql
select topic, attempts, last_error, created_at
from outbox_message
where published_at is null
order by created_at;
```

Restarting the worker is safe. Its durable inbox rejects repeat event IDs and its outbox relay resumes unpublished messages. Manager/owner users can also run the `replayOutbox` GraphQL mutation after the underlying dependency is healthy.

## Invalid event and replay

Run `pnpm --filter @herdpulse/simulator incident:schema`, observe the worker failure counter and the `animal.event.dlq.v1` topic, then run `pnpm --filter @herdpulse/simulator replay:dlq`. The replay utility repairs the fixture, retains its original event ID for idempotency, preserves the business timestamp, and republishes it.

## Optional observability

Start `docker compose --profile observability up -d`. Prometheus is at `http://localhost:9090`, Grafana at `http://localhost:3000` (`admin` / `herdpulse`), and Jaeger at `http://localhost:16686`. Prometheus scrapes the local API and worker through `host.docker.internal`.
