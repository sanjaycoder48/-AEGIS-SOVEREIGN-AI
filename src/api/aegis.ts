import type { AuditEvent, ChatResponse, HealthStatus, ModelId, VaultDocument } from '../types';

const API_BASE = import.meta.env.VITE_AEGIS_API_BASE ?? (location.protocol === 'file:' ? 'http://127.0.0.1:8000' : '');

export class AegisApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AegisApiError';
    this.status = status;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const contentType = response.headers.get('content-type') || '';
  const payload: unknown = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const detail = typeof payload === 'object' && payload && 'detail' in payload
      ? String((payload as { detail: unknown }).detail)
      : `${response.status} ${response.statusText}`;
    throw new AegisApiError(detail, response.status);
  }

  return payload as T;
}

export function getHealth(): Promise<HealthStatus> {
  return fetchJson<HealthStatus>('/api/health');
}

export function getDocuments(): Promise<VaultDocument[]> {
  return fetchJson<VaultDocument[]>('/api/documents');
}

export function getAudit(): Promise<AuditEvent[]> {
  return fetchJson<AuditEvent[]>('/api/audit');
}

export function uploadDocument(file: File): Promise<VaultDocument> {
  const body = new FormData();
  body.append('file', file);
  return fetchJson<VaultDocument>('/api/documents/upload', {
    method: 'POST',
    body,
  });
}

export function askQuestion(question: string, documentIds: string[], modelId?: ModelId): Promise<ChatResponse> {
  return fetchJson<ChatResponse>('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, document_ids: documentIds, model_id: modelId }),
  });
}
