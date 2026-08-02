import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  Clock3,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ORGANIZATION_ID } from '../api';
import { ErrorState, Loading, PriorityBadge, StatusBadge, TimeAgo } from '../components';
import { mutate, useApiQuery } from '../hooks';
import { CASE_FIELDS } from '../queries';
import { useSession } from '../session';
import type { HealthCase, Task } from '../types';

const query = `query Case($organizationId: ID!, $id: ID!) { healthCase(organizationId: $organizationId, id: $id) { ${CASE_FIELDS} } }`;
const ACK = `mutation Ack($organizationId: ID!, $id: ID!, $version: Int!) { acknowledgeCase(organizationId: $organizationId, id: $id, expectedVersion: $version) { ok message } }`;
const CLAIM = `mutation Claim($organizationId: ID!, $id: ID!, $version: Int!) { claimTask(organizationId: $organizationId, id: $id, expectedVersion: $version) { ok message } }`;
const COMPLETE = `mutation Complete($organizationId: ID!, $id: ID!, $version: Int!, $resolution: String!) { completeTask(organizationId: $organizationId, id: $id, expectedVersion: $version, resolution: $resolution) { ok message } }`;
const RESOLVE = `mutation Resolve($organizationId: ID!, $id: ID!, $version: Int!, $resolution: String!) { resolveCase(organizationId: $organizationId, id: $id, expectedVersion: $version, resolution: $resolution) { ok message } }`;
const COMMENT = `mutation Comment($organizationId: ID!, $taskId: ID!, $body: String!) { addTaskComment(organizationId: $organizationId, taskId: $taskId, body: $body) { ok message } }`;

