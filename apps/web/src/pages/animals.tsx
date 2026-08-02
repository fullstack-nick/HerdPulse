import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ORGANIZATION_ID } from '../api';
import { ErrorState, Loading, PriorityBadge } from '../components';
import { useApiQuery } from '../hooks';
import type { Animal } from '../types';

const query = `query Animals($organizationId: ID!) { animals(organizationId: $organizationId) { id officialId displayName lactationPhase parity group { id name } device { id hardwareId status lastSeenAt batteryPercent signalStrength } activeCase { id priority score status } } }`;
export function AnimalsPage() {
  const [search, setSearch] = useState('');
  const result = useApiQuery<{ animals: Animal[] }>(
    query,
    { organizationId: ORGANIZATION_ID },
    'animals',
  );
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <ErrorState message={result.error || 'No data'} />;
  const animals = result.data.animals.filter((item) =>
    `${item.displayName} ${item.officialId}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">HERD DIRECTORY</div>
          <h1>Animals</h1>
          <p>Identity, lifecycle context, device status, and health state.</p>
        </div>
      </section>
      <label className="search-box">
        <Search size={18} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name or official ID"
        />
      </label>
      <div className="animal-grid">
        {animals.map((animal) => (
          <Link className="animal-card" to={`/animals/${animal.id}`} key={animal.id}>
            <div className="animal-card-head">
              <div className="animal-avatar large">{animal.displayName.slice(0, 1)}</div>
              {animal.activeCase ? (
                <PriorityBadge priority={animal.activeCase.priority} />
              ) : (
                <span className="clear-badge">clear</span>
              )}
            </div>
            <h3>{animal.displayName}</h3>
            <p>{animal.officialId}</p>
            <dl>
              <div>
                <dt>Group</dt>
                <dd>{animal.group?.name}</dd>
              </div>
              <div>
                <dt>Phase</dt>
                <dd>{animal.lactationPhase.toLowerCase()}</dd>
              </div>
              <div>
                <dt>Device</dt>
                <dd>
                  <span className={`device-dot ${animal.device?.status.toLowerCase()}`} />
                  {animal.device?.status.toLowerCase()}
                </dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
    </>
  );
}
