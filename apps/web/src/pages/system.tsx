import { Box, Database, RadioTower, RefreshCw, ShieldCheck } from 'lucide-react';

export function SystemPage() {
  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">LOCAL DEVELOPMENT</div>
          <h1>System & demo lab</h1>
          <p>The complete stack runs on this machine; no hosted services are required.</p>
        </div>
      </section>
      <div className="system-grid">
        {[
          [
            Database,
            'PostgreSQL',
            'Authoritative tenant, herd, case, task, inbox, outbox, and audit data',
            'localhost:5432',
          ],
          [
            RadioTower,
            'Kafka',
            'Partitioned telemetry, alerts, device heartbeats, changes, and dead letters',
            'localhost:9092',
          ],
          [
            RefreshCw,
            'Redis',
            'Latest values and low-latency subscription fan-out',
            'localhost:6379',
          ],
          [
            ShieldCheck,
            'Keycloak',
            'Optional local OIDC realm plus fast demo-role tokens',
            'localhost:8080',
          ],
        ].map(([Icon, title, text, address]) => (
          <section className="panel system-card" key={String(title)}>
            <Icon />
            <h2>{String(title)}</h2>
            <p>{String(text)}</p>
            <code>{String(address)}</code>
          </section>
        ))}
      </div>
      <section className="panel lab">
        <div>
          <Box />
          <h2>Brownfield incident exercises</h2>
          <p>Isolated commands prove recovery behavior without keeping mainline code broken.</p>
        </div>
        <div className="commands">
          <code>pnpm demo</code>
          <span>High-risk story + duplicate + out-of-order data</span>
          <code>pnpm --filter @herdpulse/simulator incident:duplicate</code>
          <span>Five deliveries, one durable effect</span>
          <code>pnpm --filter @herdpulse/simulator incident:schema</code>
          <span>Malformed version routes to dead letter</span>
          <code>pnpm --filter @herdpulse/simulator replay:dlq</code>
          <span>Repair and replay with a new event ID</span>
        </div>
      </section>
    </>
  );
}
