// RPC wrapper — the single way the application invokes Supabase RPCs.
//
// Source of truth: design.md "RPC wrapper (rpc.ts)" section.
// Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.6, 9.7, 9.8,
//            10.1, 10.2, 10.3, 10.4, 10.5
//
// ─────────────────────────────────────────────────────────────────────────
// Architectural note — NO `async`/`await`
// ─────────────────────────────────────────────────────────────────────────
// The Promise.then patch installed by `correlation.ts` is bypassed by
// `await`: V8 routes `await` through the internal PerformPromiseThen
// host operation, which does not look up `Promise.prototype.then` on
// the prototype chain. To keep the active correlation id threaded
// across every microtask in this wrapper's chain, the body uses
// explicit `.then(...)` chains exclusively. The function itself is NOT
// declared `async` for the same reason — an `async` function would
// also wrap the inner promise via PerformPromiseThen on its return.

import { supabase } from '@/integrations/supabase/client';
import { runWithCorrelationId } from './correlation';
import { logger } from './logger';
import { isDev as readIsDev } from './env-mode';
import type { SupabaseRpcOpts } from './sinks/types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RpcResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
  status: number;
}

interface SupabaseRpcResponse<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
  correlationId: string;
}

function readEnvString(key: string): string | undefined {
  try {
    const env = (import.meta as { env?: Record<string, unknown> }).env;
    if (!env) return undefined;
    const v = env[key];
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
}

function isDev(): boolean {
  // Delegates to ./env-mode so tests can vi.mock the env-mode module
  // and inject controlled true/false values. Vite's import.meta.env
  // is inlined at transform time so it's not mockable in place.
  return readIsDev();
}

/**
 * Best-effort UUID generator. Prefers `crypto.randomUUID()` (per REQ 9.2)
 * and falls back to a v4 generated from `crypto.getRandomValues` so the
 * wrapper still behaves on the rare runtime where `randomUUID` is absent.
 */
function newCorrelationId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  // RFC 4122 v4 fallback.
  const bytes = new Uint8Array(16);
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
  } catch {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

/**
 * Internal helper: POST directly to `${SUPABASE_URL}/rest/v1/rpc/${name}`
 * so the caller can attach an `x-correlation-id` header (REQ 9.3) — the
 * `@supabase/supabase-js` `rpc()` API does not expose a per-call header
 * hook today. The session JWT is reused from `supabase.auth.getSession()`
 * and the `apikey` from the same envs as `src/integrations/supabase/client.ts`.
 *
 * Returns `{ data, error, status }` — the same triple `supabase.rpc`
 * surfaces, suitable for the wrapper to map directly onto its own
 * `{ data, error, correlationId }` shape.
 */
function postRpc<T>(
  name: string,
  params: Record<string, unknown>,
  options: { headers: Record<string, string>; signal?: AbortSignal },
): Promise<RpcResult<T>> {
  const supabaseUrl = readEnvString('VITE_SUPABASE_URL') ?? '';
  const apikey = readEnvString('VITE_SUPABASE_PUBLISHABLE_KEY') ?? '';

  return supabase.auth.getSession().then((sessionRes) => {
    const accessToken = sessionRes?.data?.session?.access_token ?? apikey;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      apikey,
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    };

    return fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal: options.signal,
    }).then((response) => {
      const status = response.status;
      return response.text().then((text): RpcResult<T> => {
        let parsed: unknown = null;
        if (text && text.length > 0) {
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
        }
        if (response.ok) {
          return { data: parsed as T, error: null, status };
        }
        const body =
          parsed && typeof parsed === 'object'
            ? (parsed as Record<string, unknown>)
            : null;
        const message =
          body && typeof body.message === 'string'
            ? body.message
            : `HTTP ${status}`;
        const code =
          body && typeof body.code === 'string' ? body.code : undefined;
        return {
          data: null,
          error: code ? { message, code } : { message },
          status,
        };
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for `supabase.rpc(name, params)`.
 *
 * Generates a fresh UUIDv4 correlation id (or reuses `opts.correlationId`,
 * the future-hook for offline replay), threads it through the call's
 * promise chain via `runWithCorrelationId`, attaches it as the
 * `x-correlation-id` HTTP header, and emits structured `rpc dispatch` /
 * `rpc resolved` / `rpc rejected` log records.
 *
 * Returns the same `{ data, error }` triple as `supabase.rpc` plus the
 * correlation id so call sites that need to surface it (e.g. a toast
 * with `Reference: <id>`) can read it directly.
 */
export function supabaseRpc<T = unknown>(
  name: string,
  params: Record<string, unknown> = {},
  opts: SupabaseRpcOpts = {},
): Promise<SupabaseRpcResponse<T>> {
  const correlationId = opts.correlationId ?? newCorrelationId(); // REQ 9.2 / 9.7
  const startedAt = performance.now();

  // `runWithCorrelationId` may return `T | Promise<T>`; in this branch we
  // always return a Promise from `fn`, so the result is always a Promise.
  // The cast at the end narrows the union for callers.
  const settled = runWithCorrelationId(correlationId, () => {
    const log = logger.child({ rpc_name: name });
    if (isDev()) {
      // REQ 10.1 — dev-only pre-dispatch debug; `params` is redacted by the logger.
      log.debug('rpc dispatch', { params });
    }

    return postRpc<T>(name, params, {
      headers: { 'x-correlation-id': correlationId }, // REQ 9.3
      signal: opts.signal,
    }).then(
      ({ data, error, status }): SupabaseRpcResponse<T> => {
        const duration_ms = Math.round(performance.now() - startedAt);
        const result_code = String(status);
        if (error) {
          // REQ 9.6 / 10.3 — rejection branch
          log.warn('rpc rejected', {
            duration_ms,
            result_code,
            error_message: error.message,
          });
        } else if (isDev()) {
          // REQ 10.2 — dev resolves at debug
          log.debug('rpc resolved', { duration_ms, result_code });
        } else {
          // REQ 9.6 — prod resolves at info
          log.info('rpc resolved', { duration_ms, result_code });
        }
        return { data, error, correlationId };
      },
      (err: unknown): SupabaseRpcResponse<T> => {
        // Network error / aborted fetch / unexpected throw inside postRpc.
        const duration_ms = Math.round(performance.now() - startedAt);
        const error_message =
          err instanceof Error ? err.message : String(err);
        log.warn('rpc rejected', { duration_ms, error_message });
        return {
          data: null,
          error: { message: error_message },
          correlationId,
        };
      },
    );
  });

  return settled as Promise<SupabaseRpcResponse<T>>;
}
