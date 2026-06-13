// RouteErrorBoundary — per-route React class boundary that wraps each
// lazy route element. Catches errors thrown inside a single route's
// component tree so an isolated failure does not unmount the shell or
// trip the root boundary.
//
// Validates: Requirements 7.2, 7.3, 7.4
//
// Notes
// ─────
// - `componentDidCatch` is the only sink we route through `logger.error`.
//   We deliberately do NOT log inside `getDerivedStateFromError` because
//   React calls that method twice in StrictMode and once during render —
//   logging there would double-emit. `componentDidCatch` is invoked
//   exactly once per caught error.
// - On caught state we render `<FallbackView />` (task 2.3) which owns
//   the branded UI plus the Copy reference / Reload / Go home surface
//   (REQ 7.5–7.10). This boundary supplies the active Correlation_Id at
//   render time and the `onReset` callback that clears the caught-error
//   state so the user can recover without a hard reload after
//   navigating home (REQ 7.7).

import React from 'react';

import { getCorrelationId, logger } from '@/lib/observability';

import { FallbackView } from './FallbackView';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class RouteErrorBoundary extends React.Component<Props, State> {
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
      boundary: 'route',
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

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <FallbackView correlationId={getCorrelationId()} onReset={this.handleReset} />
    );
  }
}

export default RouteErrorBoundary;
