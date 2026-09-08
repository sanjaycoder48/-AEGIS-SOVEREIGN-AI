import { AuditView, DocumentsView, ModelsView } from './components/DataViews';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { Toast } from './components/Primitives';
import { Topbar } from './components/Topbar';
import { WorkspaceView } from './components/WorkspaceView';
import { useAegisWorkspace } from './hooks/useAegisWorkspace';

function App() {
  const workspace = useAegisWorkspace();

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <Sidebar activeView={workspace.activeView} isOpen={workspace.mobileOpen} onNavigate={workspace.setView} />
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
