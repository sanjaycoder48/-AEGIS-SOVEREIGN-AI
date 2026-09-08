import { useEffect, useState } from 'react';
import { getCurrentUser, logoutAccount, sessionStore } from './api/aegis';
import { AuthGate } from './components/AuthGate';
import { AuditView, DocumentsView, ModelsView } from './components/DataViews';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { Toast } from './components/Primitives';
import { Topbar } from './components/Topbar';
import { WorkspaceView } from './components/WorkspaceView';
import { useAegisWorkspace } from './hooks/useAegisWorkspace';
import type { AuthUser } from './types';

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(() => Boolean(sessionStore.get()));
  const workspace = useAegisWorkspace(Boolean(user));

  useEffect(() => {
    if (!sessionStore.get()) {
      return;
    }
    void getCurrentUser()
      .then(setUser)
      .catch(() => sessionStore.clear())
      .finally(() => setCheckingSession(false));
  }, []);

  async function logout() {
    try { await logoutAccount(); } catch { /* A local lock must always succeed. */ }
    sessionStore.clear();
    workspace.clearWorkspace();
    setUser(null);
  }

  if (checkingSession) return <div className="auth-shell"><div className="auth-loader"><span className="pulse" /> Verifying local session…</div></div>;
  if (!user) return <AuthGate onAuthenticated={setUser} />;

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <Sidebar activeView={workspace.activeView} isOpen={workspace.mobileOpen} onNavigate={workspace.setView} onLogout={logout} user={user} />
        <main>
          <Topbar
            activeView={workspace.activeView}
            health={workspace.health}
            onReset={workspace.resetConversation}
            onToggleMenu={workspace.toggleMobileMenu}
          />
          {workspace.activeView === 'workspace' && (
            <WorkspaceView
              auditCount={workspace.auditCount}
              busy={workspace.busy}
              chunkTotal={workspace.chunkTotal}
              documentSearch={workspace.documentSearch}
              documents={workspace.documents}
              dragActive={workspace.dragActive}
              health={workspace.health}
              lastEgressBytes={workspace.lastEgressBytes}
              messages={workspace.messages}
              offlineDemo={workspace.offlineDemo}
              prompt={workspace.prompt}
              selectedDocuments={workspace.selectedDocuments}
              selectedIds={workspace.selectedIds}
              trace={workspace.trace}
              uploading={workspace.uploading}
              onCopy={workspace.showToast}
              onDocumentSearch={workspace.setDocumentSearch}
              onDragActive={workspace.setDragActive}
              onPromptChange={workspace.setPrompt}
              onSelectDocument={workspace.toggleDocument}
              onSubmit={workspace.submitQuestion}
              onUpload={workspace.handleUpload}
            />
          )}
          {workspace.activeView === 'documents' && (
            <DocumentsView documents={workspace.documents} onUploadClick={() => workspace.setView('workspace')} />
          )}
          {workspace.activeView === 'audit' && (
            <AuditView audit={workspace.audit} onExport={workspace.exportAudit} />
          )}
          {workspace.activeView === 'models' && (
            <ModelsView health={workspace.health} />
          )}
        </main>
      </div>
      <Toast message={workspace.toast} />
    </ErrorBoundary>
  );
}

export default App;
