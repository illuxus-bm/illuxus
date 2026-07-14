// Feature: social-creative-generator
//
// Unit tests for `drawPlan`'s failure-fallback and unmodified-composite
// guarantee. `drawPlan` takes a `CanvasRenderingContext2D` as its first
// argument rather than creating a canvas itself (that's the private
// `renderPlanToPngBlob` helper's job), so it can be tested directly by
// passing in a mock context object implementing just the subset of the
// `CanvasRenderingContext2D` interface `drawPlan`'s code paths actually
// call — no real `<canvas>` (and therefore no canvas polyfill, which this
// project's jsdom test environment doesn't have) is required.
//
// Validates: Requirements 2.2, 2.4, 3.2, 3.3

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { logger } from "@/lib/observability";

import { drawPlan, type PlanElement, type RenderPlan } from "../creative-renderer";
import { PLATFORM_FORMATS } from "../creative-templates";
import type { ResolvedBox } from "../creative-templates";

// ─── Mock ctx ────────────────────────────────────────────────────────────

/**
 * Builds a plain object implementing just the `CanvasRenderingContext2D`
 * subset `drawPlan` and its helpers (`drawBackground`, `drawImageElement`,
 * `drawImageCropped`, `drawImagePlaceholder`, `drawTextElement`,
 * `drawDividerElement`) call, with every method a `vi.fn()` so calls are
 * assertable. `roundRect` is intentionally omitted by default since
 * `drawImageCropped` has a manual fallback path for environments without
 * native `roundRect` support — tests that want the native path can add it.
 */
function createMockCtx() {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    fillRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    save: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    clip: vi.fn(),
    restore: vi.fn(),
    moveTo: vi.fn(),
    arcTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 6 })),
    fillText: vi.fn(),
  };
}

type MockCtx = ReturnType<typeof createMockCtx>;

// ─── Mock Image ──────────────────────────────────────────────────────────

// Module-level flag individual tests flip before calling drawPlan, checked
// inside the mock's `src` setter (via a `setTimeout(..., 0)` so it fires
// asynchronously, matching a real `Image`'s load/error event timing).
let nextImageLoadShouldSucceed = true;

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 100;
  naturalHeight = 100;
  crossOrigin = "";
  private _src = "";

  set src(value: string) {
    this._src = value;
    const succeed = nextImageLoadShouldSucceed;
    setTimeout(() => {
      if (succeed) {
        this.onload?.();
      } else {
        this.onerror?.();
      }
    }, 0);
  }

  get src(): string {
    return this._src;
  }
}

beforeEach(() => {
  nextImageLoadShouldSucceed = true;
  vi.stubGlobal("Image", MockImage);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Fixtures ──────────────────────────────────────────────────────────────

const box: ResolvedBox = { x: 10, y: 10, width: 80, height: 80 };
const format = PLATFORM_FORMATS[0];

function planWith(...elements: PlanElement[]): RenderPlan {
  return { format, elements };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("drawPlan: image load failure falls back to placeholder + logs warning (Requirement 2.2)", () => {
  it("logs a warning with the url and role, and fills the placeholder background", async () => {
    nextImageLoadShouldSucceed = false;

    const el: PlanElement = {
      kind: "image",
      role: "photo",
      url: "https://example.com/broken.jpg",
      box,
      shape: "circle",
      placeholderInitial: "A",
    };

    const ctx = createMockCtx();
    await drawPlan(ctx as unknown as CanvasRenderingContext2D, planWith(el));

    expect(logger.warn).toHaveBeenCalledWith(
      "creative image load failed",
      expect.objectContaining({ url: "https://example.com/broken.jpg", role: "photo" })
    );

    // Placeholder path fills a background rect for the initial.
    expect(ctx.fillRect).toHaveBeenCalledWith(box.x, box.y, box.width, box.height);
    expect(ctx.fillText).toHaveBeenCalledWith("A", box.x + box.width / 2, box.y + box.height / 2);

    // The real-image draw path must not have run.
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});

describe("drawPlan: successful image load — no placeholder, no warning (control case)", () => {
  it("draws the real image and never calls logger.warn", async () => {
    nextImageLoadShouldSucceed = true;

    const el: PlanElement = {
      kind: "image",
      role: "photo",
      url: "https://example.com/ok.jpg",
      box,
      shape: "circle",
      placeholderInitial: "A",
    };

    const ctx = createMockCtx();
    await drawPlan(ctx as unknown as CanvasRenderingContext2D, planWith(el));

    expect(logger.warn).not.toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalled();

    // Placeholder background fill must not have run since the image loaded.
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});

describe("drawPlan: unmodified-composite guarantee (Requirements 2.4, 3.3)", () => {
  it("completes drawing a successfully-loaded photo without ever setting ctx.filter", async () => {
    nextImageLoadShouldSucceed = true;

    const el: PlanElement = {
      kind: "image",
      role: "photo",
      url: "https://example.com/ok.jpg",
      box,
      shape: "circle",
    };

    const baseCtx = createMockCtx();
    // Wrap in a Proxy that throws if `filter` is ever set, so the guarantee
    // is verified structurally rather than by mere absence of a setter
    // (setting an arbitrary property on a plain object wouldn't throw and
    // so wouldn't prove anything on its own).
    const proxiedCtx = new Proxy(baseCtx, {
      set(target, prop, value) {
        if (prop === "filter") {
          throw new Error("drawPlan must never set ctx.filter — unmodified-composite guarantee violated");
        }
        (target as Record<PropertyKey, unknown>)[prop] = value;
        return true;
      },
    });

    await expect(drawPlan(proxiedCtx as unknown as CanvasRenderingContext2D, planWith(el))).resolves.not.toThrow();

    expect(baseCtx.drawImage).toHaveBeenCalled();
  });

  it("completes drawing a successfully-loaded logo without ever setting ctx.filter", async () => {
    nextImageLoadShouldSucceed = true;

    const el: PlanElement = {
      kind: "image",
      role: "logo",
      url: "https://example.com/logo.png",
      box,
      shape: "rect",
    };

    const baseCtx = createMockCtx();
    const proxiedCtx = new Proxy(baseCtx, {
      set(target, prop, value) {
        if (prop === "filter") {
          throw new Error("drawPlan must never set ctx.filter — unmodified-composite guarantee violated");
        }
        (target as Record<PropertyKey, unknown>)[prop] = value;
        return true;
      },
    });

    await expect(drawPlan(proxiedCtx as unknown as CanvasRenderingContext2D, planWith(el))).resolves.not.toThrow();

    expect(baseCtx.drawImage).toHaveBeenCalled();
  });
});

describe("drawPlan: missing logo with no url and no placeholderInitial is a no-op (defensive fallback)", () => {
  it("does not throw and does not call fillRect/drawImage for that element", async () => {
    const el: PlanElement = {
      kind: "image",
      role: "logo",
      url: null,
      box,
      shape: "rect",
    };

    const ctx = createMockCtx();
    await expect(drawPlan(ctx as unknown as CanvasRenderingContext2D, planWith(el))).resolves.not.toThrow();

    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
