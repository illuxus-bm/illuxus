/**
 * Auto-generate — event-publish hook that fires a small seed set of
 * `event_creative_ai_drafts` rows so the organizer opens their
 * Creatives tab with something already waiting for review.
 *
 * Scope is intentionally minimal:
 *  - Fires ONLY on the draft → published status transition (not on
 *    every event save; that would burn Gemini quota on every dashboard
 *    tweak).
 *  - Generates copy for the event-level promo. Per-speaker generation
 *    is deferred — it can be triggered from the Creatives review
 *    banner when the organizer chooses to.
 *  - Fire-and-forget: `autoGenerateEventDrafts` returns immediately
 *    after posting to the edge function; the caller doesn't await
 *    Gemini's response. Failures are logged and surface a toast, but
 *    they never block the event-save UX or throw upward.
 *
 * The edge function is the single choke point that enforces auth,
 * quota, and Gemini spend — this file is just a thin orchestrator.
 */

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/observability";
import {
  callGenerateCreativeCopy,
  type CreativeCopyContext,
} from "./creative-ai";

interface EventContextRow {
  id: string;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  venue: string | null;
  location: string | null;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Loads the minimum event context needed by the LLM to draft copy —
 * title, description, date, venue. Returns `null` when the row is
 * missing / unreachable (e.g. RLS hides it from the current caller);
 * the caller treats that as "skip auto-generation quietly" rather than
 * surfacing a scary error.
 */
async function loadEventContext(eventId: string): Promise<CreativeCopyContext | null> {
  const { data, error } = await supabase
    .from("events")
    .select("id, title, description, date, end_date, venue, location")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) {
    logger.warn("auto-generate: event context load failed", {
      event_id: eventId,
      error_message: error?.message,
    });
    return null;
  }
  const row = data as EventContextRow;
  const dateText = row.date
    ? row.end_date && row.end_date !== row.date
      ? `${fmtDate(row.date)} – ${fmtDate(row.end_date)}`
      : fmtDate(row.date)
    : null;
  return {
    eventTitle: row.title,
    eventDescription: row.description,
    dateText,
    venueText: row.venue || row.location || null,
  };
}

interface AutoGenerateResult {
  ok: boolean;
  suggestionCount: number;
  error?: string;
}

/**
 * Kicks off event-level AI copy generation for a just-published event.
 * Idempotent-ish — repeated calls are guarded by the edge function's
 * per-event daily quota (default 50/day) rather than a hard "already
 * generated" check, because organizers legitimately want to re-generate
 * copy after they've updated the event's description.
 *
 * Returns a lightweight result so the caller (typically the event
 * settings save flow) can render an accurate toast — but does NOT
 * throw. Auto-generation is a best-effort convenience; a failed
 * generation must not block a successful event publish.
 */
export async function autoGenerateEventDrafts(
  eventId: string,
): Promise<AutoGenerateResult> {
  try {
    const context = await loadEventContext(eventId);
    if (!context || !context.eventTitle.trim()) {
      return { ok: false, suggestionCount: 0, error: "Event context unavailable" };
    }

    const response = await callGenerateCreativeCopy({
      eventId,
      kind: "event",
      context,
      alternatives: 3,
      source: "auto_publish",
    });

    logger.info("auto-generate: event drafts inserted", {
      event_id: eventId,
      suggestion_count: response.suggestions.length,
    });
    return { ok: true, suggestionCount: response.suggestions.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("auto-generate: failed", {
      event_id: eventId,
      error_message: message,
    });
    return { ok: false, suggestionCount: 0, error: message };
  }
}
