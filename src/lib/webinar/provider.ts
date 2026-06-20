/**
 * Webinar provider switch.
 *
 * Resolves which video transport the live event UI should use. Defaults
 * to the legacy LiveKit stack so existing events keep working unchanged.
 *
 * Resolution order:
 *   1. Per-event override on `events.video_provider` (handled by callers
 *      via `getWebinarProvider({ eventOverride })`). This is the canary
 *      knob — flip a single event to Agora to validate before flipping
 *      the platform default.
 *   2. `import.meta.env.VITE_WEBINAR_PROVIDER` env var.
 *   3. Fallback: 'livekit'.
 *
 * Until the Agora migration is feature-complete, callers should treat
 * 'agora' as feature-flagged and gate every Agora-only code path through
 * this helper so a misconfigured env doesn't accidentally swap a
 * production event onto an unfinished pipeline.
 */

export type WebinarProvider = "livekit" | "agora";

const DEFAULT_PROVIDER: WebinarProvider = "agora";

function isProvider(v: unknown): v is WebinarProvider {
  return v === "livekit" || v === "agora";
}

export interface ProviderResolution {
  provider: WebinarProvider;
  /** Where the resolved value came from. Useful for diagnostic logging. */
  source: "event-override" | "env" | "default";
}

export interface GetProviderOpts {
  /**
   * Per-event override. Pass `events.video_provider` (or whatever the
   * column ends up being named). When set to a known provider it wins
   * over the env default.
   */
  eventOverride?: string | null;
}

export function getWebinarProvider(opts: GetProviderOpts = {}): ProviderResolution {
  const override = opts.eventOverride;
  if (typeof override === "string" && isProvider(override)) {
    return { provider: override, source: "event-override" };
  }

  const envValue = import.meta.env.VITE_WEBINAR_PROVIDER as string | undefined;
  if (isProvider(envValue)) {
    return { provider: envValue, source: "env" };
  }

  return { provider: DEFAULT_PROVIDER, source: "default" };
}

/** Convenience for callers that only need the provider name. */
export function resolveWebinarProvider(opts: GetProviderOpts = {}): WebinarProvider {
  return getWebinarProvider(opts).provider;
}
