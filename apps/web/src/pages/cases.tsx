import { useState } from 'react';
import { ORGANIZATION_ID } from '../api';
import { CaseRow, EmptyState, ErrorState, Loading } from '../components';
import { useApiQuery } from '../hooks';
import { CASE_FIELDS } from '../queries';
import type { HealthCase } from '../types';

const query = `query Cases($organizationId: ID!) { healthCases(organizationId: $organizationId) { ${CASE_FIELDS} } }`;
export function CasesPage() {
  const [filter, setFilter] = useState('ACTIVE');
  const result = useApiQuery<{ healthCases: HealthCase[] }>(
    query,
    { organizationId: ORGANIZATION_ID },
    'cases',
  );
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <ErrorState message={result.error || 'No data'} />;
  const cases = result.data.healthCases.filter(
    (item) =>
      filter === 'ALL' ||
      (filter === 'ACTIVE' ? item.status !== 'RESOLVED' : item.priority === filter),
  );
  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">TRIAGE QUEUE</div>
          <h1>Health cases</h1>
          <p>Explainable risk, prioritized for action.</p>
        </div>
      </section>
      <div className="filter-tabs">
        {['ACTIVE', 'HIGH', 'MEDIUM', 'ALL'].map((item) => (
          <button
            className={filter === item ? 'active' : ''}
            key={item}
            onClick={() => setFilter(item)}
          >
            {item.toLowerCase()}
          </button>
        ))}
      </div>
      <section className="panel case-panel">
        {cases.length ? (
          <div className="case-list">
            {cases.map((item) => (
              <CaseRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing in this view"
            body="Try another filter or run the demo scenario."
          />
        )}
      </section>
    </>
  );
}
