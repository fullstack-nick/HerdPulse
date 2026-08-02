import { Activity, Bell, ClipboardCheck, Gauge, Menu, Settings, UsersRound, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { roles, useSession, type DemoRole } from './session';

const links = [
  ['/', 'Overview', Gauge],
  ['/cases', 'Health cases', Bell],
  ['/tasks', 'Tasks', ClipboardCheck],
  ['/animals', 'Animals', UsersRound],
  ['/system', 'System', Settings],
] as const;

export function Layout() {
  const [open, setOpen] = useState(false);
  const { role, setRole } = useSession();
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">
            <Activity />
          </span>
          <span>
            Herd<strong>Pulse</strong>
          </span>
          <button className="icon-button close-menu" onClick={() => setOpen(false)}>
            <X />
          </button>
        </div>
        <div className="farm-switch">
          <div className="farm-icon">MR</div>
          <div>
            <small>WORKSPACE</small>
            <strong>Meadow Ridge</strong>
          </div>
        </div>
        <nav>
          {links.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <label>
            View as demo role
            <select value={role} onChange={(event) => setRole(event.target.value as DemoRole)}>
              {roles.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <small>
            <span className="live-dot" />
            Local services
          </small>
        </div>
      </aside>
      {open && (
        <button className="scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />
      )}
      <main>
        <header className="topbar">
          <button className="icon-button menu" onClick={() => setOpen(true)}>
            <Menu />
          </button>
          <div>
            <small>MEADOW RIDGE DAIRY</small>
            <strong>Operations</strong>
          </div>
          <div className="top-actions">
            <span className="connected">
              <span />
              LIVE
            </span>
            <div className="user-avatar">{role.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>
        <div className="page">
          <Outlet />
        </div>
      </main>
      <nav className="mobile-nav">
        {links.slice(0, 4).map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon />
            <span>{label.split(' ')[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
