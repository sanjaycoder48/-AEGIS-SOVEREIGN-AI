export type ViewKey = 'workspace' | 'documents' | 'audit' | 'models';

export type MessageRole = 'agent' | 'user';

export type EngineMode = 'presentation' | 'ollama' | 'browser-demo' | 'safe-demo-fallback';

export interface HealthStatus {
  status: string;
  ollama: boolean;
  network_egress: string;
  mode?: EngineMode;
  documents?: number;
  audit_events?: number;
}

export interface VaultDocument {
  id: string;
  filename: string;
  title: string;
  chunks: number;
  created_at: string;
  pages?: number;
  size_bytes?: number;
  type?: string;
  status?: string;
  volatile?: boolean;
}

export interface AuditEvent {
  id?: number;
  timestamp: string;
  action: string;
  resource: string;
  result: string;
  hash?: string;
}

export interface Citation {
  document: string;
  location: string;
}

export interface ChatResponse {
  answer: string;
  model: string;
  route: string;
  citations: Citation[];
  elapsed_ms: number;
  mode: EngineMode;
  egress_bytes: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  citations?: Citation[];
  route?: string;
  model?: string;
  elapsedMs?: number;
  egressBytes?: number;
  isPending?: boolean;
  isError?: boolean;
}

export interface TraceStep {
  label: string;
  title: string;
  detail: string;
  duration?: string;
  status: 'complete' | 'running' | 'standby';
}
