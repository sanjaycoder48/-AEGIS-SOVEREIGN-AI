import type { AuditEvent, AuthSession, AuthUser, ChatResponse, HealthStatus, VaultDocument } from '../types';

const API_BASE = import.meta.env.VITE_AEGIS_API_BASE ?? (location.protocol === 'file:' ? 'http://127.0.0.1:8000' : '');
const SESSION_KEY = 'aegis_session_token';

export const sessionStore = {
  get: () => localStorage.getItem(SESSION_KEY),
  set: (token: string) => localStorage.setItem(SESSION_KEY, token),
  clear: () => localStorage.removeItem(SESSION_KEY),
};

export class AegisApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AegisApiError';
    this.status = status;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = sessionStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
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

export function getAuthStatus(): Promise<{ setup_required: boolean }> {
  return fetchJson('/api/auth/status');
}

export function getCurrentUser(): Promise<AuthUser> {
  return fetchJson('/api/auth/me');
}

export function registerAccount(name: string, username: string, password: string): Promise<AuthSession> {
  return fetchJson('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, username, password }),
  });
}

export function loginAccount(username: string, password: string): Promise<AuthSession> {
  return fetchJson('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  });
}

export function logoutAccount(): Promise<{ ok: boolean }> {
  return fetchJson('/api/auth/logout', { method: 'POST' });
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

export function askQuestion(question: string, documentIds: string[]): Promise<ChatResponse> {
  return fetchJson<ChatResponse>('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, document_ids: documentIds }),
  });
}
