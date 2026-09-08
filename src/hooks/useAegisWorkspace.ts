import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { askQuestion, getAudit, getDocuments, getHealth, uploadDocument } from '../api/aegis';
import { DEMO_DOCUMENT } from '../lib/constants';
import { csvCell, demoAnswer, displayTitle, formatAction } from '../lib/format';
import { completeTrace, initialTrace, runningTrace } from '../lib/trace';
import { validateUploadFile } from '../lib/validation';
import type { AuditEvent, ChatMessage, ChatResponse, HealthStatus, TraceStep, VaultDocument, ViewKey } from '../types';

function uid(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${random ?? `${Date.now()}-${Math.round(Math.random() * 1000)}`}`;
}

export function normalizeSelection(current: Set<string>, documents: VaultDocument[]): Set<string> {
  const validIds = new Set(documents.map((document) => document.id));
  const next = new Set([...current].filter((id) => validIds.has(id)));
  const first = documents[0];
  if (!next.size && first) next.add(first.id);
  return next;
}

export function useAegisWorkspace() {
  const [activeView, setActiveView] = useState<ViewKey>('workspace');
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [documentSearch, setDocumentSearch] = useState('');
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [lastEgressBytes, setLastEgressBytes] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

  const setView = useCallback((view: ViewKey) => {
    setActiveView(view);
    setMobileOpen(false);
    if (view === 'audit') void refreshAudit();
  }, [refreshAudit]);

  const toggleMobileMenu = useCallback(() => {
    setMobileOpen((open) => !open);
  }, []);

  const resetConversation = useCallback(() => {
    setTrace(initialTrace());
    setPrompt('');
    setMessages([]);
    setBusy(false);
    setLastEgressBytes(0);
    showToast('Secure session cleared');
  }, [showToast]);

  const toggleDocument = useCallback((documentId: string, additive: boolean) => {
    const document = documents.find((item) => item.id === documentId);
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
    if (document) showToast(`${document.title || document.filename} is active`);
  }, [documents, showToast]);

  const handleUpload = useCallback(async (file?: File) => {
    if (!file) return;
    const validation = validateUploadFile(file);
    if (!validation.ok) {
      showToast(validation.message);
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
          type: validation.extension.toUpperCase(),
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
  }, [refreshAudit, refreshHealth, showToast]);

  const settleMessage = useCallback((messageId: string, result: ChatResponse) => {
    setLastEgressBytes(result.egress_bytes);
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
  }, []);

  const submitQuestion = useCallback(async (question = prompt.trim()) => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || busy) return;

    const userMessage: ChatMessage = { id: uid('msg'), role: 'user', content: trimmedQuestion };
    const pendingId = uid('msg');
    const pendingMessage: ChatMessage = {
      id: pendingId,
      role: 'agent',
      content: 'Analyzing local evidence...',
      isPending: true,
    };

    setBusy(true);
    setPrompt('');
    setTrace(runningTrace(trimmedQuestion, selectedDocuments.length));
    setMessages((current) => [...current, userMessage, pendingMessage]);

    try {
      const result = await askQuestion(trimmedQuestion, sourceIds);
      settleMessage(pendingId, result);
      setTrace(completeTrace(result.route, result.model, result.citations.length, result.elapsed_ms));
      await Promise.allSettled([refreshAudit(), refreshHealth()]);
    } catch (error) {
      if (error instanceof TypeError || offlineDemo) {
        const result = demoAnswer(trimmedQuestion);
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
  }, [
    busy,
    offlineDemo,
    prompt,
    refreshAudit,
    refreshHealth,
    selectedDocuments.length,
    settleMessage,
    showToast,
    sourceIds,
  ]);

  const exportAudit = useCallback(async () => {
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
  }, [audit, showToast]);

  return {
    activeView,
    audit,
    auditCount: audit.length || health?.audit_events || 0,
    busy,
    chunkTotal,
    documentSearch,
    documents,
    dragActive,
    exportAudit,
    handleUpload,
    health,
    lastEgressBytes,
    messages,
    mobileOpen,
    offlineDemo,
    prompt,
    resetConversation,
    selectedDocuments,
    selectedIds,
    setDocumentSearch,
    setDragActive,
    setPrompt,
    setView,
    showToast,
    submitQuestion,
    toast,
    toggleDocument,
    toggleMobileMenu,
    trace,
    uploading,
  };
}
