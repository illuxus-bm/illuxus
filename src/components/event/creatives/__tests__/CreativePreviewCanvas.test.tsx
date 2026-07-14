/**
 * Component tests for `CreativePreviewCanvas`'s live-preview redraw behavior
 * (Requirements 7.1, 7.2): the preview must call the render pipeline
 * (`buildXPlan` + `drawPlan`) again whenever the template, entity, or
 * `Platform_Format` selection changes.
 *
 * jsdom has no canvas polyfill — `HTMLCanvasElement.prototype.getContext("2d")`
 * returns `null` by default, which would make the component hit its
 * `if (!ctx) return;` early-return before ever reaching the render pipeline.
 * To exercise the actual redraw-on-selection-change behavior we (1) stub
 * `getContext` to return a minimal fake 2D context so the component proceeds
 * past that guard, and (2) mock the plan builders + `drawPlan` from
 * `creative-renderer` so we can assert *that* they were called, and with
 * what arguments, without depending on real canvas drawing succeeding.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import CreativePreviewCanvas from "../CreativePreviewCanvas";
import { PLATFORM_FORMATS, SPEAKER_TEMPLATES, SPONSOR_TEMPLATES } from "@/lib/creatives/creative-templates";

const mocks = vi.hoisted(() => ({
  buildSpeakerPlan: vi.fn(() => ({ format: PLATFORM_FORMATS[0], elements: [] })),
  buildSponsorPlan: vi.fn(() => ({ format: PLATFORM_FORMATS[0], elements: [] })),
  buildComboPlan: vi.fn(() => ({ format: PLATFORM_FORMATS[0], elements: [] })),
  drawPlan: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/creatives/creative-renderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/creatives/creative-renderer")>();
  return {
    ...actual,
    buildSpeakerPlan: mocks.buildSpeakerPlan,
    buildSponsorPlan: mocks.buildSponsorPlan,
    buildComboPlan: mocks.buildComboPlan,
    drawPlan: mocks.drawPlan,
  };
});

// Fake 2D context — just enough surface area that nothing in the (mocked)
// drawPlan call path throws when it's invoked with this object.
const fakeCtx = { clearRect: vi.fn(), save: vi.fn(), scale: vi.fn(), restore: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    fakeCtx as unknown as CanvasRenderingContext2D,
  );
});

describe("CreativePreviewCanvas (live preview redraw)", () => {
  it("renders the initial selection through the debounced render pipeline once", async () => {
    render(
      <CreativePreviewCanvas
        mode="speaker"
        template={SPEAKER_TEMPLATES[0]}
        format={PLATFORM_FORMATS[0]}
        theme={{}}
        speaker={null}
        sponsor={null}
      />,
    );

    await waitFor(() => expect(mocks.buildSpeakerPlan).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.drawPlan).toHaveBeenCalledTimes(1));
  });

  it("redraws when the Creative_Template selection changes", async () => {
    expect(SPEAKER_TEMPLATES.length).toBeGreaterThanOrEqual(2);

    const { rerender } = render(
      <CreativePreviewCanvas
        mode="speaker"
        template={SPEAKER_TEMPLATES[0]}
        format={PLATFORM_FORMATS[0]}
        theme={{}}
        speaker={null}
        sponsor={null}
      />,
    );
    await waitFor(() => expect(mocks.buildSpeakerPlan).toHaveBeenCalledTimes(1));

    rerender(
      <CreativePreviewCanvas
        mode="speaker"
        template={SPEAKER_TEMPLATES[1]}
        format={PLATFORM_FORMATS[0]}
        theme={{}}
        speaker={null}
        sponsor={null}
      />,
    );

    await waitFor(() => expect(mocks.buildSpeakerPlan).toHaveBeenCalledTimes(2), { timeout: 1000 });
    expect(mocks.buildSpeakerPlan.mock.calls[1]).toContain(SPEAKER_TEMPLATES[1]);
  });

  it("redraws when the Platform_Format selection changes", async () => {
    expect(PLATFORM_FORMATS.length).toBeGreaterThanOrEqual(2);

    const { rerender } = render(
      <CreativePreviewCanvas
        mode="speaker"
        template={SPEAKER_TEMPLATES[0]}
        format={PLATFORM_FORMATS[0]}
        theme={{}}
        speaker={null}
        sponsor={null}
      />,
    );
    await waitFor(() => expect(mocks.buildSpeakerPlan).toHaveBeenCalledTimes(1));

    rerender(
      <CreativePreviewCanvas
        mode="speaker"
        template={SPEAKER_TEMPLATES[0]}
        format={PLATFORM_FORMATS[1]}
        theme={{}}
        speaker={null}
        sponsor={null}
      />,
    );

    await waitFor(() => expect(mocks.buildSpeakerPlan).toHaveBeenCalledTimes(2), { timeout: 1000 });
    expect(mocks.buildSpeakerPlan.mock.calls[1]).toContain(PLATFORM_FORMATS[1]);
  });

  it("redraws with the sponsor builder when the entity/mode selection changes", async () => {
    const { rerender } = render(
      <CreativePreviewCanvas
        mode="speaker"
        template={SPEAKER_TEMPLATES[0]}
        format={PLATFORM_FORMATS[0]}
        theme={{}}
        speaker={null}
        sponsor={null}
      />,
    );
    await waitFor(() => expect(mocks.buildSpeakerPlan).toHaveBeenCalledTimes(1));

    rerender(
      <CreativePreviewCanvas
        mode="sponsor"
        template={SPONSOR_TEMPLATES[0]}
        format={PLATFORM_FORMATS[0]}
        theme={{}}
        speaker={null}
        sponsor={null}
      />,
    );

    await waitFor(() => expect(mocks.buildSponsorPlan).toHaveBeenCalledTimes(1), { timeout: 1000 });
    await waitFor(() => expect(mocks.drawPlan).toHaveBeenCalledTimes(2), { timeout: 1000 });
  });
});
