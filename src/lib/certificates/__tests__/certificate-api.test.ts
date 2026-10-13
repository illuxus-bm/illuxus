/**
 * The certificate data layer: who is in each audience, what is sent to the
 * server when issuing, what an emailed certificate says, and that the
 * preview and the PDF are drawn from the same document.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, invoke, inserts, sponsorRows } = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  inserts: [] as { table: string; row: unknown }[],
  sponsorRows: [] as unknown[],
}));

// Drawing needs a real canvas; these tests only check the document that would be drawn.
vi.mock("@/lib/brochure/editor/editor-pdf", () => ({ exportDocumentToPdf: vi.fn(), renderPageToCanvas: vi.fn(), PREVIEW_DPI: 110 }));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {};
    const self = () => q;
    for (const m of ["select", "eq", "order", "ilike", "limit"]) q[m] = vi.fn(self);
    q.insert = vi.fn((row: unknown) => { inserts.push({ table, row }); return q; });
    q.single = vi.fn(async () => ({ data: { id: "email-record-1" }, error: null }));
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: table === "event_sponsors" ? sponsorRows : [], error: null });
    return q;
  };
  return { supabase: { from: vi.fn(chain), rpc, functions: { invoke } } };
});

import {
  certificateEmail, emailCertificates, inAudience, issueCertificates, loadEventPartners, previewValues,
  type CertificateRow, type Registrant,
} from "../certificate-api";
import { certificateDocument, verificationUrl } from "../certificate-pdf";
import { renderCertificate } from "../certificate-design";
import { buildTemplate, findTemplate } from "../certificate-templates";
import { SAMPLE_PARTICIPANTS } from "../certificate-fields";

const reg = (over: Partial<Registrant>): Registrant => ({
  id: "r", name: "Asha Rao", email: "asha@x.com", designation: "Director", company: "Northwind", ticket_type: "general", checked_in: false, eligible: true, ...over,
});

const cert = (over: Partial<CertificateRow>): CertificateRow => ({
  id: "c1", event_id: "e1", registration_id: "r1", template_version_id: "v1", code: "ILX-AAAA-BBBB-CCCC", recipient_name: "Asha Rao",
  recipient_email: "asha@x.com", field_values: {}, status: "issued", issued_at: "2026-10-13T00:00:00Z", revoked_at: null, revoked_reason: null,
  emailed_at: null, email_count: 0, ...over,
});

beforeEach(() => { rpc.mockReset(); invoke.mockReset(); inserts.length = 0; sponsorRows.length = 0; });

describe("audiences", () => {
  it("all registered vs only checked-in", () => {
    const people = [reg({ id: "a", checked_in: true }), reg({ id: "b", checked_in: false }), reg({ id: "c", checked_in: true, eligible: false })];
    expect(people.filter((r) => inAudience(r, "all")).map((r) => r.id)).toEqual(["a", "b"]);
    expect(people.filter((r) => inAudience(r, "checked_in")).map((r) => r.id)).toEqual(["a"]);
  });

  it("asks the server to issue for the chosen audience; the server decides who is eligible", async () => {
    rpc.mockResolvedValue({ data: [{ certificate_id: "c1", registration_id: "r1", code: "ILX-1", created: true }], error: null });
    const out = await issueCertificates("e1", "v1", "checked_in", ["r1"]);
    expect(rpc).toHaveBeenCalledWith("issue_certificates", { _event_id: "e1", _version_id: "v1", _audience: "checked_in", _registration_ids: ["r1"] });
    expect(out).toEqual([{ certificateId: "c1", registrationId: "r1", code: "ILX-1", created: true }]);
    await issueCertificates("e1", "v1", "all", null);
    expect(rpc).toHaveBeenLastCalledWith("issue_certificates", { _event_id: "e1", _version_id: "v1", _audience: "all", _registration_ids: null });
  });

  it("surfaces the server's refusal", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "You do not have permission to issue certificates for this event" } });
    await expect(issueCertificates("e1", "v1", "all", null)).rejects.toThrow(/permission/);
  });
});

describe("5. partner logos come from the event's sponsors", () => {
  it("only rows linked to the event, with https logos only", async () => {
    sponsorRows.push(
      { sponsor_id: "s1", tier_override: "Presenting partner", sponsors: { id: "s1", name: "Platinum Co", logo_url: "https://cdn.x/p.png", tier: "platinum", tier_label: null } },
      { sponsor_id: "s2", tier_override: null, sponsors: { id: "s2", name: "Odd Co", logo_url: "javascript:alert(1)", tier: "gold", tier_label: "Gold sponsor" } },
    );
    const partners = await loadEventPartners("e1");
    expect(partners).toEqual([
      { sponsorId: "s1", name: "Platinum Co", logoUrl: "https://cdn.x/p.png", tier: "Presenting partner" },
      { sponsorId: "s2", name: "Odd Co", logoUrl: "", tier: "Gold sponsor" },
    ]);
  });
});

describe("16. email distribution uses the existing event email function", () => {
  it("each recipient gets their own link, and only sent ones are recorded", async () => {
    invoke.mockImplementation(async (_fn: string, { body }: { body: { recipient_emails: string[] } }) =>
      body.recipient_emails[0] === "fail@x.com" ? { data: { error: "mailbox full" }, error: null } : { data: { success: true, sent: 1, provider: "smtp" }, error: null });
    rpc.mockResolvedValue({ data: 1, error: null });
    const out = await emailCertificates({
      eventId: "e1", eventTitle: "Summit", orgName: "Acme", userId: "u1",
      certificates: [cert({ id: "c1" }), cert({ id: "c2", recipient_email: "fail@x.com", recipient_name: "Ben", code: "ILX-2" }), cert({ id: "c3", status: "revoked" })],
    });
    expect(out.sent).toBe(1);
    expect(out.failed).toEqual([{ name: "Ben", error: "mailbox full" }]);
    expect(invoke).toHaveBeenCalledTimes(2); // the revoked one is never emailed
    const first = invoke.mock.calls.find((c) => c[1].body.recipient_emails[0] === "asha@x.com")![1].body;
    expect(first).toMatchObject({ event_id: "e1", email_id: "email-record-1", recipient_emails: ["asha@x.com"] });
    expect(first.body).toContain(verificationUrl("ILX-AAAA-BBBB-CCCC"));
    expect(rpc).toHaveBeenCalledWith("record_certificate_emails", { _certificate_ids: ["c1"] });
    expect(inserts.find((i) => i.table === "event_emails")).toBeTruthy();
  });

  it("an unconfigured mail server is reported, not counted as sent", async () => {
    invoke.mockResolvedValue({ data: { success: true, sent: 1, provider: "console" }, error: null });
    const out = await emailCertificates({ eventId: "e1", eventTitle: "Summit", orgName: "Acme", userId: "u1", certificates: [cert({})] });
    expect(out.sent).toBe(0);
    expect(out.failed[0].error).toMatch(/SMTP/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("the email names the event and the ID", () => {
    const mail = certificateEmail(cert({}), "Summit 2026", "Acme Events");
    expect(mail.subject).toBe("Your certificate for Summit 2026");
    expect(mail.body).toContain("Hi Asha,");
    expect(mail.body).toContain("ILX-AAAA-BBBB-CCCC");
    expect(mail.body).toContain("— Acme Events");
  });
});

describe("13. preview and PDF are the same document", () => {
  it("certificateDocument is renderCertificate with the real QR code", async () => {
    const design = buildTemplate(findTemplate("acad-classic")!);
    const values = SAMPLE_PARTICIPANTS[0].values;
    const doc = await certificateDocument(design, values, "ILX-AAAA-BBBB-CCCC");
    const qr = doc.pages[0].elements.find((e) => e.id === "cert-qr") as { src: string };
    expect(qr.src).toMatch(/^data:image\/png;base64,/);
    expect(doc).toEqual(renderCertificate(design, { ...values, certificate_id: values.certificate_id }, { qrDataUrl: qr.src }));
  });

  it("previews with a real attendee use the values the server will store", () => {
    const v = previewValues(reg({ designation: "  ", company: "Northwind" }), {
      id: "e1", title: "Summit", org_id: "o1", org_name: "Acme", date: "2026-11-14T04:30:00Z", end_date: "2026-11-15T12:00:00Z", timezone: "Asia/Kolkata", venue: "Grand Hall", location: "Mumbai",
    }, "Certificate of Attendance");
    expect(v).toMatchObject({ participant_name: "Asha Rao", participant_company: "Northwind", event_name: "Summit", event_date: "14–15 November 2026", event_venue: "Grand Hall, Mumbai", organization_name: "Acme", certificate_type: "Certificate of Attendance" });
    expect(v.participant_designation).toBeUndefined();
  });
});
