// Feature: creative-ai-backgrounds — Integration tests for the AI background
// storage helpers (task 5.1)
//
// Validates: Requirements 6.4, 7.1
//
// There is no live/test Supabase project available in this environment, so
// these are MOCKED-CLIENT integration-style tests: they verify the real code
// path in `creative-storage.ts` calls the Supabase client with the correct
// arguments and handles responses correctly, using a mocked
// `@/integrations/supabase/client` (same hoisted-mock pattern as
// `creative-storage.integration.test.ts`). This still meaningfully verifies
// the integration between `fetchEventCreativeBackgrounds` /
// `deleteEventCreativeBackground` and the exact Supabase client call shape,
// which is the most valuable thing to test without real infrastructure.
//
// REQ 7.1 — the AI_Background_Assets library query fetches an event's
//   `event_creative_backgrounds` rows ordered most-recent-first via
//   `.order("created_at", { ascending: false })`.
// REQ 6.4 — deleting an AI_Background_Asset always attempts both the
//   Storage removal AND the row delete, reporting partial failure across
//   all four success/failure combinations.

import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  order: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  deleteFn: vi.fn(),
  deleteEq: vi.fn(),
  remove: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: mocks.storageFrom,
    },
    from: mocks.from,
  },
}));

vi.mock("@/lib/observability", () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

import {
  deleteEventCreativeBackground,
  fetchEventCreativeBackgrounds,
} from "../creative-storage";

// ---------------------------------------------------------------------------
// Test 1 — fetchEventCreativeBackgrounds (Requirement 7.1)
// ---------------------------------------------------------------------------

describe("creative-storage integration — AI background library query (REQ 7.1)", () => {
  it("queries event_creative_backgrounds filtered by event_id and ordered by created_at desc", async () => {
    const rows = [
      { id: "b1", event_id: "event-1", created_at: "2024-01-02T00:00:00Z" },
      { id: "b2", event_id: "event-1", created_at: "2024-01-01T00:00:00Z" },
    ];

    mocks.order.mockResolvedValue({ data: rows, error: null });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe("event_creative_backgrounds");
      return { select: mocks.select };
    });

    const result = await fetchEventCreativeBackgrounds("event-1");

    expect(result.length).toBe(2);
    expect(mocks.from).toHaveBeenCalledWith("event_creative_backgrounds");
    expect(mocks.select).toHaveBeenCalledWith("*");
    expect(mocks.eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(mocks.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns [] (does not throw) when the query errors", async () => {
    mocks.order.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe("event_creative_backgrounds");
      return { select: mocks.select };
    });

    const result = await fetchEventCreativeBackgrounds("event-1");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — deleteEventCreativeBackground (Requirement 6.4)
// ---------------------------------------------------------------------------

describe("creative-storage integration — AI background delete (REQ 6.4)", () => {
  function setupMocks(options: {
    storageError: { message: string } | null;
    recordError: { message: string } | null;
  }) {
    mocks.remove.mockResolvedValue({ error: options.storageError });
    mocks.storageFrom.mockImplementation((bucket: string) => {
      expect(bucket).toBe("site-assets");
      return { remove: mocks.remove };
    });

    mocks.deleteEq.mockResolvedValue({ error: options.recordError });
    mocks.deleteFn.mockReturnValue({ eq: mocks.deleteEq });
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe("event_creative_backgrounds");
      return { delete: mocks.deleteFn };
    });
  }

  it("runs both the storage removal and the record delete", async () => {
    setupMocks({ storageError: null, recordError: null });

    await deleteEventCreativeBackground("bg-1", "ai-backgrounds/event-1/key.png");

    expect(mocks.storageFrom).toHaveBeenCalledWith("site-assets");
    expect(mocks.remove).toHaveBeenCalledWith(["ai-backgrounds/event-1/key.png"]);
    expect(mocks.from).toHaveBeenCalledWith("event_creative_backgrounds");
    expect(mocks.deleteFn).toHaveBeenCalledTimes(1);
    expect(mocks.deleteEq).toHaveBeenCalledWith("id", "bg-1");
  });

  it("reports { storageDeleted: true, recordDeleted: true } when both succeed", async () => {
    setupMocks({ storageError: null, recordError: null });

    const result = await deleteEventCreativeBackground(
      "bg-1",
      "ai-backgrounds/event-1/key.png"
    );

    expect(result).toEqual({ storageDeleted: true, recordDeleted: true });
  });

  it("reports { storageDeleted: false, recordDeleted: true } when storage fails and the record succeeds", async () => {
    setupMocks({ storageError: { message: "storage boom" }, recordError: null });

    const result = await deleteEventCreativeBackground(
      "bg-1",
      "ai-backgrounds/event-1/key.png"
    );

    expect(result).toEqual({ storageDeleted: false, recordDeleted: true });
  });

  it("reports { storageDeleted: true, recordDeleted: false } when storage succeeds and the record fails", async () => {
    setupMocks({ storageError: null, recordError: { message: "record boom" } });

    const result = await deleteEventCreativeBackground(
      "bg-1",
      "ai-backgrounds/event-1/key.png"
    );

    expect(result).toEqual({ storageDeleted: true, recordDeleted: false });
  });

  it("reports { storageDeleted: false, recordDeleted: false } when both fail", async () => {
    setupMocks({
      storageError: { message: "storage boom" },
      recordError: { message: "record boom" },
    });

    const result = await deleteEventCreativeBackground(
      "bg-1",
      "ai-backgrounds/event-1/key.png"
    );

    expect(result).toEqual({ storageDeleted: false, recordDeleted: false });
  });
});
