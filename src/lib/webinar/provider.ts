/**
 * Webinar provider switch.
 *
 * Resolves which video transport the live event UI should use. LiveKit,
 * on our own server, is the stage: hosts and speakers meet in its room and
 * viewers watch the composed stream over HLS (see HlsStage). Agora is the
 * earlier hosted stage, kept selectable until it is removed.
 *
 * Resolution order:
 *   1. Per-event override on `events.video_provider` (handled by callers
 *      via `getWebinarProvider({ eventOverride })`).
 *   2. `import.meta.env.VITE_WEBINAR_PROVIDER` env var.
 *   3. Fallback: 'livekit'.
 */

export type WebinarProvider = "livekit" | "agora";

const DEFAULT_PROVIDER: WebinarProvider = "livekit";

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
