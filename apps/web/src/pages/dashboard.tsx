import { Activity, AlertTriangle, ClipboardCheck, PawPrint, Radio, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ORGANIZATION_ID } from '../api';
import { CaseRow, EmptyState, ErrorState, Loading, TaskCard } from '../components';
import { useApiQuery } from '../hooks';
import { CASE_FIELDS, TASK_FIELDS } from '../queries';
import type { Dashboard } from '../types';

const query = `query Dashboard($organizationId: ID!) { dashboard(organizationId: $organizationId) { totalAnimals activeCases highPriorityCases openTasks overdueTasks offlineDevices cases { ${CASE_FIELDS} } tasks { ${TASK_FIELDS} } } }`;
export function DashboardPage() {
  const result = useApiQuery<{ dashboard: Dashboard }>(
    query,
    { organizationId: ORGANIZATION_ID },
    'dashboard',
  );
  if (result.loading) return <Loading />;
  if (result.error || !result.data)
    return <ErrorState message={result.error || 'No dashboard data'} />;
  const data = result.data.dashboard;
  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <Radio size={14} /> Live operation view
          </div>
          <h1>Good morning, Maya</h1>
          <p>Here’s what needs attention across your herd.</p>
        </div>
        <button className="secondary-button" onClick={result.reload}>
          <Activity size={16} />
          Refresh
        </button>
      </section>
      <section className="metrics">
        <div className="metric featured">
          <span>
            <AlertTriangle />
          </span>
          <div>
            <small>HIGH PRIORITY</small>
            <strong>{data.highPriorityCases}</strong>
            <p>{data.activeCases} active cases total</p>
          </div>
        </div>
        <div className="metric">
          <span>
            <ClipboardCheck />
          </span>
          <div>
            <small>OPEN TASKS</small>
            <strong>{data.openTasks}</strong>
            <p>{data.overdueTasks ? `${data.overdueTasks} overdue` : 'All on schedule'}</p>
          </div>
        </div>
        <div className="metric">
          <span>
            <WifiOff />
          </span>
          <div>
            <small>DEVICES TO CHECK</small>
            <strong>{data.offlineDevices}</strong>
            <p>Offline or stale</p>
          </div>
        </div>
        <div className="metric">
          <span>
            <PawPrint />
          </span>
          <div>
            <small>ANIMALS MONITORED</small>
            <strong>{data.totalAnimals}</strong>
            <p>Across 4 groups</p>
          </div>
        </div>
      </section>
      <div className="dashboard-grid">
        <section className="panel case-panel">
          <div className="panel-title">
            <div>
              <h2>Active health cases</h2>
              <p>Prioritized from recent signals</p>
            </div>
            <Link to="/cases">View all</Link>
          </div>
          {data.cases.length ? (
            <div className="case-list">
              {data.cases.map((item) => (
                <CaseRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Herd is clear"
              body="Run pnpm demo to create the interview scenario."
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Next tasks</h2>
              <p>Due soonest</p>
            </div>
            <Link to="/tasks">View all</Link>
          </div>
          {data.tasks.length ? (
            <div className="task-list">
              {data.tasks.map((item) => (
                <TaskCard key={item.id} item={item} compact />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No open tasks"
              body="Tasks appear when a case reaches the configured threshold."
            />
          )}
        </section>
      </div>
    </>
  );
}
