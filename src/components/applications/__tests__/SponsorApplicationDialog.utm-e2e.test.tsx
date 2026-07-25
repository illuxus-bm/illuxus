// Integration test: SponsorApplicationDialog reads UTM from sessionStorage and stamps it on the insert payload (Requirements 4.1, 4.2)
//
// Feature: utm-attribution-coverage
//
// Same shape as the SpeakerApplicationDialog test: drive the sponsor dialog
// through its three-step wizard and assert that the payload handed to
// `supabase.from("sponsor_applications").insert(...)` carries the five UTM
// columns threaded from `loadStoredUtm()`. No network is hit.

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
      id: "user-xyz",
      email: "sponsor@example.com",
      user_metadata: { display_name: "Sponsor Rep" },
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
import { SponsorApplicationDialog } from "../SponsorApplicationDialog";

// ─── Harness ────────────────────────────────────────────────────────────────

function renderDialog() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SponsorApplicationDialog
        eventId="test-event-id"
        open
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

/**
 * Same label-to-input helper as the speaker test: the dialog uses shadcn
 * `<Label>` + `<Input>` siblings without an `htmlFor`/`id` connection.
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

describe("SponsorApplicationDialog — UTM attribution end-to-end", () => {
  beforeEach(() => {
    insertMock.mockClear();
    fromMock.mockClear();
    insertMock.mockResolvedValue({ error: null });
  });

  it("stamps the five UTM columns from loadStoredUtm onto the insert payload", async () => {
    renderDialog();

    // Step 1 — Company info. Only `company_name` is required.
    setField("Company name *", "Acme Corp");
    clickButton(/next/i);

    // Step 2 — Contact + sponsorship interest. `Name *` and `Email *` are
    // both required. There are two matching labels on this step (contact
    // name and contact email), so scope by the specific label text.
    setField("Name *", "Sponsor Rep");
    setField("Email *", "sponsor@example.com");
    clickButton(/next/i);

    // Step 3 — Marketing assets. All optional; go straight to submit.
    clickButton(/submit application/i);

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });

    expect(fromMock).toHaveBeenCalledWith("sponsor_applications");

    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toBeDefined();
    expect(payload.utm_source).toBe(KNOWN_UTM.utm_source);
    expect(payload.utm_medium).toBe(KNOWN_UTM.utm_medium);
    expect(payload.utm_campaign).toBe(KNOWN_UTM.utm_campaign);
    expect(payload.utm_content).toBe(KNOWN_UTM.utm_content);
    expect(payload.utm_term).toBe(KNOWN_UTM.utm_term);

    expect(payload.event_id).toBe("test-event-id");
    expect(payload.user_id).toBe("user-xyz");
    expect(payload.company_name).toBe("Acme Corp");
  });
});
