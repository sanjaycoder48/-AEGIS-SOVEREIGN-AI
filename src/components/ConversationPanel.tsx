import { Activity, AlertTriangle, ArrowUp, Copy, FileText } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useRef } from 'react';
import { SUGGESTED_QUESTIONS } from '../lib/constants';
import type { ChatMessage, HealthStatus, ModelOption, VaultDocument } from '../types';
import { AnswerRenderer } from './AnswerRenderer';

export function ConversationPanel({
  busy,
  health,
  messages,
  prompt,
  selectedModel,
  selectedDocuments,
  onCopy,
  onPromptChange,
  onSubmit,
}: {
  busy: boolean;
  health: HealthStatus | null;
  messages: ChatMessage[];
  prompt: string;
  selectedModel: ModelOption;
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
          <strong>{selectedModel.title} {health?.ollama ? 'live' : 'fallback'}</strong>
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
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              void onSubmit();
            }
          }}
        />
        <div className="composer-footer">
          <span><b>{selectedDocuments.length}</b> active local source{selectedDocuments.length === 1 ? '' : 's'}</span>
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
          {SUGGESTED_QUESTIONS.map((suggestion) => (
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
                  {message.citations?.length ? message.citations.map((citation) => (
                    <span className="citation" key={`${citation.document}-${citation.location}`}>
                      <FileText size={13} />
                      {citation.document} - {citation.location}
                    </span>
                  )) : (
                    <span className="no-evidence">
                      <AlertTriangle size={13} />
                      NO SUPPORTING EVIDENCE
                    </span>
                  )}
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
