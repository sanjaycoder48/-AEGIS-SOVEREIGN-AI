import type { ReactNode } from 'react';

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

export function Tag({ children, tone }: { children: ReactNode; tone: 'green' | 'red' | 'neutral' }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

export function Toast({ message }: { message: string | null }) {
  return <div className={`toast ${message ? 'show' : ''}`} role="status">{message}</div>;
}
