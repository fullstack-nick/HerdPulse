# Incident exercise: duplicate delivery created repeat operational work

## Safe reproduction

`pnpm --filter @herdpulse/simulator incident:duplicate` sends one valid animal event five times with the same event ID. It is an isolated fixture; mainline code remains correct.

## Failure mode

Without a durable idempotency boundary, at-least-once Kafka delivery can repeat alert inserts, risk recalculations, cases, and barn tasks. An in-memory set is insufficient because it disappears on restart and does not coordinate multiple workers.

## Control

The worker inserts `(consumer_name, event_id)` into `inbox_message` inside the same PostgreSQL transaction as every domain effect. The composite primary key lets the first delivery proceed and makes later deliveries no-ops. A second uniqueness rule allows only one active case per organization and animal.

## Verification

After the fixture, query the inbox and active case/task counts for `animal-014`. There are five deliveries, one inbox row, at most one active case, and at most one open task. The worker duplicate counter increases by four.
