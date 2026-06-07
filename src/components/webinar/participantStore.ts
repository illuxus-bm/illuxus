/**
 * Tiny pub/sub store that bridges LiveKit participants from inside
 * `<LiveKitRoom>` (where the hook is available) out to siblings like the
 * webinar sidebar that live outside the room context.
 *
 * Keyed by session id so multiple concurrent sessions in dev don't collide.
 */

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
  }
  return s;
}

export function setSessionParticipants(sessionId: string, list: SidebarParticipant[]) {
  const s = ensure(sessionId);
  s.list = list;
  s.subs.forEach((fn) => fn(list));
}

export function subscribeSessionParticipants(sessionId: string, fn: Listener) {
  const s = ensure(sessionId);
  s.subs.add(fn);
  fn(s.list);
  return () => { s.subs.delete(fn); };
}

export function getSessionParticipants(sessionId: string) {
  return ensure(sessionId).list;
}