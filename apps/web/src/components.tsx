import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  Radio,
  WifiOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { HealthCase, Task } from './types';

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`badge priority-${priority.toLowerCase()}`}>
      <span className="badge-dot" />
      {priority.toLowerCase()}
    </span>
  );
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      {status.replaceAll('_', ' ').toLowerCase()}
    </span>
  );
}
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <CheckCircle2 size={32} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <span />
      <span />
      <span />
    </div>
  );
}
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="error-card">
      <WifiOff />
      <div>
        <strong>Local services are not reachable</strong>
        <p>{message}</p>
        <code>pnpm infra:up · pnpm db:migrate · pnpm db:seed · pnpm dev</code>
      </div>
    </div>
  );
}
export function TimeAgo({ value }: { value: string }) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  return (
    <>
      {minutes < 60
        ? `${minutes}m ago`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)}h ago`
          : `${Math.floor(minutes / 1440)}d ago`}
    </>
  );
}
export function CaseRow({ item }: { item: HealthCase }) {
  return (
    <Link className="case-row" to={`/cases/${item.id}`}>
      <span className={`case-indicator priority-${item.priority.toLowerCase()}-bg`} />
      <div className="animal-avatar">{item.animal.displayName.slice(0, 1)}</div>
      <div className="case-main">
        <strong>{item.animal.displayName}</strong>
        <span>
          {item.animal.officialId} ·{' '}
          {item.animal.group?.name || item.animal.lactationPhase.toLowerCase()}
        </span>
      </div>
      <PriorityBadge priority={item.priority} />
      <div className="score">
        <small>risk</small>
        <strong>{item.score}</strong>
      </div>
      <div className="case-time">
        <Radio size={14} />
        <TimeAgo value={item.updatedAt} />
      </div>
      <ArrowRight size={18} className="row-arrow" />
    </Link>
  );
}
export function TaskCard({ item, compact = false }: { item: Task; compact?: boolean }) {
  return (
    <Link className={`task-card ${compact ? 'compact' : ''}`} to={`/cases/${item.caseId}`}>
      <div className="task-check">
        {item.status === 'COMPLETED' ? (
          <CheckCircle2 />
        ) : item.isOverdue ? (
          <AlertTriangle />
        ) : (
          <Circle />
        )}
      </div>
      <div className="task-copy">
        <strong>{item.title}</strong>
        <span>
          {item.animalName} · {item.assigneeName || 'Unassigned'}
        </span>
      </div>
      <div className={`due ${item.isOverdue ? 'overdue' : ''}`}>
        <Clock3 size={14} />
        {item.isOverdue
          ? 'Overdue'
          : new Date(item.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </Link>
  );
}
