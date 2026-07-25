// Integration test: SpeakerApplicationDialog reads UTM from sessionStorage and stamps it on the insert payload (Requirements 3.1, 3.2)
//
// Feature: utm-attribution-coverage
//
// This test drives the multi-step SpeakerApplicationDialog through its wizard
// (steps 1 → 2 → 3 → submit) and asserts that the payload passed to
// `supabase.from("speaker_applications").insert(...)` contains the five UTM
// columns wired through from `loadStoredUtm()`. It does NOT hit the network:
// the Supabase client and every peripheral hook is mocked at the file level.
//
// The primary invariant under test:
//   loadStoredUtm() returns UTM_Fields → insert() receives them, with
//   `?? null` fallback for absent fields (Requirement 3.2 / 14.1).
//
// Peripheral mocks:
//   * @/integrations/supabase/client — insert captures its payload argument.
//   * @/lib/utm — loadStoredUtm returns a fixed payload; captureUtm is a no-op.
//   * @/contexts/AuthContext — useAuth returns a signed-in user.
//   * @/hooks/useMyProfile — useMyProfile returns null data (no prefill path).
//   * @/lib/application-notify — no-op; the fire-and-forget notify path is
//     irrelevant to the invariant under test.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Mocks (hoisted before SUT import) ─────────────────────────────────────

const insertMock = vi.fn(async () => ({ error: null }));
const fromMock = vi.fn(() => ({ insert: insertMock }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

const KNOWN_UTM = {
  utm_source: "linkedin",
  utm_medium: "cpc",
  utm_campaign: "spring",
  utm_content: "hero",
  utm_term: "events",
} as const;

vi.mock("@/lib/utm", () => ({
  loadStoredUtm: vi.fn(() => ({ ...KNOWN_UTM })),
  captureUtm: vi.fn(() => ({ ...KNOWN_UTM })),
  clearStoredUtm: vi.fn(),
  hasUtm: vi.fn(() => true),
  readUtmFromSearch: vi.fn(() => ({ ...KNOWN_UTM })),
  UTM_MAX_LENGTH: 512,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-abc",
      email: "speaker@example.com",
      user_metadata: { display_name: "Speaker McTest" },
    },
    isAdmin: false,
    loading: false,
    accountType: null,
    profileCompleted: true,
    refreshProfile: vi.fn(),
    signOut: vi.fn(),
    session: null,
  }),
}));

vi.mock("@/hooks/useMyProfile", () => ({
  useMyProfile: () => ({ data: null, isLoading: false, isError: false }),
  profileFullName: () => "",
}));

vi.mock("@/lib/application-notify", () => ({
  notifyOrganiserOfApplication: vi.fn(async () => ({ ok: true as const, notified: 0 })),
}));

// SUT — imported after mocks are registered.
import { SpeakerApplicationDialog } from "../SpeakerApplicationDialog";

// ─── Harness ────────────────────────────────────────────────────────────────

function renderDialog() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SpeakerApplicationDialog
        eventId="test-event-id"
        open
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

/**
 * The dialog's `Field` helper renders `<Label>` + `<Input>` as siblings
 * inside a wrapper `<div>`, without an `htmlFor`/`id` connection, so RTL's
 * `getByLabelText` can't find the input. We locate the label text and
 * return the sibling input/textarea.
 */
function setField(labelText: string, value: string) {
  const label = screen.getByText(labelText);
  const container = label.parentElement as HTMLElement;
  const input = container.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement;
  if (!input) throw new Error(`Input for label "${labelText}" not found`);
  fireEvent.change(input, { target: { value } });
}

function clickButton(text: string | RegExp) {
  const button = screen.getByRole("button", { name: text });
  fireEvent.click(button);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("SpeakerApplicationDialog — UTM attribution end-to-end", () => {
  beforeEach(() => {
    insertMock.mockClear();
    fromMock.mockClear();
    insertMock.mockResolvedValue({ error: null });
  });

  it("stamps the five UTM columns from loadStoredUtm onto the insert payload", async () => {
    renderDialog();

    // Step 1 — Personal info. `full_name` and `email` are prefilled from the
    // mocked auth user, so we only need to advance the wizard. Overwrite
    // them anyway to prove the flow isn't relying on prefill quirks.
    setField("Full name *", "Speaker McTest");
    setField("Email *", "speaker@example.com");
    clickButton(/next/i);

    // Step 2 — Speaker profile. Nothing is required to advance.
    clickButton(/next/i);

    // Step 3 — Session proposal. Two required fields.
    setField("Proposed session title *", "How UTM travels through a signup");
    setField("Session description *", "A ten-minute overview of first-touch attribution.");

    clickButton(/submit application/i);

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });

    // The `from` call MUST target the `speaker_applications` table.
    expect(fromMock).toHaveBeenCalledWith("speaker_applications");

    // The payload passed to `insert(...)` MUST carry all five UTM columns
    // exactly as returned by the mocked `loadStoredUtm`.
    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toBeDefined();
    expect(payload.utm_source).toBe(KNOWN_UTM.utm_source);
    expect(payload.utm_medium).toBe(KNOWN_UTM.utm_medium);
    expect(payload.utm_campaign).toBe(KNOWN_UTM.utm_campaign);
    expect(payload.utm_content).toBe(KNOWN_UTM.utm_content);
    expect(payload.utm_term).toBe(KNOWN_UTM.utm_term);

    // Sanity: the payload also carries the domain fields we typed in.
    expect(payload.event_id).toBe("test-event-id");
    expect(payload.user_id).toBe("user-abc");
    expect(payload.session_title).toBe("How UTM travels through a signup");
  });
});
