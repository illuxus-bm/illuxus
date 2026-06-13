// FallbackView — branded surface rendered by RootErrorBoundary and
// RouteErrorBoundary when a React tree throws. Surfaces the active
// Correlation_Id (or the literal "no reference"), a Copy reference
// affordance, a Reload action, and a Go home link that also resets the
// nearest boundary's caught-error state.
//
// Validates: Requirements 7.5, 7.6, 7.7, 7.8, 7.9, 7.10
//
// Notes
// ─────
// - This file MUST contain zero browser-log calls (REQ 7.9). A grep test
//   in 2.9 enforces that invariant; do not introduce any here, even via
//   defensive logging in catch blocks. Failures during copy fall back
//   silently to a Range/Selection-based selection so the user can still
//   copy with ⌘C / Ctrl+C.
// - We deliberately keep this as a function component with no observability
//   imports (no `logger`, no `getCorrelationId`). The boundary owns the
//   correlation id at the time `render()` runs and passes it as a prop,
//   so the fallback stays trivially testable and side-effect free.

import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

interface Props {
  /** Active correlation id at the time the boundary caught the error. */
  correlationId: string | null;
  /** Clears the boundary's caught-error state so the user can recover. */
  onReset: () => void;
}

const REFERENCE_DISPLAY_FALLBACK = 'no reference';

/**
 * Best-effort copy: prefer the async Clipboard API, fall back to selecting
 * the text inside the monospace block via Range/Selection so the user can
 * copy manually with ⌘C / Ctrl+C if the Clipboard API is unavailable
 * (e.g., insecure context, older browser, or denied permission).
 *
 * Returns `true` only when the Clipboard API confirmed the write — selection
 * fallback returns `false` so the caller can avoid claiming "Reference
 * copied" when the user still has to press the shortcut themselves.
 */
async function copyOrSelect(value: string, anchor: HTMLElement | null): Promise<boolean> {
  // Prefer Clipboard API when available (must be in a secure context for
  // most browsers, but we let the implementation decide and catch errors).
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Permission denied or insecure context — fall through to selection.
    }
  }

  // Fallback: select the rendered text so the user can copy it manually.
  if (anchor && typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const range = document.createRange();
      range.selectNodeContents(anchor);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch {
      /* nothing more we can do without violating REQ 7.9 */
    }
  }
  return false;
}

export function FallbackView({ correlationId, onReset }: Props): React.ReactElement {
  const referenceRef = React.useRef<HTMLPreElement>(null);
  const hasReference = correlationId !== null && correlationId.length > 0;
  const referenceText = hasReference ? (correlationId as string) : REFERENCE_DISPLAY_FALLBACK;

  const handleCopy = React.useCallback(async () => {
    if (!hasReference) return;
    const copied = await copyOrSelect(correlationId as string, referenceRef.current);
    if (copied) {
      toast.success('Reference copied');
    }
  }, [correlationId, hasReference]);

  const handleReload = React.useCallback(() => {
    try {
      window.location.reload();
    } catch {
      /* defensive for non-browser test envs */
    }
  }, []);

  return (
    <div
      role="alert"
      className="min-h-screen flex items-center justify-center p-6 bg-background"
    >
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mb-4">
          We&apos;ve recorded the error. Try reloading, or head back home.
        </p>
        <pre
          ref={referenceRef}
          data-testid="fallback-reference"
          className="text-xs font-mono bg-muted text-muted-foreground rounded-md p-2 overflow-auto max-h-40 mb-4 select-all"
        >
          {referenceText}
        </pre>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            disabled={!hasReference}
            aria-label="Copy error reference"
          >
            Copy reference
          </Button>
          <Button type="button" size="sm" onClick={handleReload}>
            Reload
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/" onClick={onReset}>
              Go home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default FallbackView;
