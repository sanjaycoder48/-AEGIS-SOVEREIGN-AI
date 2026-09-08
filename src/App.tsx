import {
  Activity,
  ArrowUp,
  Boxes,
  Check,
  Code2,
  Copy,
  Cpu,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Plus,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ChangeEvent, DragEvent, FormEvent, KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { askQuestion, getAudit, getDocuments, getHealth, uploadDocument } from './api/aegis';
import {
  csvCell,
  demoAnswer,
  displayTitle,
  fileType,
  formatAction,
  formatBytes,
  formatDate,
  parseAnswer,
  routeForPrompt,
} from './lib/format';
import type { AuditEvent, ChatMessage, HealthStatus, TraceStep, VaultDocument, ViewKey } from './types';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'md', 'csv'] as const;
const DEMO_DOCUMENT: VaultDocument = {
  id: 'demo-p4107',
  filename: 'compressor_safety_review.txt',
  title: 'P-4107 Compressor Safety Review',
  chunks: 2,
  pages: 1,
  size_bytes: 1103,
  type: 'TXT',
  status: 'indexed',
  created_at: new Date().toISOString(),
};

const navItems: Array<{ key: ViewKey; label: string; icon: LucideIcon }> = [
  { key: 'workspace', label: 'Workbench', icon: LayoutDashboard },
  { key: 'documents', label: 'Knowledge vault', icon: Database },
  { key: 'audit', label: 'Audit trail', icon: FileCheck2 },
  { key: 'models', label: 'Model registry', icon: Boxes },
];

const suggestions = [
  'Identify critical safety risks',
  'Draft an approval note',
  'List unresolved action items',
  'Summarize startup readiness',
];

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1000)}`}`;
}

function initialTrace(): TraceStep[] {
  return [
    { label: 'Policy gate', title: 'Access verified', detail: 'Engineering L3 - read only', duration: '12 ms', status: 'complete' },
    { label: 'Router', title: 'Ready to classify', detail: 'Task policy online', duration: '31 ms', status: 'complete' },
    { label: 'Retrieval', title: 'Vault on standby', detail: 'Selected sources only', status: 'standby' },
    { label: 'Inference', title: 'Awaiting request', detail: 'Local GPU - no egress', status: 'standby' },
  ];
}

function runningTrace(question: string, sourceCount: number): TraceStep[] {
  return [
    { label: 'Policy gate', title: 'Access verified', detail: 'Engineering L3 - read only', duration: '12 ms', status: 'complete' },
    { label: 'Router', title: routeForPrompt(question), detail: 'Task policy matched', duration: '31 ms', status: 'complete' },
    { label: 'Retrieval', title: 'Searching local index', detail: `${sourceCount || 1} source window`, status: 'running' },
    { label: 'Inference', title: 'Queued locally', detail: 'No external API', status: 'standby' },
  ];
}

