import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface State {
  error: Error | null;
}

/**
 * Catches errors thrown by lazy() dynamic imports (chunk load failures,
 * network errors, transient deploy mismatches) so the app shows a friendly
 * fallback instead of a blank white screen.
 */
export class LazyRouteBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface in preview logs with a stable tag so we can grep for it.
    // eslint-disable-next-line no-console
    console.error("[LazyRoute] render error", {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      componentStack: info?.componentStack,
    });
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isChunkError =
      /dynamically imported module|ChunkLoadError|Loading chunk|Importing a module script failed/i.test(
        error.message || "",
      );

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold mb-1">
            {isChunkError ? "Couldn't load this page" : "Something went wrong"}
          </h1>
          <p className="text-sm text-muted-foreground mb-4">
            {isChunkError
              ? "The page failed to load. This usually means a new version was just deployed — reloading should fix it."
              : "An unexpected error occurred while rendering this page."}
          </p>
          <pre className="text-xs bg-muted text-muted-foreground rounded-md p-2 overflow-auto max-h-40 mb-4">
            {error.name}: {error.message}
          </pre>
          <div className="flex gap-2">
            <Button onClick={this.reload}>Reload</Button>
            <Button variant="outline" asChild>
              <Link to="/">Go home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default LazyRouteBoundary;