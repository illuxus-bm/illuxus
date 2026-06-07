import { describe, it, expect } from "vitest";
import {
  groupSponsorsByTier,
  reorderWithinTier,
  reorderGroups,
  moveSponsorToTier,
  buildOrderUpdates,
  reloadFromPersistedState,
  type DndSponsor,
} from "../sponsor-dnd";

const mk = (id: string, tier: string, tier_label: string | null = null): DndSponsor => ({
  id, tier, tier_label,
});

describe("groupSponsorsByTier", () => {
  it("groups by tier and preserves first-appearance order across reloads", () => {
    const sponsors = [
      mk("g1", "gold"),
      mk("p1", "platinum"),
      mk("g2", "gold"),
      mk("d1", "custom", "Diamond"),
    ];
    const groups = groupSponsorsByTier(sponsors);
    expect(groups.map((g) => g.key)).toEqual(["gold", "platinum", "custom:Diamond"]);
    expect(groups[0].sponsors.map((s) => s.id)).toEqual(["g1", "g2"]);
  });
});

describe("reorderWithinTier", () => {
  it("reorders sponsors within the same tier and the new order persists across a refresh", () => {
    const sponsors = [mk("a", "platinum"), mk("b", "platinum"), mk("c", "platinum")];
    const next = reorderWithinTier(sponsors, "a", "b");
    expect(next.map((s) => s.id)).toEqual(["b", "a", "c"]);

    // Persist the new order, then simulate a page reload.
    const updates = buildOrderUpdates(next);
    expect(updates).toEqual([
      { sponsor_id: "b", display_order: 0 },
      { sponsor_id: "a", display_order: 1 },
      { sponsor_id: "c", display_order: 2 },
    ]);
    const reloaded = reloadFromPersistedState(sponsors, updates);
    expect(reloaded.map((s) => s.id)).toEqual(["b", "a", "c"]);
  });
});

describe("moveSponsorToTier (cross-tier drag)", () => {
  it("moves a sponsor into a built-in tier, clears tier_label, and persists", () => {
    const sponsors = [mk("p1", "platinum"), mk("g1", "gold")];
    const { next, updatedSponsor, tierChanged } = moveSponsorToTier(
      sponsors, "p1", "gold", null, null,
    );
    expect(tierChanged).toBe(true);
    expect(updatedSponsor).toEqual({ id: "p1", tier: "gold", tier_label: null });
    // p1 appended after the last gold sponsor (g1)
    expect(next.map((s) => s.id)).toEqual(["g1", "p1"]);

    // Persist + reload: order survives, and p1 now belongs to gold.
    const persisted = buildOrderUpdates(next);
    const reloaded = reloadFromPersistedState(next, persisted);
    const groups = groupSponsorsByTier(reloaded);
    expect(groups.map((g) => g.key)).toEqual(["gold"]);
    expect(groups[0].sponsors.map((s) => s.id)).toEqual(["g1", "p1"]);
  });

  it("carries the destination tier_label when dropping onto a custom tier", () => {
    const sponsors = [mk("p1", "platinum"), mk("d1", "custom", "Diamond")];
    const { updatedSponsor, next } = moveSponsorToTier(
      sponsors, "p1", "custom", "Diamond", null,
    );
    expect(updatedSponsor).toEqual({ id: "p1", tier: "custom", tier_label: "Diamond" });
    expect(next.map((s) => `${s.id}:${s.tier}:${s.tier_label ?? ""}`)).toEqual([
      "d1:custom:Diamond",
      "p1:custom:Diamond",
    ]);
  });

  it("inserts before a specific sponsor when given an anchor", () => {
    const sponsors = [mk("g1", "gold"), mk("g2", "gold"), mk("g3", "gold"), mk("p1", "platinum")];
    const { next } = moveSponsorToTier(sponsors, "p1", "gold", null, "g2");
    expect(next.map((s) => s.id)).toEqual(["g1", "p1", "g2", "g3"]);
  });

  it("returns no tier change when destination matches current tier+label", () => {
    const sponsors = [mk("d1", "custom", "Diamond"), mk("d2", "custom", "Diamond")];
    const { tierChanged } = moveSponsorToTier(sponsors, "d2", "custom", "Diamond", "d1");
    expect(tierChanged).toBe(false);
  });
});

describe("reorderGroups (drag a whole tier)", () => {
  it("reorders tier groups and the new layout survives a reload", () => {
    const sponsors = [
      mk("p1", "platinum"), mk("p2", "platinum"),
      mk("g1", "gold"),
      mk("s1", "silver"),
    ];
    // Move Gold (index 1) above Platinum (index 0).
    const next = reorderGroups(sponsors, 1, 0);
    expect(next.map((s) => s.id)).toEqual(["g1", "p1", "p2", "s1"]);

    const persisted = buildOrderUpdates(next);
    const reloaded = reloadFromPersistedState(next, persisted);
    const groups = groupSponsorsByTier(reloaded);
    expect(groups.map((g) => g.key)).toEqual(["gold", "platinum", "silver"]);
  });
});

describe("full drag → persist → refresh cycle", () => {
  it("survives a within-tier reorder, then a cross-tier move, then a reload", () => {
    let state: DndSponsor[] = [
      mk("a", "platinum"), mk("b", "platinum"), mk("c", "platinum"),
      mk("g1", "gold"),
    ];

    // Step 1: within-tier — move b to the top.
    state = reorderWithinTier(state, "b", "a");
    state = reloadFromPersistedState(state, buildOrderUpdates(state));
    expect(state.map((s) => s.id)).toEqual(["b", "a", "c", "g1"]);

    // Step 2: cross-tier — drag c into gold.
    const moved = moveSponsorToTier(state, "c", "gold", null, null);
    state = moved.next;
    expect(moved.updatedSponsor).toEqual({ id: "c", tier: "gold", tier_label: null });
    state = reloadFromPersistedState(state, buildOrderUpdates(state));

    const groups = groupSponsorsByTier(state);
    expect(groups.map((g) => g.key)).toEqual(["platinum", "gold"]);
    expect(groups[0].sponsors.map((s) => s.id)).toEqual(["b", "a"]);
    expect(groups[1].sponsors.map((s) => s.id)).toEqual(["g1", "c"]);
  });
});