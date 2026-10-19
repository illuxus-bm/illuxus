import { describe, expect, it } from "vitest";

import { collectMyData, EXPORT_SOURCES, exportFileName, type ExportClient } from "../data-export";

type Call = { table: string; column: string; value: string; from: number; to: number };

function fakeClient(tables: Record<string, unknown[] | Error | { message: string }>): { client: ExportClient; calls: Call[] } {
  const calls: Call[] = [];
  const client: ExportClient = {
    from: (table) => ({
      select: () => ({
        eq: (column, value) => ({
          range: async (from, to) => {
            calls.push({ table, column, value, from, to });
            const entry = tables[table] ?? [];
            if (entry instanceof Error) throw entry;
            if (!Array.isArray(entry)) return { data: null, error: entry };
            return { data: entry.slice(from, to + 1), error: null };
          },
        }),
      }),
    }),
  };
  return { client, calls };
}

const account = { id: "user-1", email: "a@example.com", created_at: "2026-01-01T00:00:00Z" };
const now = new Date("2026-10-20T08:00:00Z");

describe("collectMyData", () => {
  it("reads every source filtered to the signed-in user", async () => {
    const { client, calls } = fakeClient({});
    await collectMyData(client, account, now);
    expect(new Set(calls.map((c) => c.table))).toEqual(new Set(EXPORT_SOURCES.map((s) => s.table)));
    expect(calls.every((c) => c.value === "user-1")).toBe(true);
    expect(calls.find((c) => c.table === "community_posts")?.column).toBe("author_id");
  });

  it("leaves one-time sign-in codes out", () => {
    expect(EXPORT_SOURCES.map((s) => s.table)).not.toContain("email_otp_codes");
  });

  it("returns rows per table with the account and a timestamp", async () => {
    const { client } = fakeClient({ profiles: [{ user_id: "user-1", display_name: "Asha" }] });
    const out = await collectMyData(client, account, now);
    expect(out.generated_at).toBe("2026-10-20T08:00:00.000Z");
    expect(out.account).toMatchObject({ id: "user-1", email: "a@example.com", phone: null });
    expect(out.data.profiles).toEqual({ label: "Profile", rows: [{ user_id: "user-1", display_name: "Asha" }] });
  });

  it("records a failing table instead of aborting the export", async () => {
    const { client } = fakeClient({
      registrations: { message: "permission denied" },
      webinar_chat: new Error("network down"),
      profiles: [{ user_id: "user-1" }],
    });
    const out = await collectMyData(client, account, now);
    expect(out.data.registrations).toEqual({ label: "Event registrations and tickets", error: "permission denied" });
    expect(out.data.webinar_chat).toEqual({ label: "Webinar chat messages", error: "network down" });
    expect(out.data.profiles).toEqual({ label: "Profile", rows: [{ user_id: "user-1" }] });
  });

  it("pages through tables longer than one page", async () => {
    const many = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const { client, calls } = fakeClient({ webinar_chat: many });
    const out = await collectMyData(client, account, now, [{ table: "webinar_chat", column: "user_id", label: "Chat" }]);
    expect(calls.map((c) => c.from)).toEqual([0, 1000, 2000]);
    expect("rows" in out.data.webinar_chat && out.data.webinar_chat.rows).toHaveLength(2500);
  });

  it("names the file by date", () => {
    expect(exportFileName(now)).toBe("illuxus-my-data-2026-10-20.json");
  });
});
