import { Code2, Cpu, Download, Eye, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fileType, formatAction, formatBytes, formatDate } from '../lib/format';
import type { AuditEvent, HealthStatus, VaultDocument } from '../types';
import { Tag } from './Primitives';

export function DocumentsView({ documents, onUploadClick }: { documents: VaultDocument[]; onUploadClick: () => void }) {
  return (
    <section className="secondary-view">
      <div className="page-intro">
        <div>
          <span className="section-label">LOCAL KNOWLEDGE</span>
          <h2>Knowledge vault</h2>
          <p>Encrypted documents available to authorized agents.</p>
        </div>
        <button className="primary-action" type="button" onClick={onUploadClick}>
          <Plus size={16} />
          Add document
        </button>
      </div>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Classification</th>
              <th>Status</th>
              <th>Chunks</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {documents.length ? documents.map((document) => (
              <tr key={document.id}>
                <td>
                  <strong>{document.title || document.filename}</strong>
                  <small>{fileType(document)} - {formatBytes(document.size_bytes)}</small>
                </td>
                <td><Tag tone="red">CONFIDENTIAL</Tag></td>
                <td><Tag tone={document.volatile ? 'neutral' : 'green'}>{document.volatile ? 'STAGED' : 'INDEXED'}</Tag></td>
                <td>{document.chunks || 1}</td>
                <td>{formatDate(document.created_at)}</td>
              </tr>
            )) : (
              <tr><td colSpan={5}>Upload a PDF, TXT, MD or CSV file to start the vault.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AuditView({ audit, onExport }: { audit: AuditEvent[]; onExport: () => void }) {
  return (
    <section className="secondary-view">
      <div className="page-intro">
        <div>
          <span className="section-label">GOVERNANCE</span>
          <h2>Immutable audit trail</h2>
          <p>Every access, tool call and model response is recorded locally.</p>
        </div>
        <button className="outline-action" type="button" onClick={onExport}>
          <Download size={16} />
          Export log
        </button>
      </div>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {audit.length ? audit.map((event, index) => (
              <tr key={event.id ?? `${event.timestamp}-${index}`}>
                <td>{formatDate(event.timestamp)}</td>
                <td>{event.action === 'DOCUMENT_INDEXED' ? 'Vault service' : 'Secure Operator'}</td>
                <td>{formatAction(event.action)}</td>
                <td>{event.resource || 'Local knowledge vault'}</td>
                <td>
                  <Tag tone={['ALLOWED', 'SUCCESS', 'SEEDED'].includes(event.result) ? 'green' : 'neutral'}>
                    {event.result || 'RECORDED'}
                  </Tag>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={5}>No audit events have been recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ModelsView({ health }: { health: HealthStatus | null }) {
  const models: Array<{
    icon: LucideIcon;
    status: string;
    title: string;
    copy: string;
    size: string;
    lane: string;
    active: boolean;
  }> = [
    {
      icon: Cpu,
      status: health?.ollama ? 'OLLAMA' : 'FALLBACK',
      title: 'Qwen 2.5 7B',
      copy: 'Document reasoning and structured drafting.',
      size: '4.7 GB',
      lane: 'Text',
      active: true,
    },
    {
      icon: Eye,
      status: 'AVAILABLE',
      title: 'Qwen2.5-VL 7B',
      copy: 'Scanned drawings, charts and visual inspection.',
      size: '5.4 GB',
      lane: 'Vision',
      active: false,
    },
    {
      icon: Code2,
      status: 'AVAILABLE',
      title: 'DeepSeek Coder 6.7B',
      copy: 'Internal code review and secure generation.',
      size: '3.8 GB',
      lane: 'Code',
      active: false,
    },
  ];

  return (
    <section className="secondary-view">
      <div className="page-intro">
        <div>
          <span className="section-label">OPEN-WEIGHT MODELS</span>
          <h2>Model registry</h2>
          <p>Hot-swappable local models selected by task and hardware capacity.</p>
        </div>
      </div>
      <div className="model-grid">
        {models.map(({ icon: Icon, status, title, copy, size, lane, active }) => (
          <article className={`model-card ${active ? 'active-model-card' : ''}`} key={title}>
            <div>
              <span className="model-logo"><Icon size={20} /></span>
              <Tag tone={active ? 'green' : 'neutral'}>{status}</Tag>
            </div>
            <h3>{title}</h3>
            <p>{copy}</p>
            <footer>
              <span>{size}</span>
              <strong>{lane}</strong>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
