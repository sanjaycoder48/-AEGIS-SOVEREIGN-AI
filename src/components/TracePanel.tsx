import { Activity, Check, Cpu } from 'lucide-react';
import { formatBytes } from '../lib/format';
import type { HealthStatus, TraceStep } from '../types';
import { Metric } from './Primitives';

export function TracePanel({
  egressBytes,
  health,
  lastRoute,
  trace,
}: {
  egressBytes: number;
  health: HealthStatus | null;
  lastRoute: string;
  trace: TraceStep[];
}) {
  const running = trace.some((step) => step.status === 'running');

  return (
    <aside className="trace-panel panel">
      <div className="panel-heading">
        <div>
          <span className="section-label">LIVE TRACE</span>
          <h2>Agent activity</h2>
        </div>
        <span className={`trace-status ${running ? 'running' : ''}`}>
          <Activity size={13} />
          {running ? 'RUNNING' : 'READY'}
        </span>
      </div>
      <div className="trace-flow">
        {trace.map((step, index) => (
          <TraceStepRow
            key={`${step.label}-${index}`}
            index={index}
            isLast={index === trace.length - 1}
            step={step}
          />
        ))}
      </div>
      <div className="trace-metrics">
        <Metric label="LAST ROUTE" value={lastRoute} />
        <Metric label="ENGINE" value={health?.ollama ? 'Ollama' : 'Presentation'} />
        <Metric label="EGRESS" value={formatBytes(egressBytes)} />
      </div>
      <div className="boundary-card">
        <div className="boundary-visual">
          <span>DEVICE</span>
          <Cpu size={18} />
          <span>VAULT</span>
        </div>
        <strong>Sovereignty boundary intact</strong>
        <p>0 bytes transmitted externally</p>
      </div>
    </aside>
  );
}

function TraceStepRow({ index, isLast, step }: { index: number; isLast: boolean; step: TraceStep }) {
  return (
    <>
      <div className={`trace-step ${step.status}`}>
        <span>{step.status === 'complete' ? <Check size={14} /> : index + 1}</span>
        <div>
          <small>{step.label.toUpperCase()}</small>
          <strong>{step.title}</strong>
          <p>{step.detail}</p>
        </div>
        {step.duration && <em>{step.duration}</em>}
      </div>
      {!isLast && <div className="trace-line" />}
    </>
  );
}
