'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean; message: string; reference: string };

function incidentReference() {
  return `UI-${Date.now().toString(36).toUpperCase()}`;
}

export default class ApplicationRecoveryBoundary extends Component<Props, State> {
  state: State = { failed: false, message: '', reference: '' };

  static getDerivedStateFromError(error: Error): State {
    return {
      failed: true,
      message: error.message || 'The workspace encountered an unexpected interface error.',
      reference: incidentReference()
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('LetterGenerator workspace failure', {
      error,
      componentStack: info.componentStack,
      reference: this.state.reference
    });
  }

  private recover = () => {
    this.setState({ failed: false, message: '', reference: '' });
    window.location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="recovery-boundary" role="alert" aria-live="assertive">
        <section className="recovery-boundary-card">
          <p className="eyebrow">Workspace recovery</p>
          <h1>The document workspace could not continue safely.</h1>
          <p className="recovery-boundary-copy">No new packet has been finalized from this failed screen. Reload the workspace, then resume from your stored source and evidence.</p>
          <div className="recovery-boundary-detail">
            <strong>Technical reference</strong>
            <code>{this.state.reference}</code>
            <span>{this.state.message}</span>
          </div>
          <button type="button" className="action-button" onClick={this.recover}>Reload workspace safely</button>
        </section>
      </main>
    );
  }
}
