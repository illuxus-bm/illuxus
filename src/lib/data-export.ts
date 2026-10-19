/**
 * "Download my data" — a copy of everything a signed-in person can read about
 * themselves, as one JSON file (right of access and portability: GDPR Art. 15
 * and 20, DPDPA s.11, CCPA right to know).
 *
 * Each source is read with the person's own session, so row-level security
 * limits it to their rows. A table that fails to read is reported in the file
 * rather than aborting the whole export.
 */

export interface ExportSource {
  table: string;
  column: string;
  label: string;
}

// One-time sign-in codes are left out on purpose: they are security secrets,
// not personal data worth handing back.
export const EXPORT_SOURCES: ExportSource[] = [
  { table: "profiles", column: "user_id", label: "Profile" },
  { table: "user_roles", column: "user_id", label: "Account roles" },
  { table: "registrations", column: "user_id", label: "Event registrations and tickets" },
  { table: "speaker_applications", column: "user_id", label: "Speaker applications" },
  { table: "sponsor_applications", column: "user_id", label: "Sponsor applications" },
  { table: "speakers", column: "user_id", label: "Speaker profiles" },
  { table: "sponsors", column: "user_id", label: "Sponsor profiles" },
  { table: "sponsor_members", column: "user_id", label: "Sponsor team memberships" },
  { table: "org_members", column: "user_id", label: "Organisation memberships" },
  { table: "org_followers", column: "user_id", label: "Organisations you follow" },
  { table: "events", column: "user_id", label: "Events you created" },
  { table: "app_notifications", column: "user_id", label: "Notifications" },
  { table: "communication_recipients", column: "user_id", label: "Messages sent to you" },
  { table: "support_tickets", column: "user_id", label: "Support tickets" },
  { table: "support_ticket_messages", column: "author_id", label: "Support ticket messages" },
  { table: "community_members", column: "user_id", label: "Community memberships" },
  { table: "community_posts", column: "author_id", label: "Community posts" },
  { table: "community_comments", column: "author_id", label: "Community comments" },
  { table: "community_messages", column: "author_id", label: "Community chat messages" },
  { table: "community_reactions", column: "user_id", label: "Community reactions" },
  { table: "community_bookmarks", column: "user_id", label: "Community bookmarks" },
  { table: "community_poll_votes", column: "user_id", label: "Community poll votes" },
  { table: "community_connections", column: "requester_id", label: "Connection requests" },
  { table: "community_user_badges", column: "user_id", label: "Community badges" },
  { table: "webinar_attendance", column: "user_id", label: "Webinar attendance" },
  { table: "webinar_chat", column: "user_id", label: "Webinar chat messages" },
  { table: "webinar_qa", column: "user_id", label: "Webinar questions" },
  { table: "webinar_poll_votes", column: "user_id", label: "Webinar poll votes" },
  { table: "webinar_reactions", column: "user_id", label: "Webinar reactions" },
  { table: "webinar_stage_requests", column: "user_id", label: "Webinar stage requests" },
  { table: "webinar_speakers", column: "user_id", label: "Webinar speaker roles" },
];

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

type PageResult = { data: unknown[] | null; error: { message: string } | null };

/** The slice of the Supabase client this module uses. */
export interface ExportClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        range(from: number, to: number): PromiseLike<PageResult>;
      };
    };
  };
}

export interface ExportAccount {
  id: string;
  email?: string | null;
  phone?: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
}

export type SourceResult = { label: string; rows: unknown[] } | { label: string; error: string };

export interface DataExport {
  format: "illuxus-personal-data-export";
  version: 1;
  generated_at: string;
  account: ExportAccount;
  notes: string[];
  data: Record<string, SourceResult>;
}

async function readSource(client: ExportClient, source: ExportSource, userId: string): Promise<SourceResult> {
  const rows: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await client.from(source.table).select("*").eq(source.column, userId).range(from, from + PAGE_SIZE - 1);
    if (error) return { label: source.label, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { label: source.label, rows };
}

export async function collectMyData(
  client: ExportClient,
  account: ExportAccount,
  now: Date = new Date(),
  sources: ExportSource[] = EXPORT_SOURCES,
): Promise<DataExport> {
  const results = await Promise.all(
    sources.map((source) =>
      readSource(client, source, account.id).catch(
        (err: unknown): SourceResult => ({ label: source.label, error: err instanceof Error ? err.message : String(err) }),
      ),
    ),
  );
  const data: Record<string, SourceResult> = {};
  sources.forEach((source, i) => {
    data[source.table] = results[i];
  });
  return {
    format: "illuxus-personal-data-export",
    version: 1,
    generated_at: now.toISOString(),
    account: {
      id: account.id,
      email: account.email ?? null,
      phone: account.phone ?? null,
      created_at: account.created_at,
      last_sign_in_at: account.last_sign_in_at ?? null,
    },
    notes: [
      "This file holds the personal data linked to your illuxus account that you can access yourself.",
      "Organisers hold their own copies of registrations for their events; ask the organiser for anything they added.",
      "Registrations made with your email address before you had an account may not appear here. To get those, or to have data deleted, go to https://illuxus.com/data-deletion or write to privacy@illuxus.com.",
    ],
    data,
  };
}

export function exportFileName(now: Date = new Date()): string {
  return `illuxus-my-data-${now.toISOString().slice(0, 10)}.json`;
}

export function downloadJson(fileName: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
