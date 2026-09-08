import { Check, Code2, Cpu, Download, Eye, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MODEL_CATALOG } from '../lib/constants';
import { fileType, formatAction, formatBytes, formatDate } from '../lib/format';
import type { AuditEvent, HealthStatus, ModelId, ModelLane, VaultDocument } from '../types';
import { Tag } from './Primitives';

const MODEL_ICONS: Record<ModelLane, LucideIcon> = {
  Text: Cpu,
  Vision: Eye,
  Code: Code2,
};

export function DocumentsView({
  documents,
  selectedIds,
  onSelectDocument,
  onUploadClick,
}: {
  documents: VaultDocument[];
  selectedIds: Set<string>;
  onSelectDocument: (documentId: string) => void;
  onUploadClick: () => void;
}) {
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
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {documents.length ? documents.map((document) => (
              <tr className={selectedIds.has(document.id) ? 'selected-row' : ''} key={document.id}>
                <td>
                  <strong>{document.title || document.filename}</strong>
                  <small>{fileType(document)} - {formatBytes(document.size_bytes)}</small>
                </td>
                <td><Tag tone="red">CONFIDENTIAL</Tag></td>
                <td><Tag tone={document.volatile ? 'neutral' : 'green'}>{document.volatile ? 'STAGED' : 'INDEXED'}</Tag></td>
                <td>{document.chunks || 1}</td>
                <td>{formatDate(document.created_at)}</td>
                <td>
                  <button className="row-action" type="button" onClick={() => onSelectDocument(document.id)}>
                    {selectedIds.has(document.id) ? <Check size={14} /> : <Plus size={14} />}
                    {selectedIds.has(document.id) ? 'Active' : 'Use'}
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={6}>Upload a PDF, TXT, MD or CSV file to start the vault.</td></tr>
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
        <a
          aria-disabled={!audit.length}
          className="outline-action"
          download="aegis_audit.csv"
          href="/api/audit/export"
          onClick={(event) => {
            if (!audit.length) event.preventDefault();
            onExport();
          }}
        >
          <Download size={16} />
          Export log
        </a>
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

export function ModelsView({
  health,
  selectedModelId,
  onSelectModel,
}: {
  health: HealthStatus | null;
  selectedModelId: ModelId;
  onSelectModel: (modelId: ModelId) => void;
}) {
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
        {MODEL_CATALOG.map((model) => {
          const active = model.id === selectedModelId;
          const Icon = MODEL_ICONS[model.lane];
          const status = active ? 'ACTIVE' : model.id === 'qwen2.5:7b' && health?.ollama ? 'OLLAMA' : 'AVAILABLE';

          return (
          <button
            aria-pressed={active}
            className={`model-card ${active ? 'active-model-card' : ''}`}
            key={model.id}
            type="button"
            onClick={() => onSelectModel(model.id)}
          >
            <div>
              <span className="model-logo"><Icon size={20} /></span>
              <Tag tone={active ? 'green' : 'neutral'}>{status}</Tag>
            </div>
            <h3>{model.title}</h3>
            <p>{model.copy}</p>
            <footer>
              <span>{model.size}</span>
              <strong>{model.lane}</strong>
              <span className="model-action">{active ? 'Selected' : 'Use model'}</span>
            </footer>
          </button>
          );
        })}
      </div>
    </section>
  );
}