export function CaseDetailPage() {
  const { id = '' } = useParams();
  const { token, role } = useSession();
  const result = useApiQuery<{ healthCase: HealthCase }>(
    query,
    { organizationId: ORGANIZATION_ID, id },
    `case-${id}`,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function action(document: string, variables: Record<string, unknown>, success: string) {
    setBusy(true);
    setMessage('');
    try {
      await mutate(document, { organizationId: ORGANIZATION_ID, ...variables }, token);
      setMessage(success);
      await result.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  if (result.loading) return <Loading />;
  if (result.error || !result.data?.healthCase)
    return <ErrorState message={result.error || 'Case not found'} />;
  const item = result.data.healthCase;
  const canResolve = ['manager', 'owner', 'vet'].includes(role);
  return (
    <>
      <Link to="/cases" className="back-link">
        <ArrowLeft size={16} />
        Back to cases
      </Link>
      <section className="case-hero">
        <div>
          <div className="case-kicker">
            <PriorityBadge priority={item.priority} />
            <StatusBadge status={item.status} />
          </div>
          <h1>{item.animal.displayName}</h1>
          <p>
            {item.animal.officialId} · {item.animal.group?.name} · parity {item.animal.parity}
          </p>
        </div>
        <div className="hero-score">
          <small>RISK SCORE</small>
          <strong>{item.score}</strong>
          <span>ruleset v{item.riskAssessment?.rulesetVersion || 1}</span>
        </div>
      </section>
      {message && <div className="toast-inline">{message}</div>}
      <div className="case-detail-grid">
        <div className="detail-column">
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>Why this case is prioritized</h2>
                <p>Every point is traceable to a signal or context rule.</p>
              </div>
              <Sparkles />
            </div>
            <div className="reason-list">
              {item.riskAssessment?.reasons.map((reason) => (
                <div className="reason" key={reason.code}>
                  <span>+{reason.points}</span>
                  <div>
                    <strong>{reason.code.replaceAll('_', ' ').toLowerCase()}</strong>
                    <small>{reason.detail || 'Configured health signal'}</small>
                  </div>
                </div>
              ))}
            </div>
            <div className="assessment-window">
              <ShieldCheck size={16} />
              Assessment window:{' '}
              {new Date(item.riskAssessment?.windowStart || item.openedAt).toLocaleString()} –{' '}
              {new Date(item.riskAssessment?.windowEnd || item.updatedAt).toLocaleString()}
            </div>
          </section>
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>Orchestrated work</h2>
                <p>Claim, document, and complete in one place.</p>
              </div>
              <ClipboardCheck />
            </div>
            {item.tasks.map((task) => (
              <TaskDetail key={task.id} task={task} busy={busy} onAction={action} />
            ))}
            {!item.tasks.length && <p className="muted">No task is required at this risk level.</p>}
          </section>
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>Case history</h2>
                <p>Immutable operational timeline</p>
              </div>
              <Clock3 />
            </div>
            <div className="timeline">
              {item.timeline.map((event) => (
                <div key={event.id}>
                  <span />
                  <div>
                    <strong>{event.title}</strong>
                    <p>{event.detail}</p>
                    <small>
                      <TimeAgo value={event.occurredAt} /> ·{' '}
                      {new Date(event.occurredAt).toLocaleString()}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="detail-aside">
          <section className="panel action-panel">
            <h3>Next action</h3>
            {item.status === 'OPEN' && (
              <button
                disabled={busy}
                className="primary-button"
                onClick={() =>
                  action(ACK, { id: item.id, version: item.version }, 'Case acknowledged.')
                }
              >
                <Check size={17} />
                Acknowledge case
              </button>
            )}
            {item.status !== 'RESOLVED' && canResolve && (
              <button
                disabled={busy}
                className="secondary-button"
                onClick={() =>
                  action(
                    RESOLVE,
                    {
                      id: item.id,
                      version: item.version,
                      resolution: 'Assessment complete; animal stable and follow-up documented.',
                    },
                    'Case resolved.',
                  )
                }
              >
                <ShieldCheck size={17} />
                Resolve case
              </button>
            )}
            {item.status === 'RESOLVED' && (
              <div className="resolved-box">
                <Check />
                Resolved<p>{item.resolution}</p>
              </div>
            )}
          </section>
          <section className="panel animal-summary">
            <h3>Animal & device</h3>
            <dl>
              <div>
                <dt>Phase</dt>
                <dd>{item.animal.lactationPhase.toLowerCase()}</dd>
              </div>
              <div>
                <dt>Group</dt>
                <dd>{item.animal.group?.name}</dd>
              </div>
              <div>
                <dt>Device</dt>
                <dd>{item.animal.device?.hardwareId}</dd>
              </div>
              <div>
                <dt>Connection</dt>
                <dd>
                  <span className={`device-dot ${item.animal.device?.status.toLowerCase()}`} />
                  {item.animal.device?.status.toLowerCase()}
                </dd>
              </div>
              <div>
                <dt>Battery</dt>
                <dd>{item.animal.device?.batteryPercent}%</dd>
              </div>
            </dl>
            <Link className="text-link" to={`/animals/${item.animal.id}`}>
              View telemetry →
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}

function TaskDetail({
  task,
  busy,
  onAction,
}: {
  task: Task;
  busy: boolean;
  onAction: (
    document: string,
    variables: Record<string, unknown>,
    success: string,
  ) => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  return (
    <article className="task-detail">
      <div className="task-detail-head">
        <div>
          <StatusBadge status={task.status} />
          <h3>{task.title}</h3>
        </div>
        <span className={task.isOverdue ? 'overdue' : ''}>
          <Clock3 size={14} />
          {new Date(task.dueAt).toLocaleString()}
        </span>
      </div>
      <p>{task.instructions}</p>
      <div className="task-actions">
        {task.status === 'OPEN' && (
          <button
            disabled={busy}
            className="secondary-button"
            onClick={() => onAction(CLAIM, { id: task.id, version: task.version }, 'Task claimed.')}
          >
            Claim task
          </button>
        )}
        {task.status !== 'COMPLETED' && (
          <button
            disabled={busy}
            className="primary-button"
            onClick={() =>
              onAction(
                COMPLETE,
                {
                  id: task.id,
                  version: task.version,
                  resolution: 'Animal observed; findings recorded and follow-up planned.',
                },
                'Task completed.',
              )
            }
          >
            <Check size={16} />
            Complete
          </button>
        )}
      </div>
      {task.comments.map((entry) => (
        <div className="comment" key={entry.id}>
          <MessageSquare size={15} />
          <div>
            <strong>{entry.authorName}</strong>
            <p>{entry.body}</p>
          </div>
        </div>
      ))}
      {task.status !== 'COMPLETED' && (
        <form
          className="comment-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (comment.trim())
              void onAction(COMMENT, { taskId: task.id, body: comment }, 'Comment added.').then(
                () => setComment(''),
              );
          }}
        >
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Add a field note…"
          />
          <button disabled={!comment.trim() || busy}>Add</button>
        </form>
      )}
    </article>
  );
}
