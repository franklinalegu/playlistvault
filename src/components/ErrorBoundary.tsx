import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FiAlertOctagon } from 'react-icons/fi';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a render error shows a recoverable screen instead of
 * a blank white window.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[PlaylistVault] Render error:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="glass max-w-lg p-8 text-center">
          <FiAlertOctagon className="mx-auto h-10 w-10 text-rose-400" />
          <h1 className="mt-4 text-lg font-semibold text-white">Something broke</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            PlaylistVault hit an unexpected error. Your downloads and history are safe.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-black/40 p-3 text-left text-[11px] leading-relaxed text-rose-300/80">
            {error.message}
          </pre>
          <div className="mt-5 flex justify-center gap-2">
            <button onClick={() => this.setState({ error: null })} className="btn-ghost">
              Try again
            </button>
            <button onClick={() => window.location.reload()} className="btn-primary">
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
