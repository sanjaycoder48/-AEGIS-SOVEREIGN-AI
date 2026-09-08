import type { ChatMessage, HealthStatus, TraceStep, VaultDocument } from '../types';
import { ConversationPanel } from './ConversationPanel';
import { TracePanel } from './TracePanel';
import { VaultPanel } from './VaultPanel';

export function WorkspaceView(props: {
  auditCount: number;
  busy: boolean;
  chunkTotal: number;
  documentSearch: string;
  documents: VaultDocument[];
  dragActive: boolean;
  health: HealthStatus | null;
  lastEgressBytes: number;
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
          egressBytes={props.lastEgressBytes}
          health={props.health}
          lastRoute={props.trace[1]?.title || 'Awaiting request'}
          trace={props.trace}
        />
      </div>
    </section>
  );
}
