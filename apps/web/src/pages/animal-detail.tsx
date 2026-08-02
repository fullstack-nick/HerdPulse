import { ArrowLeft, Radio } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ORGANIZATION_ID } from '../api';
import { ErrorState, Loading, PriorityBadge } from '../components';
import { mutate, useApiQuery } from '../hooks';
import { useSession } from '../session';
import type { Animal } from '../types';

interface Point {
  id: string;
  metric: string;
  value: number;
  unit: string;
  occurredAt: string;
}
const query = `query Animal($organizationId: ID!, $id: ID!) { animal(organizationId: $organizationId, id: $id) { id officialId displayName lactationPhase parity group { id name } device { id hardwareId status lastSeenAt batteryPercent signalStrength } activeCase { id priority score status } } telemetry(organizationId: $organizationId, animalId: $id, hours: 24) { id metric value unit occurredAt } }`;
const RECORD = `mutation Event($organizationId: ID!, $animalId: ID!, $eventType: String!) { recordAnimalEvent(organizationId: $organizationId, animalId: $animalId, eventType: $eventType) { ok message entityId } }`;
const colors: Record<string, string> = {
  TEMPERATURE: '#d35f45',
  RUMINATION: '#40786a',
  ACTIVITY: '#bf8b35',
  DRINKING: '#397da3',
};
export function AnimalDetailPage() {
  const { id = '' } = useParams();
  const { token, role } = useSession();
  const result = useApiQuery<{ animal: Animal; telemetry: Point[] }>(
    query,
    { organizationId: ORGANIZATION_ID, id },
    `animal-${id}`,
  );
  if (result.loading) return <Loading />;
  if (result.error || !result.data?.animal)
    return <ErrorState message={result.error || 'Animal not found'} />;
  const { animal, telemetry } = result.data;
  const grouped = Object.entries(
    telemetry.reduce<Record<string, Point[]>>((groups, point) => {
      (groups[point.metric] ??= []).push(point);
      return groups;
    }, {}),
  );
  return (
    <>
      <Link to="/animals" className="back-link">
        <ArrowLeft size={16} />
        Back to animals
      </Link>
      <section className="animal-hero">
        <div className="animal-avatar xl">{animal.displayName.slice(0, 1)}</div>
        <div>
          <div className="case-kicker">
            {animal.activeCase ? (
              <PriorityBadge priority={animal.activeCase.priority} />
            ) : (
              <span className="clear-badge">no active case</span>
            )}
          </div>
          <h1>{animal.displayName}</h1>
          <p>
            {animal.officialId} · {animal.group?.name} · {animal.lactationPhase.toLowerCase()}
          </p>
        </div>
        {['manager', 'owner', 'vet'].includes(role) && (
          <button
            className="secondary-button animal-event-button"
            onClick={async () => {
              await mutate(
                RECORD,
                {
                  organizationId: ORGANIZATION_ID,
                  animalId: animal.id,
                  eventType: 'TEMPERATURE_INCREASE',
                },
                token,
              );
              window.alert('Health event queued for processing.');
            }}
          >
            <Radio size={16} />
            Record signal
          </button>
        )}
      </section>
      <div className="telemetry-grid">
        {grouped.map(([metric, points]) => (
          <section className="panel chart-panel" key={metric}>
            <div className="panel-title">
              <div>
                <h2>{metric.toLowerCase()}</h2>
                <p>Last 24 hours · {points.at(-1)?.unit.toLowerCase().replaceAll('_', ' ')}</p>
              </div>
              <strong style={{ color: colors[metric] }}>
                {points.at(-1)?.value.toFixed(metric === 'TEMPERATURE' ? 1 : 0)}
              </strong>
            </div>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points}>
                  <CartesianGrid stroke="#e7e9e4" vertical={false} />
                  <XAxis
                    dataKey="occurredAt"
                    tickFormatter={(value) =>
                      new Date(String(value)).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    }
                    minTickGap={40}
                    tick={{ fill: '#78827b', fontSize: 11 }}
                  />
                  <YAxis
                    domain={['dataMin - 1', 'dataMax + 1']}
                    tick={{ fill: '#78827b', fontSize: 11 }}
                    width={38}
                  />
                  <Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString()} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={colors[metric] || '#40786a'}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
