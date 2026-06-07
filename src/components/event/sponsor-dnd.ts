// Pure helpers powering sponsor drag-and-drop reordering.
// Extracted so we can unit-test reorder + cross-tier move + persistence
// independently from React/@dnd-kit rendering.

import { arrayMove } from "@dnd-kit/sortable";

export interface DndSponsor {
  id: string;
  tier: string;
  tier_label: string | null;
}

export interface DndTierGroup<S extends DndSponsor = DndSponsor> {
  key: string;
  tier: string;
  tierLabel: string | null;
  sponsors: S[];
}

/**
 * Group a flat, display_order-sorted sponsor list into tier groups.
 * Group order is the order each tier first appears, so saving and reloading
 * display_order preserves the group layout.
 */
export function groupSponsorsByTier<S extends DndSponsor>(
  sponsors: S[],
): DndTierGroup<S>[] {
  const map = new Map<string, DndTierGroup<S>>();
  for (const s of sponsors) {
    const isCustom = s.tier === "custom";
    const tierLabel = isCustom ? (s.tier_label || "Custom").trim() : null;
    const key = isCustom ? `custom:${tierLabel}` : s.tier;
    if (!map.has(key)) {
      map.set(key, { key, tier: s.tier, tierLabel, sponsors: [] });
    }
    map.get(key)!.sponsors.push(s);
  }
  return Array.from(map.values());
}

/** Reorder a single sponsor within its own tier and return the new flat list. */
export function reorderWithinTier<S extends DndSponsor>(
  sponsors: S[],
  activeId: string,
  overId: string,
): S[] {
  const oldIndex = sponsors.findIndex((s) => s.id === activeId);
  const newIndex = sponsors.findIndex((s) => s.id === overId);
  if (oldIndex < 0 || newIndex < 0) return sponsors;
  return arrayMove(sponsors, oldIndex, newIndex);
}

/** Reorder whole tier groups and flatten back to a sponsor list. */
export function reorderGroups<S extends DndSponsor>(
  sponsors: S[],
  oldIndex: number,
  newIndex: number,
): S[] {
  const groups = groupSponsorsByTier(sponsors);
  const reordered = arrayMove(groups, oldIndex, newIndex);
  return reordered.flatMap((g) => g.sponsors);
}

/**
 * Move a sponsor across tiers. Returns the new flat list AND the sponsor
 * record that needs a tier/tier_label DB update (or `null` if no tier change).
 */
export function moveSponsorToTier<S extends DndSponsor>(
  sponsors: S[],
  sponsorId: string,
  destTier: string,
  destTierLabel: string | null,
  insertBeforeSponsorId: string | null,
): { next: S[]; updatedSponsor: S | null; tierChanged: boolean } {
  const dragged = sponsors.find((s) => s.id === sponsorId);
  if (!dragged) return { next: sponsors, updatedSponsor: null, tierChanged: false };

  const normalizedDestLabel = destTier === "custom" ? destTierLabel : null;
  const tierChanged =
    dragged.tier !== destTier ||
    (dragged.tier_label ?? null) !== normalizedDestLabel;

  const updated: S = {
    ...dragged,
    tier: destTier,
    tier_label: normalizedDestLabel,
  };

  const without = sponsors.filter((s) => s.id !== sponsorId);

  let insertIdx: number;
  if (insertBeforeSponsorId) {
    insertIdx = without.findIndex((s) => s.id === insertBeforeSponsorId);
    if (insertIdx < 0) insertIdx = without.length;
  } else {
    let lastIdx = -1;
    for (let i = 0; i < without.length; i++) {
      const s = without[i];
      const matches =
        s.tier === destTier &&
        (destTier !== "custom" || (s.tier_label || "") === (destTierLabel || ""));
      if (matches) lastIdx = i;
    }
    insertIdx = lastIdx + 1;
    if (insertIdx === 0) insertIdx = without.length;
  }

  const next = [...without.slice(0, insertIdx), updated, ...without.slice(insertIdx)];
  return { next, updatedSponsor: tierChanged ? updated : null, tierChanged };
}

/** Build the array of (sponsor_id, display_order) updates we'd persist. */
export function buildOrderUpdates<S extends DndSponsor>(
  sponsors: S[],
): Array<{ sponsor_id: string; display_order: number }> {
  return sponsors.map((s, i) => ({ sponsor_id: s.id, display_order: i }));
}

/**
 * Simulate a page refresh: re-sort sponsors by their persisted display_order
 * and re-derive groups. This mirrors what fetchData does on mount.
 */
export function reloadFromPersistedState<S extends DndSponsor>(
  sponsors: S[],
  persistedOrder: Array<{ sponsor_id: string; display_order: number }>,
): S[] {
  const orderMap = new Map(persistedOrder.map((o) => [o.sponsor_id, o.display_order]));
  const byId = new Map(sponsors.map((s) => [s.id, s]));
  return [...persistedOrder]
    .sort((a, b) => (orderMap.get(a.sponsor_id)! - orderMap.get(b.sponsor_id)!))
    .map((o) => byId.get(o.sponsor_id))
    .filter(Boolean) as S[];
}