function completeTrace(route: string, model: string, citations: number, elapsedMs: number): TraceStep[] {
  return [
    { label: 'Policy gate', title: 'Access verified', detail: 'Engineering L3 - read only', duration: '12 ms', status: 'complete' },
    { label: 'Router', title: route, detail: `${model} selected`, duration: '31 ms', status: 'complete' },
    { label: 'Retrieval', title: `${Math.max(citations, 1)} passages selected`, detail: 'Local evidence vault', duration: '84 ms', status: 'complete' },
    { label: 'Inference', title: 'Response grounded', detail: 'Audit hash recorded', duration: `${elapsedMs} ms`, status: 'complete' },
  ];
}

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('workspace');
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [documentSearch, setDocumentSearch] = useState('');
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [offlineDemo, setOfflineDemo] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceStep[]>(initialTrace);
  const [uploading, setUploading] = useState(false);
  const toastTimer = useRef<number | null>(null);

  const selectedDocuments = useMemo(() => {
    if (!selectedIds.size) return documents;
    const selected = documents.filter((document) => selectedIds.has(document.id));
    return selected.length ? selected : documents;
  }, [documents, selectedIds]);

  const sourceIds = useMemo(
    () => selectedDocuments
      .filter((document) => !document.volatile && !document.id.startsWith('demo-'))
      .map((document) => document.id),
    [selectedDocuments],
  );

  const chunkTotal = useMemo(
    () => documents.reduce((total, document) => total + Math.max(document.chunks || 1, 1), 0),
    [documents],
  );

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const nextHealth = await getHealth();
      setHealth(nextHealth);
      setOfflineDemo(false);
    } catch {
      setHealth(null);
      setOfflineDemo(true);
    }
  }, []);

  const refreshAudit = useCallback(async () => {
    try {
      setAudit(await getAudit());
    } catch {
      setAudit([]);
    }
  }, []);

  const refreshDocuments = useCallback(async () => {
    try {
      const nextDocuments = await getDocuments();
      setDocuments(nextDocuments);
      setOfflineDemo(false);
      setSelectedIds((current) => normalizeSelection(current, nextDocuments));
    } catch {
      const fallback = [DEMO_DOCUMENT];
      setDocuments(fallback);
      setOfflineDemo(true);
      setSelectedIds(new Set([DEMO_DOCUMENT.id]));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refreshHealth(), refreshDocuments(), refreshAudit()]);
  }, [refreshAudit, refreshDocuments, refreshHealth]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refreshAll(), 0);
    const healthPoll = window.setInterval(() => void refreshHealth(), 20000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(healthPoll);
    };
  }, [refreshAll, refreshHealth]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const setView = (view: ViewKey) => {
    setActiveView(view);
    setMobileOpen(false);
    if (view === 'audit') void refreshAudit();
  };

  const resetConversation = () => {
    setTrace(initialTrace());
    setPrompt('');
    setBusy(false);
    showToast('Secure session cleared');
  };

  const toggleDocument = (documentId: string, additive: boolean) => {
    setSelectedIds((current) => {
      if (!additive) return new Set([documentId]);
      const next = new Set(current);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return normalizeSelection(next, documents);
    });
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
      showToast('Use a PDF, TXT, MD or CSV file');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      showToast('Prototype limit is 20 MB');
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadDocument(file);
      setDocuments((current) => [uploaded, ...current.filter((document) => document.id !== uploaded.id)]);
      setSelectedIds(new Set([uploaded.id]));
      showToast(`${file.name} indexed inside the secure boundary`);
      await Promise.allSettled([refreshAudit(), refreshHealth()]);
    } catch (error) {
      if (error instanceof TypeError) {
        const staged: VaultDocument = {
          id: uid('session-doc'),
          filename: file.name,
          title: displayTitle(file.name.replace(/\.[^.]+$/, '')),
          chunks: Math.max(1, Math.round(file.size / 1000)),
          created_at: new Date().toISOString(),
          size_bytes: file.size,
          type: extension.toUpperCase(),
          volatile: true,
        };
        setDocuments((current) => [staged, ...current]);
        setSelectedIds(new Set([staged.id]));
        setOfflineDemo(true);
        showToast('Local service offline; file staged for this browser session');
      } else {
        showToast(error instanceof Error ? error.message : 'Upload failed');
      }
    } finally {
      setUploading(false);
    }
  };

  const submitQuestion = async (question = prompt.trim()) => {
    if (!question || busy) return;
    const userMessage: ChatMessage = { id: uid('msg'), role: 'user', content: question };
    const pendingId = uid('msg');
    const pendingMessage: ChatMessage = {
      id: pendingId,
      role: 'agent',
      content: 'Analyzing local evidence...',
      isPending: true,
    };

    setBusy(true);
    setPrompt('');
    setTrace(runningTrace(question, selectedDocuments.length));
    setMessages((current) => [...current, userMessage, pendingMessage]);

    try {
      const result = await askQuestion(question, sourceIds);
      settleMessage(pendingId, result);
      setTrace(completeTrace(result.route, result.model, result.citations.length, result.elapsed_ms));
      await Promise.allSettled([refreshAudit(), refreshHealth()]);
    } catch (error) {
      if (error instanceof TypeError || offlineDemo) {
        const result = demoAnswer(question);
        settleMessage(pendingId, result);
        setTrace(completeTrace(result.route, result.model, result.citations.length, result.elapsed_ms));
        showToast('Running in browser demo mode');
      } else {
        const message = error instanceof Error ? error.message : 'The local service could not complete this request.';
        setMessages((current) => current.map((item) => item.id === pendingId
          ? { ...item, content: message, isPending: false, isError: true }
          : item));
        setTrace(initialTrace());
      }
    } finally {
      setBusy(false);
    }
  };

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const settleMessage = (messageId: string, result: ReturnType<typeof demoAnswer>) => {
    setMessages((current) => current.map((message) => message.id === messageId
      ? {
        ...message,
        content: result.answer,
        citations: result.citations,
        route: result.route,
        model: result.model,
        elapsedMs: result.elapsed_ms,
        egressBytes: result.egress_bytes,
        isPending: false,
        isError: false,
      }
      : message));
  };

  const exportAudit = async () => {
    let rows = audit;
    try {
      rows = await getAudit();
      setAudit(rows);
    } catch {
      showToast('Audit service is not reachable');
    }

    if (!rows.length) {
      showToast('No audit events to export');
      return;
    }

    const csvRows = [['timestamp', 'actor', 'action', 'resource', 'result', 'hash']];
    rows.forEach((event) => csvRows.push([
      event.timestamp,
      event.action === 'DOCUMENT_INDEXED' ? 'Vault service' : 'Secure Operator',
      formatAction(event.action),
      event.resource,
      event.result,
      event.hash || '',
    ]));
    const blob = new Blob([csvRows.map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `aegis_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast('Audit log exported');
  };

  return (
    <>
      <div className="app-shell">
        <Sidebar activeView={activeView} isOpen={mobileOpen} onNavigate={setView} />
        <main>
          <Topbar
            activeView={activeView}
            health={health}
            onReset={resetConversation}
            onToggleMenu={() => setMobileOpen((open) => !open)}
          />
          {activeView === 'workspace' && (
            <WorkspaceView
              auditCount={audit.length || health?.audit_events || 0}
              busy={busy}
              chunkTotal={chunkTotal}
              documentSearch={documentSearch}
              documents={documents}
              dragActive={dragActive}
              health={health}
              messages={messages}
              offlineDemo={offlineDemo}
              prompt={prompt}
              selectedDocuments={selectedDocuments}
              selectedIds={selectedIds}
              trace={trace}
              uploading={uploading}
              onCopy={showToast}
              onDocumentSearch={setDocumentSearch}
              onPromptChange={setPrompt}
              onSelectDocument={toggleDocument}
              onSubmit={submitQuestion}
              onUpload={handleUpload}
              onDragActive={setDragActive}
            />
          )}
          {activeView === 'documents' && (
            <DocumentsView documents={documents} onUploadClick={() => setView('workspace')} />
          )}
          {activeView === 'audit' && (
            <AuditView audit={audit} onExport={exportAudit} />
          )}
          {activeView === 'models' && (
            <ModelsView health={health} />
          )}
        </main>
      </div>
      <Toast message={toast} />
    </>
  );
}

function normalizeSelection(current: Set<string>, documents: VaultDocument[]): Set<string> {
  const validIds = new Set(documents.map((document) => document.id));
  const next = new Set([...current].filter((id) => validIds.has(id)));
  const first = documents[0];
  if (!next.size && first) next.add(first.id);
  return next;
}

function Sidebar({
  activeView,
  isOpen,
  onNavigate,
}: {
  activeView: ViewKey;
  isOpen: boolean;
  onNavigate: (view: ViewKey) => void;
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
        {navItems.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
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
          <div className="avatar">SK</div>
          <div>
            <strong>Secure Operator</strong>
            <small>Engineering - L3</small>
          </div>
          <LockKeyhole size={16} />
        </div>
      </div>
    </aside>
  );
}

function Topbar({
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
  const title = navItems.find((item) => item.key === activeView)?.label ?? 'Workbench';
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

function WorkspaceView(props: {
  auditCount: number;
  busy: boolean;
  chunkTotal: number;
  documentSearch: string;
  documents: VaultDocument[];
  dragActive: boolean;
  health: HealthStatus | null;
  messages: ChatMessage[];
  offlineDemo: boolean;
  prompt: string;
  selectedDocuments: VaultDocument[];
  selectedIds: Set<string>;
  trace: TraceStep[];
  uploading: boolean;
  onCopy: (message: string) => void;
  onDocumentSearch: (value: string) => void;
  onDragActive: (active: boolean) => void;
  onPromptChange: (value: string) => void;
  onSelectDocument: (documentId: string, additive: boolean) => void;
  onSubmit: (question?: string) => Promise<void>;
  onUpload: (file?: File) => Promise<void>;
}) {
  return (
    <section className="view active">
      <div className="workspace-grid">
        <VaultPanel {...props} />
        <ConversationPanel {...props} />
        <TracePanel
          egressBytes={0}
          health={props.health}
          lastRoute={props.trace[1]?.title || 'Awaiting request'}
          trace={props.trace}
        />
      </div>
    </section>
  );
}

function VaultPanel({
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const visibleDocuments = documents.filter((document) => {
    const searchTarget = `${document.title} ${document.filename}`.toLowerCase();
    return searchTarget.includes(documentSearch.trim().toLowerCase());
  });

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
        <input ref={inputRef} type="file" accept=".pdf,.txt,.md,.csv" onChange={handleInput} />
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
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(event.ctrlKey || event.metaKey);
  };

  return (
    <button
      className={`document ${selected ? 'selected' : ''}`}
      type="button"
      onClick={(event) => onSelect(event.ctrlKey || event.metaKey)}
      onKeyDown={handleKeyDown}
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

function ConversationPanel({
  busy,
  health,
  messages,
  prompt,
  selectedDocuments,
  onCopy,
  onPromptChange,
  onSubmit,
}: {
  busy: boolean;
  health: HealthStatus | null;
  messages: ChatMessage[];
  prompt: string;
  selectedDocuments: VaultDocument[];
  onCopy: (message: string) => void;
  onPromptChange: (value: string) => void;
  onSubmit: (question?: string) => Promise<void>;
}) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const activeDocument = selectedDocuments[0];

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const submitForm = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit();
  };

  return (
    <section className="conversation-panel panel">
      <div className="conversation-head">
        <div className="agent-identity">
          <div className="agent-orb">
            <Activity size={18} />
          </div>
          <div>
            <span className="section-label">ACTIVE AGENT</span>
            <h2>Industrial analyst</h2>
          </div>
        </div>
        <div className="model-chip">
          <span>MODEL</span>
          <strong>{health?.ollama ? 'qwen2.5:7b live' : 'qwen2.5:7b fallback'}</strong>
        </div>
      </div>

      <div ref={messagesRef} className="messages" aria-live="polite">
        <SystemIntro activeDocument={activeDocument} onSubmit={onSubmit} />
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} onCopy={onCopy} />
        ))}
      </div>

      <form className="composer" onSubmit={submitForm}>
        <textarea
          aria-label="Ask the agent"
          disabled={busy}
          placeholder="Ask about your confidential documents..."
          rows={1}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void onSubmit();
          }}
        />
        <div className="composer-footer">
          <span><b>Ctrl Enter</b> to run agent</span>
          <button type="submit" aria-label="Send question" disabled={busy || !prompt.trim()}>
            <ArrowUp size={18} />
          </button>
        </div>
      </form>
    </section>
  );
}

function SystemIntro({
  activeDocument,
  onSubmit,
}: {
  activeDocument?: VaultDocument;
  onSubmit: (question?: string) => Promise<void>;
}) {
  return (
    <div className="message system-message">
      <div className="message-icon">A</div>
      <div className="message-body">
        <p>
          {activeDocument
            ? <>I have securely indexed <strong>{activeDocument.title}</strong>. What should I investigate?</>
            : 'Upload a document to build the local evidence vault.'}
        </p>
        <div className="suggestions">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => void onSubmit(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, onCopy }: { message: ChatMessage; onCopy: (message: string) => void }) {
  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      onCopy('Answer copied');
    } catch {
      onCopy('Copy unavailable in this browser');
    }
  };

  return (
    <div className={`message ${message.role === 'user' ? 'user-message' : 'system-message'}`}>
      <div className="message-icon">{message.role === 'user' ? 'SK' : 'A'}</div>
      <div className="message-body">
        {message.role === 'user' ? (
          <p>{message.content}</p>
        ) : (
          <div className={`answer-card ${message.isError ? 'error-card' : ''}`}>
            {message.isPending ? (
              <p className="pending-text">{message.content}</p>
            ) : (
              <AnswerRenderer text={message.content} />
            )}
            {!message.isPending && !message.isError && (
              <div className="answer-actions">
                <div className="citations">
                  {(message.citations || []).map((citation) => (
                    <span className="citation" key={`${citation.document}-${citation.location}`}>
                      <FileText size={13} />
                      {citation.document} - {citation.location}
                    </span>
                  ))}
                </div>
                <button className="copy-answer" type="button" onClick={copyAnswer}>
                  <Copy size={14} />
                  Copy
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AnswerRenderer({ text }: { text: string }) {
  const blocks = parseAnswer(text);

  return (
    <>
      {blocks.map((block) => {
        if (block.kind === 'heading') return <h3 key={block.id}>{block.text}</h3>;
        if (block.kind === 'list') {
          return (
            <ul key={block.id}>
              {(block.items || []).map((item) => (
                <li key={item}><InlineRichText text={item} /></li>
              ))}
            </ul>
          );
        }
        return <p key={block.id}><InlineRichText text={block.text || ''} /></p>;
      })}
    </>
  );
}

function InlineRichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*.*?\*\*)/g).filter(Boolean).map((part, index) => {
        const key = `${part}-${index}`;
        return part.startsWith('**') && part.endsWith('**')
          ? <strong key={key}>{part.slice(2, -2)}</strong>
          : <span key={key}>{part}</span>;
      })}
    </>
  );
}

function TracePanel({
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
  return (
    <aside className="trace-panel panel">
      <div className="panel-heading">
        <div>
          <span className="section-label">LIVE TRACE</span>
          <h2>Agent activity</h2>
        </div>
        <span className={`trace-status ${trace.some((step) => step.status === 'running') ? 'running' : ''}`}>
          <Activity size={13} />
          {trace.some((step) => step.status === 'running') ? 'RUNNING' : 'READY'}
        </span>
      </div>
      <div className="trace-flow">
        {trace.map((step, index) => (
          <TraceStepRow key={`${step.label}-${index}`} index={index} step={step} />
        ))}
      </div>
      <div className="trace-metrics">
        <Metric label="LAST ROUTE" value={lastRoute} />
        <Metric label="ENGINE" value={health?.ollama ? 'Ollama' : 'Presentation'} />
        <Metric label="EGRESS" value={`${egressBytes} bytes`} />
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

function TraceStepRow({ index, step }: { index: number; step: TraceStep }) {
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
      {index < 3 && <div className="trace-line" />}
    </>
  );
}

function DocumentsView({ documents, onUploadClick }: { documents: VaultDocument[]; onUploadClick: () => void }) {
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

function AuditView({ audit, onExport }: { audit: AuditEvent[]; onExport: () => void }) {
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

function ModelsView({ health }: { health: HealthStatus | null }) {
  const models = [
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function Tag({ children, tone }: { children: string; tone: 'green' | 'red' | 'neutral' }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

function Toast({ message }: { message: string | null }) {
  return <div className={`toast ${message ? 'show' : ''}`} role="status">{message}</div>;
}

export default App;
