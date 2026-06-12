// Console_Sink — fans observability records out to the browser devtools.
//
// Behaviour (design.md "Console_Sink", requirements 2.1 / 2.2):
//   - Maps LogLevel → console method:
//       trace → console.debug
//       debug → console.debug
//       info  → console.info
//       warn  → console.warn
//       error → console.error
//       fatal → console.error
//   - Emits two args: a single-line prefix `[<level>] <message>` and the
//     structured `record.fields` object so devtools renders an
//     expandable inspector.
//   - Production gate: when `import.meta.env.PROD === true`, only
//     records at `warn`/`error`/`fatal` reach the console. In dev,
//     every level is emitted.
//   - Must never throw — every console call is wrapped in `try/catch`.
//   - `flushBeacon` and `close` are no-ops; the console flushes
//     synchronously and there is nothing to clean up.
//
// This is the one file in the codebase that is allowed to call
// `console.*` directly; per-call `eslint-disable-next-line no-console`
// comments document the exception.

import type { LogLevel, LogRecord, Sink } from './types';

type ConsoleMethod = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_TO_METHOD: Record<LogLevel, ConsoleMethod> = {
  trace: 'debug',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
};

/** Levels permitted to reach the console under `import.meta.env.PROD`. */
const PROD_ALLOWED: ReadonlySet<LogLevel> = new Set<LogLevel>([
  'warn',
  'error',
  'fatal',
]);

function isProd(): boolean {
  // `import.meta.env.PROD` is a boolean injected by Vite at build time.
  // Wrapped in try/catch to stay safe in environments where
  // `import.meta.env` is unavailable (e.g. some test shims).
  try {
    return import.meta.env?.PROD === true;
  } catch {
    return false;
  }
}

export const consoleSink: Sink = {
  name: 'console',

  emit(record: LogRecord): void {
    try {
      if (isProd() && !PROD_ALLOWED.has(record.level)) return;

      const method = LEVEL_TO_METHOD[record.level];
      const prefix = `[${record.level}] ${record.message}`;

      switch (method) {
        case 'debug':
          // eslint-disable-next-line no-console -- console sink legitimately fans to console.*
          console.debug(prefix, record.fields);
          return;
        case 'info':
          // eslint-disable-next-line no-console -- console sink legitimately fans to console.*
          console.info(prefix, record.fields);
          return;
        case 'warn':
          // eslint-disable-next-line no-console -- console sink legitimately fans to console.*
          console.warn(prefix, record.fields);
          return;
        case 'error':
          // eslint-disable-next-line no-console -- console sink legitimately fans to console.*
          console.error(prefix, record.fields);
          return;
      }
    } catch {
      // REQ 4.1 — sinks must never throw. Swallow any console / env failure.
    }
  },

  flushBeacon(): void {
    // No-op: the console flushes synchronously, nothing to drain.
  },

  async close(): Promise<void> {
    // No-op: nothing to clean up.
  },
};
