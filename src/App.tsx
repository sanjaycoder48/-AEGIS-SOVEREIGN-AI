import { AuditView, DocumentsView, ModelsView } from './components/DataViews';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { Toast } from './components/Primitives';
import { Topbar } from './components/Topbar';
import { WorkspaceView } from './components/WorkspaceView';
import { useAegisWorkspace } from './hooks/useAegisWorkspace';
import { ACCEPTED_UPLOADS } from './lib/constants';
import type { ChangeEvent } from 'react';
import { useRef } from 'react';

function App() {
  const workspace = useAegisWorkspace();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const openUploadPicker = () => uploadInputRef.current?.click();
  const handleHiddenUpload = (event: ChangeEvent<HTMLInputElement>) => {
    void workspace.handleUpload(event.target.files?.[0]);
    event.target.value = '';
  };

  return (
    <ErrorBoundary>
      <input
        ref={uploadInputRef}
        aria-hidden="true"
        className="visually-hidden-input"
        tabIndex={-1}
        type="file"
        accept={ACCEPTED_UPLOADS}
        onChange={handleHiddenUpload}
      />
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
              selectedModel={workspace.selectedModel}
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
            <DocumentsView
              documents={workspace.documents}
              selectedIds={workspace.selectedIds}
              onSelectDocument={(documentId) => {
                workspace.toggleDocument(documentId, false);
                workspace.setView('workspace');
              }}
              onUploadClick={openUploadPicker}
            />
          )}
          {workspace.activeView === 'audit' && (
            <AuditView audit={workspace.audit} onExport={workspace.exportAudit} />
          )}
          {workspace.activeView === 'models' && (
            <ModelsView
              health={workspace.health}
              selectedModelId={workspace.selectedModelId}
              onSelectModel={workspace.selectModel}
            />
          )}
        </main>
      </div>
      <Toast message={workspace.toast} />
    </ErrorBoundary>
  );
}

export default App;
