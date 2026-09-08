import { Check, FileText, Plus, Search, Upload } from 'lucide-react';
import type { ChangeEvent, DragEvent } from 'react';
import { useMemo } from 'react';
import { ACCEPTED_UPLOADS } from '../lib/constants';
import { fileType, formatBytes } from '../lib/format';
import type { VaultDocument } from '../types';
import { Metric } from './Primitives';

export function VaultPanel({
  auditCount,
  chunkTotal,
  documentSearch,
  documents,
  dragActive,
  selectedDocuments,
  selectedIds,
  uploading,
  onDocumentSearch,
  onDragActive,
  onSelectDocument,
  onUpload,
}: {
  auditCount: number;
  chunkTotal: number;
  documentSearch: string;
  documents: VaultDocument[];
  dragActive: boolean;
  selectedDocuments: VaultDocument[];
  selectedIds: Set<string>;
  uploading: boolean;
  onDocumentSearch: (value: string) => void;
  onDragActive: (active: boolean) => void;
  onSelectDocument: (documentId: string, additive: boolean) => void;
  onUpload: (file?: File) => Promise<void>;
}) {
  const visibleDocuments = useMemo(() => {
    const query = documentSearch.trim().toLowerCase();
    if (!query) return documents;

    return documents.filter((document) => {
      const searchTarget = `${document.title} ${document.filename}`.toLowerCase();
      return searchTarget.includes(query);
    });
  }, [documentSearch, documents]);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    onDragActive(false);
    void onUpload(event.dataTransfer.files[0]);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    void onUpload(event.target.files?.[0]);
    event.target.value = '';
  };

  return (
    <section className="vault-panel panel">
      <div className="panel-heading">
        <div>
          <span className="section-label">CONTEXT</span>
          <h2>Secure documents</h2>
        </div>
        <span className="count">{documents.length} {documents.length === 1 ? 'FILE' : 'FILES'}</span>
      </div>

      <label
        className={`dropzone ${dragActive ? 'dragging' : ''} ${uploading ? 'busy' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          onDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          onDragActive(false);
        }}
        onDrop={handleDrop}
      >
        <input type="file" accept={ACCEPTED_UPLOADS} onChange={handleInput} />
        <span className="upload-icon">
          <Upload size={19} />
        </span>
        <strong>{uploading ? 'Encrypting and indexing...' : 'Drop confidential files here'}</strong>
        <small>PDF, TXT, MD or CSV up to 20 MB - processed locally</small>
        <span className="browse">Browse files</span>
      </label>

      <div className="vault-tools">
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="Filter documents"
            placeholder="Filter vault..."
            type="search"
            value={documentSearch}
            onChange={(event) => onDocumentSearch(event.target.value)}
          />
        </label>
        <span>{selectedDocuments.length ? `${selectedDocuments.length} source${selectedDocuments.length === 1 ? '' : 's'} active` : 'No source selected'}</span>
      </div>

      <div className="doc-list">
        {visibleDocuments.length ? visibleDocuments.map((document) => (
          <DocumentCard
            key={document.id}
            document={document}
            selected={selectedIds.has(document.id)}
            onSelect={(additive) => onSelectDocument(document.id, additive)}
          />
        )) : (
          <div className="empty-state">No matching documents in the local vault.</div>
        )}
      </div>

      <div className="vault-stats">
        <Metric label="LOCAL INDEX" value={`${chunkTotal} ${chunkTotal === 1 ? 'chunk' : 'chunks'}`} />
        <Metric label="ENCRYPTION" value="AES-256" />
        <Metric label="AUDIT EVENTS" value={`${auditCount} logged`} />
      </div>
    </section>
  );
}

function DocumentCard({
  document,
  selected,
  onSelect,
}: {
  document: VaultDocument;
  selected: boolean;
  onSelect: (additive: boolean) => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`document ${selected ? 'selected' : ''}`}
      type="button"
      onClick={(event) => onSelect(event.ctrlKey || event.metaKey)}
    >
      <span className="file-icon">{fileType(document)}</span>
      <span className="file-copy">
        <strong>{document.title || document.filename}</strong>
        <small>{fileType(document)} - {formatBytes(document.size_bytes)} - {document.chunks || 1} chunks</small>
        <span className="indexed">
          {selected ? <Check size={13} /> : <FileText size={13} />}
          {document.volatile ? 'Staged for session' : 'Indexed locally'}
        </span>
      </span>
      <span className="document-state">{selected ? <Check size={16} /> : <Plus size={16} />}</span>
    </button>
  );
}
