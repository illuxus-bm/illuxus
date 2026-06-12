// Public entry point for the observability layer.
//
// Runtime exports:
//   - `logger`                       — singleton Logger instance (use
//                                       `logger.child({...})` for scope)
//   - `runWithCorrelationId`         — scoped correlation id helper
//   - `getCorrelationId`             — read the active correlation id
//   - `setPrivacyOptOut`             — flip the opt-out cell + clear
//                                       in-memory batch and offline queue
//   - `getPrivacyOptOut`             — read env override + localStorage
//   - `setUserIdProvider`            — pluggable `() => string | null`
//                                       wired by AuthProvider after login
//   - `supabaseRpc`                  — drop-in `supabase.rpc` replacement
//                                       that threads a correlation id

export { logger, Logger } from './logger';
export {
  setPrivacyOptOut,
  getPrivacyOptOut,
  setUserIdProvider,
} from './logger';

export { runWithCorrelationId, getCorrelationId } from './correlation';

export { supabaseRpc } from './rpc';

export type {
  LogLevel,
  LogRecord,
  Sink,
  SupabaseRpcOpts,
} from './sinks/types';

export { LEVEL_RANK } from './sinks/types';
