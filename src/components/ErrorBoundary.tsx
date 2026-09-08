import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Aegis UI failed to render', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-fallback" role="alert">
          <div className="fallback-panel">
            <span className="section-label">RECOVERY</span>
            <h1>Aegis needs a fresh secure session</h1>
            <p>The local workspace stayed protected, but this view could not render safely.</p>
            <button className="primary-action" type="button" onClick={() => window.location.reload()}>
              Reload workbench
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
