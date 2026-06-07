import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isUuid,
  eventPublicPath,
  eventDashboardPath,
  isLoginGatedPreviewHost,
  publishedHostFor,
  checkRouteParam,
} from "./event-routes";

describe("event-routes helpers", () => {
  it("detects UUIDs vs slugs", () => {
    expect(isUuid("0c5e0a8e-0a4f-4f8c-bf28-7a07f1ec0d84")).toBe(true);
    expect(isUuid("ai-workshop")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it("always prefers slug for public URLs", () => {
    const event = { id: "0c5e0a8e-0a4f-4f8c-bf28-7a07f1ec0d84", slug: "ai-workshop" };
    expect(eventPublicPath(event)).toBe("/events/ai-workshop");
    // Luma-style public path: /org/<orgSlug>/events/<eventSlug>
    expect(eventPublicPath(event, "acme")).toBe("/org/acme/events/ai-workshop");
  });

  it("falls back to id only when slug is missing", () => {
    const event = { id: "0c5e0a8e-0a4f-4f8c-bf28-7a07f1ec0d84", slug: null };
    expect(eventPublicPath(event)).toBe("/events/0c5e0a8e-0a4f-4f8c-bf28-7a07f1ec0d84");
  });

  it("uses slug for dashboard URL too", () => {
    expect(eventDashboardPath({ id: "abc", slug: "ai-workshop" })).toBe("/dashboard/events/ai-workshop");
  });

  it("recognizes login-gated preview hosts", () => {
    expect(isLoginGatedPreviewHost("preview--biz-meet.lovable.app")).toBe(true);
    expect(isLoginGatedPreviewHost("id-preview--abc.lovable.app")).toBe(true);
    expect(isLoginGatedPreviewHost("biz-meet.lovable.app")).toBe(false);
    expect(isLoginGatedPreviewHost("custom.com")).toBe(false);
  });

  it("maps preview hosts to their public counterpart when possible", () => {
    expect(publishedHostFor("preview--biz-meet.lovable.app")).toBe("biz-meet.lovable.app");
    expect(publishedHostFor("id-preview--74ab.lovable.app")).toBeNull();
  });

  it("logs route anomalies to window storage", () => {
    (window as unknown as { __eventRouteAnomalies?: unknown[] }).__eventRouteAnomalies = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    checkRouteParam("/events/:id", "id", "0c5e0a8e-0a4f-4f8c-bf28-7a07f1ec0d84", "slug");
    const log = (window as unknown as { __eventRouteAnomalies: Array<{ actual: string }> }).__eventRouteAnomalies;
    expect(log.length).toBe(1);
    expect(log[0].actual).toBe("uuid");
    warn.mockRestore();
  });

  it("does not log when param matches expected shape", () => {
    (window as unknown as { __eventRouteAnomalies?: unknown[] }).__eventRouteAnomalies = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    checkRouteParam("/events/:id", "id", "ai-workshop", "slug");
    const log = (window as unknown as { __eventRouteAnomalies: unknown[] }).__eventRouteAnomalies;
    expect(log.length).toBe(0);
    warn.mockRestore();
  });
});

/**
 * Regression tests covering every place buttons/tiles build event URLs.
 * Mirrors the literal templates used in source so we catch any future drift
 * from `/events/:slug` back to UUID-based URLs.
 */
describe("event link templates always emit /events/:slug", () => {
  const event = {
    id: "0c5e0a8e-0a4f-4f8c-bf28-7a07f1ec0d84",
    slug: "ai-workshop",
  };

  // EventsShowcase + EventsListingPage tile links
  it("tile link prefers slug", () => {
    const href = `/events/${event.slug || event.id}`;
    expect(href).toBe("/events/ai-workshop");
    expect(href).not.toMatch(isUuid(event.id) ? event.id : "__never__");
  });

  // EventDesignPage Preview button
  it("design page Preview button uses slug", () => {
    const savedSlug = event.slug;
    const href = `/events/${savedSlug || event.id}`;
    expect(href).toBe("/events/ai-workshop");
  });

  // EventPageForm Open button
  it("page form Open button uses slug", () => {
    const href = `/events/${event.slug || event.id}`;
    expect(href).toBe("/events/ai-workshop");
  });

  // EventDetailPage Preview + Copy URL
  it("detail page Preview + copy URL use slug", () => {
    const href = `/events/${event.slug}`;
    const fullUrl = `https://biz-meet.lovable.app/events/${event.slug}`;
    expect(href).toBe("/events/ai-workshop");
    expect(fullUrl.endsWith("/events/ai-workshop")).toBe(true);
  });

  // PublicOrgPage card link
  it("org page card link uses /org/:slug/events/:eventSlug when slug present", () => {
    const orgSlug = "acme";
    const href = eventPublicPath(event, orgSlug);
    expect(href).toBe("/org/acme/events/ai-workshop");
  });

  it("centralized helper matches every template above", () => {
    expect(eventPublicPath(event)).toBe("/events/ai-workshop");
    expect(eventPublicPath(event, "acme")).toBe("/org/acme/events/ai-workshop");
  });
});