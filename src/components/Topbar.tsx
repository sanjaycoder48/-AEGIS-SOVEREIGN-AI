import { Menu, RotateCcw, Server } from 'lucide-react';
import { VIEW_LABELS } from '../lib/constants';
import type { HealthStatus, ViewKey } from '../types';

export function Topbar({
  activeView,
  health,
  onReset,
  onToggleMenu,
}: {
  activeView: ViewKey;
  health: HealthStatus | null;
  onReset: () => void;
  onToggleMenu: () => void;
}) {
  const title = VIEW_LABELS[activeView] ?? 'Workbench';
  const healthLabel = health ? (health.ollama ? 'OLLAMA ONLINE' : 'SAFE FALLBACK') : 'LOCAL OFFLINE';

  return (
    <header className="topbar">
      <button className="mobile-menu" type="button" aria-label="Toggle navigation" onClick={onToggleMenu}>
        <Menu size={19} />
      </button>
      <div>
        <p className="eyebrow">MRPL - SECURE ENGINEERING ZONE</p>
        <h1>{title === 'Workbench' ? 'Agent workbench' : title}</h1>
      </div>
      <div className="top-actions">
        <div className={`health-chip ${health ? 'online' : 'offline'}`}>
          <Server size={14} />
          {healthLabel}
        </div>
        <div className="classification">
          <span />
          CONFIDENTIAL
        </div>
        <button className="icon-button" type="button" title="Start a new session" onClick={onReset}>
          <RotateCcw size={17} />
        </button>
      </div>
    </header>
  );
}
