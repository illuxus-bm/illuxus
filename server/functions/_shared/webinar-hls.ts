// Node port of supabase/functions/_shared/webinar-hls.ts (docs/PRISMA_MIGRATION.md). Keep the two in step.
import { Deno } from "../../edge/deno.js";
/**
 * HLS delivery for webinar viewers.
 *
 * Hosts and speakers meet in the LiveKit room over WebRTC. Viewers don't
 * join the room: LiveKit Egress composes the stage into one stream, writes
 * HLS segments to the storage configured on the egress service, and viewers
 * play them from the CDN in front of that storage.
 *
 * Switched on by WEBINAR_HLS_PUBLIC_BASE, the public (CDN) address of the
 * storage root, e.g. https://live.example.com. Unset, viewers join the room
 * as before.
 */

const SEGMENT_SECONDS = 2;
const LIVE_PLAYLIST = "live.m3u8";

export function hlsPublicBase(): string | null {
  const base = (Deno.env.get("WEBINAR_HLS_PUBLIC_BASE") || "").trim().replace(/\/+$/, "");
  return /^https:\/\//.test(base) ? base : null;
}

export function hlsEnabled(): boolean {
  return hlsPublicBase() !== null;
}

/** Storage path of a room's segments and playlists. */
function hlsPrefix(room: string): string {
  return `${room}/hls`;
}

/** Where viewers load the live playlist from; null when HLS is off. */
export function hlsPlaybackUrl(room: string): string | null {
  const base = hlsPublicBase();
  return base ? `${base}/${hlsPrefix(room)}/${LIVE_PLAYLIST}` : null;
}

export function livekitHttpUrl(): string {
  return (Deno.env.get("LIVEKIT_WS_URL") || Deno.env.get("LIVEKIT_URL"))!.replace(/^wss?:\/\//, "https://");
}

type EgressInfo = {
  egress_id?: string;
  egressId?: string;
  status?: string | number;
  segment_results?: unknown[];
  segmentResults?: unknown[];
  segments?: unknown;
};

function egressId(e: EgressInfo): string | null {
  return e.egress_id || e.egressId || null;
}

function isSegmentEgress(e: EgressInfo): boolean {
  return !!(e.segment_results?.length || e.segmentResults?.length || e.segments);
}

async function twirp(method: string, adminJwt: string, body: unknown): Promise<Response> {
  return await fetch(`${livekitHttpUrl()}/twirp/livekit.Egress/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${adminJwt}` },
    body: JSON.stringify(body),
  });
}

/** Egress still running for a room. `adminJwt` needs the roomRecord grant. */
export async function listActiveEgress(room: string, adminJwt: string): Promise<EgressInfo[]> {
  try {
    const res = await twirp("ListEgress", adminJwt, { room_name: room, active: true });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []) as EgressInfo[];
  } catch {
    return [];
  }
}

/**
 * Starts the viewers' HLS stream for a room, unless one is already running.
 * Returns the egress id, or an error for the caller to report: the session
 * can be live without it, but viewers would have nothing to watch.
 */
export async function startHlsEgress(
  room: string,
  adminJwt: string,
): Promise<{ egress_id: string | null; error?: string }> {
  const running = (await listActiveEgress(room, adminJwt)).find(isSegmentEgress);
  if (running) return { egress_id: egressId(running) };

  const prefix = hlsPrefix(room);
  const res = await twirp("StartRoomCompositeEgress", adminJwt, {
    room_name: room,
    layout: "speaker",
    segment_outputs: [{
      filename_prefix: `${prefix}/segment`,
      playlist_name: "index.m3u8",
      live_playlist_name: LIVE_PLAYLIST,
      segment_duration: SEGMENT_SECONDS,
    }],
  });
  if (!res.ok) return { egress_id: null, error: await res.text() };
  return { egress_id: egressId(await res.json() as EgressInfo) };
}

/** Stops every egress still running for a room (recording and HLS). */
export async function stopRoomEgress(room: string, adminJwt: string): Promise<void> {
  for (const e of await listActiveEgress(room, adminJwt)) {
    const id = egressId(e);
    if (!id) continue;
    await twirp("StopEgress", adminJwt, { egress_id: id }).catch(() => {});
  }
}
