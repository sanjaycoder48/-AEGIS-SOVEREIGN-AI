import { Boxes, Database, FileCheck2, LayoutDashboard, LogOut, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { VIEW_LABELS } from '../lib/constants';
import type { AuthUser, ViewKey } from '../types';

const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: LucideIcon }> = [
  { key: 'workspace', label: VIEW_LABELS.workspace, icon: LayoutDashboard },
  { key: 'documents', label: VIEW_LABELS.documents, icon: Database },
  { key: 'audit', label: VIEW_LABELS.audit, icon: FileCheck2 },
  { key: 'models', label: VIEW_LABELS.models, icon: Boxes },
];

export function Sidebar({
  activeView,
  isOpen,
  onNavigate,
  onLogout,
  user,
}: {
  activeView: ViewKey;
  isOpen: boolean;
  onNavigate: (view: ViewKey) => void;
  onLogout: () => void;
  user: AuthUser;
}) {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <ShieldCheck size={18} strokeWidth={2.4} />
        </div>
        <div>
          <strong>AEGIS</strong>
          <small>SOVEREIGN AI</small>
        </div>
      </div>

      <nav aria-label="Main navigation">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            aria-current={activeView === key ? 'page' : undefined}
            className={`nav-item ${activeView === key ? 'active' : ''}`}
            type="button"
            onClick={() => onNavigate(key)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="security-card">
          <div className="status-line">
            <span className="pulse" />
            <b>AIR-GAPPED</b>
          </div>
          <p>All inference and storage remain inside this device.</p>
          <div className="security-meta">
            <span>Network egress</span>
            <strong>Blocked</strong>
          </div>
        </div>
        <div className="operator">
          <div className="avatar">{user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <small>@{user.username}</small>
          </div>
          <button className="operator-logout" type="button" title="Lock vault" aria-label="Lock vault" onClick={onLogout}><LogOut size={16} /></button>
        </div>
      </div>
    </aside>
  );
}
