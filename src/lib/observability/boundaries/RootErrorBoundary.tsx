// RootErrorBoundary — top-level React class boundary that wraps the
// entire app under <BrowserRouter>. Catches any error escaping a route
// boundary (or thrown by providers / shells outside the route tree) and
// surfaces a branded fallback so the app never blanks.
//
// Validates: Requirements 7.1, 7.3, 7.4
//
// Notes
// ─────
// - `componentDidCatch` is the only sink we route through `logger.error`.
//   We deliberately do NOT log inside `getDerivedStateFromError` because
//   React calls that method twice in StrictMode and once during render —
//   logging there would double-emit. `componentDidCatch` is invoked
//   exactly once per caught error.
// - The inline fallback below is a placeholder; task 2.3 introduces
//   `FallbackView.tsx` with the full Copy reference / Reload / Go home
//   surface (REQ 7.5–7.10) and replaces this inline markup. The shape of
//   the props passed to the future component (`correlationId`,
//   `onReset`) is already locked here so the swap is mechanical.
// - `onReset` clears the caught-error state so the user can recover
//   without a hard reload after navigating home (REQ 7.7).

import React from 'react';
import { Link } from 'react-router-dom';

import { getCorrelationId, logger } from '@/lib/observability';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class RootErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Best-effort route capture; window may not exist in non-browser
    // test environments and `pathname` access can throw inside sandboxed
    // iframes.
    let route = '/';
    try {
      if (typeof window !== 'undefined' && window.location && window.location.pathname) {
        route = window.location.pathname;
      }
    } catch {
      /* fall back to '/' */
    }

    logger.error('boundary caught', {
      boundary: 'root',
      route,
      error_name: error?.name,
      error_message: error?.message,
      component_stack: info?.componentStack,
      correlation_id: getCorrelationId(),
    });
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  private handleReload = (): void => {
    try {
      window.location.reload();
    } catch {
      /* unreachable in browser; defensive for jsdom */
    }
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Placeholder fallback — task 2.3 will replace this block with
    // <FallbackView correlationId={getCorrelationId()} onReset={this.handleReset} />.
    const correlationId = getCorrelationId() ?? 'no reference';

    return (
      <div
        role="alert"
        className="min-h-screen flex items-center justify-center p-6 bg-background"
      >
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mb-4">
            We've recorded the error. Try reloading, or head back home.
          </p>
          <pre className="text-xs bg-muted text-muted-foreground rounded-md p-2 overflow-auto max-h-40 mb-4">
            {correlationId}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              Reload
            </button>
            <Link
              to="/"
              onClick={this.handleReset}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    );
  }
}

export default RootErrorBoundary;
