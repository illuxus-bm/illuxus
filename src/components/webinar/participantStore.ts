/**
 * Tiny pub/sub store that bridges the LiveKit / Agora participant list
 * from inside the provider's context (where the hook is available) out
 * to siblings like `WebinarSidebar` that live outside the room context.
 *
 * Keyed by session id so multiple concurrent sessions in dev don't
 * collide.
 *
 * Every mutation flows through `logger.debug` (not `console.*`) per the
 * workspace observability rule. Previous versions of this file emitted
 * `console.log` on every subscribe / update / unsubscribe — enough to
 * spam the browser console with hundreds of lines during a live
 * webinar (a remote user un/muting caused a full re-emit) and made
 * both the ESLint pipeline and Sentry noisy. `logger.debug` is a
 * no-op in production and preserves PII scrubbing.
 */

import { logger } from "@/lib/observability";

export interface SidebarParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  isHost: boolean;
  canPublish: boolean;
  micOn: boolean;
  camOn: boolean;
  isSpeaking: boolean;
}

type Listener = (list: SidebarParticipant[]) => void;

const stores = new Map<string, { list: SidebarParticipant[]; subs: Set<Listener> }>();

function ensure(sessionId: string) {
  let s = stores.get(sessionId);
  if (!s) {
    s = { list: [], subs: new Set() };
    stores.set(sessionId, s);
    logger.debug("participant store created", { session_id: sessionId });
  }
  return s;
}

export function setSessionParticipants(sessionId: string, list: SidebarParticipant[]) {
  const s = ensure(sessionId);
  s.list = list;
  s.subs.forEach((fn) => fn(list));
  logger.debug("participant store updated", { session_id: sessionId, count: list.length });
}

export function subscribeSessionParticipants(sessionId: string, fn: Listener) {
  const s = ensure(sessionId);
  s.subs.add(fn);
  fn(s.list);
  logger.debug("participant store subscribed", { session_id: sessionId });
  return () => {
    s.subs.delete(fn);
    logger.debug("participant store unsubscribed", { session_id: sessionId });
  };
}

export function getSessionParticipants(sessionId: string) {
  return ensure(sessionId).list;
}