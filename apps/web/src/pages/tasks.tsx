import { useState } from 'react';
import { ORGANIZATION_ID } from '../api';
import { EmptyState, ErrorState, Loading, TaskCard } from '../components';
import { useApiQuery } from '../hooks';
import { TASK_FIELDS } from '../queries';
import type { Task } from '../types';

const query = `query Tasks($organizationId: ID!) { tasks(organizationId: $organizationId) { ${TASK_FIELDS} } }`;
export function TasksPage() {
  const [filter, setFilter] = useState('OPEN');
  const result = useApiQuery<{ tasks: Task[] }>(
    query,
    { organizationId: ORGANIZATION_ID },
    'tasks',
  );
  if (result.loading) return <Loading />;
  if (result.error || !result.data) return <ErrorState message={result.error || 'No data'} />;
  const tasks = result.data.tasks.filter(
    (item) =>
      filter === 'ALL' ||
      (filter === 'OPEN' ? item.status !== 'COMPLETED' : item.status === filter),
  );
  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">FIELD WORK</div>
          <h1>Tasks</h1>
          <p>A focused work queue for the connected team.</p>
        </div>
      </section>
      <div className="filter-tabs">
        {['OPEN', 'CLAIMED', 'COMPLETED', 'ALL'].map((item) => (
          <button
            className={filter === item ? 'active' : ''}
            key={item}
            onClick={() => setFilter(item)}
          >
            {item.toLowerCase()}
          </button>
        ))}
      </div>
      <div className="task-grid">
        {tasks.map((item) => (
          <TaskCard key={item.id} item={item} />
        ))}
      </div>
      {!tasks.length && (
        <EmptyState
          title="No tasks here"
          body="New tasks are orchestrated from qualifying health cases."
        />
      )}
    </>
  );
}
