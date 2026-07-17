// Feature: social-creative-generator — Integration tests: upload+insert and
// library query (task 11.9)
//
// Validates: Requirements 8.1, 8.2
//
// There is no live/test Supabase project available in this environment, so
// these are MOCKED-CLIENT integration-style tests: they verify the real code
// path in `creative-storage.ts` calls the Supabase client with the correct
// arguments and handles responses correctly, using a mocked
// `@/integrations/supabase/client` (same hoisted-mock pattern as
// `src/lib/observability/__tests__/rpc-prefix-debug-prod.test.ts`). This still
// meaningfully verifies the integration between `creative-storage.ts`'s
// functions and the exact Supabase client call shape, which is the most
// valuable thing to test without real infrastructure.
//
// REQ 8.1 — uploading a rendered creative writes the PNG to `site-assets`
//   under `event-creatives/{event_id}/` and inserts a matching
//   `event_creatives` row.
// REQ 8.2 — the Creative_Library query fetches an event's `event_creatives`
//   rows ordered most-recent-first via `.order("created_at", { ascending:
//   false })`.

import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  insert: vi.fn(),
  order: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
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
  buildCreativeAssetRecord,
  fetchEventCreatives,
  insertCreativeAssetRecord,
  uploadCreativeAsset,
} from "../creative-storage";

// ---------------------------------------------------------------------------
// Test 1 — upload + insert integration (Requirement 8.1)
// ---------------------------------------------------------------------------

describe("creative-storage integration — upload + insert (REQ 8.1)", () => {
  it("uploads the PNG to site-assets under event-creatives/{eventId}/ and inserts a matching event_creatives row", async () => {
    mocks.upload.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.com/fake-public-url.png" },
    });
    mocks.storageFrom.mockImplementation((bucket: string) => {
      expect(bucket).toBe("site-assets");
      return {
        upload: mocks.upload,
        getPublicUrl: mocks.getPublicUrl,
      };
    });

    const uploadResult = await uploadCreativeAsset(
      "event-1",
      "jane-doe-linkedin-post.png",
      new Blob(["fake-png-bytes"])
    );

    expect(uploadResult.assetUrl).toBe("https://example.com/fake-public-url.png");
    expect(uploadResult.storagePath).toBe(
      "event-creatives/event-1/jane-doe-linkedin-post.png"
    );

    // Verify the real upload call shape.
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [uploadedPath, uploadedBlob, uploadOptions] = mocks.upload.mock.calls[0];
    expect(uploadedPath).toBe("event-creatives/event-1/jane-doe-linkedin-post.png");
    expect(uploadedBlob).toBeInstanceOf(Blob);
    expect(uploadOptions).toMatchObject({
      contentType: "image/png",
      upsert: true,
    });

    // Verify getPublicUrl was called with the same storage path.
    expect(mocks.getPublicUrl).toHaveBeenCalledWith(
      "event-creatives/event-1/jane-doe-linkedin-post.png"
    );

    // Now build a record from the upload result and insert it.
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe("event_creatives");
      return { insert: mocks.insert };
    });

    const record = buildCreativeAssetRecord({
      eventId: "event-1",
      creativeType: "speaker",
      speakerId: "speaker-1",
      sponsorId: null,
      templateId: "speaker-spotlight",
      platformFormat: "linkedin-post",
      assetUrl: uploadResult.assetUrl,
      storagePath: uploadResult.storagePath,
      createdBy: "user-1",
    });

    await insertCreativeAssetRecord(record);

    expect(mocks.from).toHaveBeenCalledWith("event_creatives");
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(record);
    expect(mocks.insert).toHaveBeenCalledWith({
      event_id: "event-1",
      creative_type: "speaker",
      speaker_id: "speaker-1",
      sponsor_id: null,
      template_id: "speaker-spotlight",
      platform_format: "linkedin-post",
      asset_url: "https://example.com/fake-public-url.png",
      storage_path: "event-creatives/event-1/jane-doe-linkedin-post.png",
      created_by: "user-1",
      metadata: {},
    });
  });
});

// ---------------------------------------------------------------------------
// Test 2 — library query integration (Requirement 8.2)
// ---------------------------------------------------------------------------

describe("creative-storage integration — library query (REQ 8.2)", () => {
  it("queries event_creatives filtered by event_id and ordered by created_at desc", async () => {
    const rows = [
      { id: "c1", created_at: "2024-01-02T00:00:00Z" },
      { id: "c2", created_at: "2024-01-01T00:00:00Z" },
    ];

    mocks.order.mockResolvedValue({ data: rows, error: null });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe("event_creatives");
      return { select: mocks.select };
    });

    const result = await fetchEventCreatives("event-1");

    expect(result.length).toBe(2);
    expect(mocks.from).toHaveBeenCalledWith("event_creatives");
    expect(mocks.select).toHaveBeenCalledWith("*");
    expect(mocks.eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(mocks.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
});
