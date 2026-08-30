// Unit tests for src/lib/brochure/editor/editor-render-props.ts
//
// This module exists so the interactive canvas and the PDF exporter cannot
// disagree about styling. Both call these functions; neither computes any of it
// itself. So these tests are the contract for what a document property MEANS
// visually, and they're the only place that contract is checked — a divergence
// between the two renderers produces no type error and no runtime failure, just
// a downloaded file that doesn't match the screen.
//
// The mm→px scaling assertions matter more than they look: the canvas passes a
// zoom-dependent factor and the exporter passes a print-DPI one, so anything
// that ISN'T multiplied through would be correct at exactly one resolution.
import { describe, expect, it } from "vitest";
import {
  dashArray,
  defaultGradient,
  defaultShadow,
  fontStyleString,
  mirrorProps,
  shadowProps,
  shapeFillProps,
  textExtras,
  transformedText,
} from "../editor-render-props";

describe("shadowProps", () => {
  it("explicitly disables rather than returning an empty object when absent", () => {
    // The exporter reuses node configs; a missing key means "keep whatever was
    // there", so an absent shadow has to say so out loud.
    expect(shadowProps(undefined, 10)).toEqual({ shadowEnabled: false });
  });

  it("scales blur and offsets by pxPerMm", () => {
    const shadow = { color: "#123456", blur: 2, offsetX: 1, offsetY: -3, opacity: 0.4 };
    expect(shadowProps(shadow, 10)).toEqual({
      shadowEnabled: true,
      shadowColor: "#123456",
      shadowBlur: 20,
      shadowOffsetX: 10,
      shadowOffsetY: -30,
      shadowOpacity: 0.4,
    });
  });

  it("produces proportional output at preview and export scale", () => {
    // Same document, two renderers: the ratio between them must be exactly the
    // ratio of their pxPerMm factors, or shadows shift between preview and PDF.
    const shadow = { color: "#000", blur: 3, offsetX: 2, offsetY: 2, opacity: 0.5 };
    const preview = shadowProps(shadow, 4);
    const print = shadowProps(shadow, 12);
    expect(print.shadowBlur! / preview.shadowBlur!).toBeCloseTo(3, 10);
    expect(print.shadowOffsetX! / preview.shadowOffsetX!).toBeCloseTo(3, 10);
  });

  it("keeps negative offsets negative", () => {
    const props = shadowProps(
      { color: "#000", blur: 0, offsetX: -2, offsetY: -1, opacity: 1 },
      10,
    );
    expect(props.shadowOffsetX).toBe(-20);
    expect(props.shadowOffsetY).toBe(-10);
  });

  it("clamps blur at zero so a negative value can't invert the shadow", () => {
    const props = shadowProps(
      { color: "#000", blur: -5, offsetX: 0, offsetY: 0, opacity: 1 },
      10,
    );
    expect(props.shadowBlur).toBe(0);
  });

  it("clamps opacity into 0..1 and falls back to opaque for NaN", () => {
    const at = (opacity: number) =>
      shadowProps({ color: "#000", blur: 1, offsetX: 0, offsetY: 0, opacity }, 1)
        .shadowOpacity;
    expect(at(-1)).toBe(0);
    expect(at(2)).toBe(1);
    expect(at(Number.NaN)).toBe(1);
  });

  it("defaultShadow is a visible but subtle starting point", () => {
    const d = defaultShadow();
    expect(d.opacity).toBeGreaterThan(0);
    expect(d.opacity).toBeLessThan(1);
    expect(d.blur).toBeGreaterThan(0);
  });
});

describe("transformedText", () => {
  it("leaves content alone for none/undefined", () => {
    expect(transformedText("Hello World", "none")).toBe("Hello World");
    expect(transformedText("Hello World", undefined)).toBe("Hello World");
  });

  it("uppercases and lowercases", () => {
    expect(transformedText("Hello World", "uppercase")).toBe("HELLO WORLD");
    expect(transformedText("Hello World", "lowercase")).toBe("hello world");
  });

  it("capitalizes the first letter of each word", () => {
    expect(transformedText("hello brave world", "capitalize")).toBe("Hello Brave World");
  });

  it("does not capitalize after an apostrophe", () => {
    // A `\b\w` boundary would produce "Organizer'S", which is the classic bug
    // in naive title-casing.
    expect(transformedText("organizer's guide", "capitalize")).toBe("Organizer's Guide");
  });

  it("preserves newlines, which the model uses for paragraph breaks", () => {
    expect(transformedText("one\ntwo", "uppercase")).toBe("ONE\nTWO");
    expect(transformedText("one\ntwo", "capitalize")).toBe("One\nTwo");
  });

  it("is non-destructive, so switching back to none restores the original", () => {
    // The transform is applied at render time precisely so this holds — mutating
    // `content` would make the original casing unrecoverable.
    const original = "iPhone and iPad";
    expect(transformedText(transformedText(original, "uppercase"), "none")).toBe(
      "IPHONE AND IPAD",
    );
    expect(transformedText(original, "none")).toBe(original);
  });

  it("handles empty content", () => {
    expect(transformedText("", "uppercase")).toBe("");
    expect(transformedText("", "capitalize")).toBe("");
  });
});

describe("fontStyleString", () => {
  it("maps every weight/slant combination to Konva's syntax", () => {
    expect(fontStyleString("normal", "normal")).toBe("normal");
    expect(fontStyleString("bold", "normal")).toBe("bold");
    expect(fontStyleString("normal", "italic")).toBe("italic");
    expect(fontStyleString("bold", "italic")).toBe("italic bold");
  });

  it("treats undefined as normal, for the optional pill fontWeight", () => {
    expect(fontStyleString(undefined, undefined)).toBe("normal");
    expect(fontStyleString(undefined, "italic")).toBe("italic");
    expect(fontStyleString("bold", undefined)).toBe("bold");
  });
});

describe("textExtras", () => {
  it("omits everything when nothing is set", () => {
    expect(textExtras({}, 2, 10)).toEqual({});
  });

  it("scales letter spacing by the pt→px factor, not by pxPerMm", () => {
    // Tracking is stored in points, the same unit as fontSize, so it has to
    // track the type rather than the page geometry.
    expect(textExtras({ letterSpacing: 3 }, 2, 10).letterSpacing).toBe(6);
  });

  it("passes through a negative letter spacing to tighten", () => {
    expect(textExtras({ letterSpacing: -1 }, 4, 10).letterSpacing).toBe(-4);
  });

  it("omits a zero letter spacing rather than emitting 0", () => {
    expect(textExtras({ letterSpacing: 0 }, 2, 10).letterSpacing).toBeUndefined();
  });

  it("omits verticalAlign for top, which is the renderers' historic default", () => {
    expect(textExtras({ verticalAlign: "top" }, 2, 10).verticalAlign).toBeUndefined();
    expect(textExtras({ verticalAlign: "middle" }, 2, 10).verticalAlign).toBe("middle");
    expect(textExtras({ verticalAlign: "bottom" }, 2, 10).verticalAlign).toBe("bottom");
  });

  it("emits a glyph outline scaled by pxPerMm", () => {
    const extras = textExtras({ strokeColor: "#ff0000", strokeWidth: 0.5 }, 2, 10);
    expect(extras.stroke).toBe("#ff0000");
    expect(extras.strokeWidth).toBe(5);
    // Konva paints text stroke UNDER the fill unless told otherwise, which eats
    // into the glyph for anything wider than a hairline.
    expect(extras.fillAfterStrokeEnabled).toBe(true);
  });

  it("suppresses the outline for zero width or a transparent colour", () => {
    expect(textExtras({ strokeColor: "#000", strokeWidth: 0 }, 2, 10).stroke).toBeUndefined();
    expect(
      textExtras({ strokeColor: "transparent", strokeWidth: 1 }, 2, 10).stroke,
    ).toBeUndefined();
    expect(textExtras({ strokeWidth: 1 }, 2, 10).stroke).toBeUndefined();
  });
});

describe("shapeFillProps", () => {
  it("returns a flat fill when no gradient is set", () => {
    expect(shapeFillProps({ fill: "#abcdef" }, 100, 50)).toEqual({ fill: "#abcdef" });
  });

  it("maps a transparent fill to undefined so Konva draws nothing", () => {
    expect(shapeFillProps({ fill: "transparent" }, 100, 50)).toEqual({ fill: undefined });
  });

  it("prefers the gradient over the flat fill when both exist", () => {
    const props = shapeFillProps(
      { fill: "#abcdef", fillGradient: { from: "#000", to: "#fff", direction: "vertical" } },
      100,
      50,
    );
    expect(props.fill).toBeUndefined();
    expect(props.fillLinearGradientColorStops).toEqual([0, "#000", 1, "#fff"]);
  });

  it("derives gradient endpoints from the shape's pixel box per direction", () => {
    // Konva expresses gradients in node-local coordinates, so the same document
    // gradient needs different numbers at preview and export scale. Hardcoding
    // them would be invisible on screen and wrong in the downloaded file.
    const g = (direction: "vertical" | "horizontal" | "diagonal") =>
      shapeFillProps({ fill: "#000", fillGradient: { from: "#a", to: "#b", direction } }, 100, 50);

    expect(g("vertical").fillLinearGradientEndPoint).toEqual({ x: 0, y: 50 });
    expect(g("horizontal").fillLinearGradientEndPoint).toEqual({ x: 100, y: 0 });
    expect(g("diagonal").fillLinearGradientEndPoint).toEqual({ x: 100, y: 50 });
  });

  it("always starts the gradient at the box origin", () => {
    const props = shapeFillProps(
      { fill: "#000", fillGradient: { from: "#a", to: "#b", direction: "diagonal" } },
      80,
      40,
    );
    expect(props.fillLinearGradientStartPoint).toEqual({ x: 0, y: 0 });
  });

  it("defaultGradient seeds from the current fill and falls back for a non-hex value", () => {
    expect(defaultGradient("#ff6600").from).toBe("#ff6600");
    expect(defaultGradient("transparent").from).toBe("#3b82f6");
  });
});

describe("dashArray", () => {
  it("returns undefined for solid or unset", () => {
    expect(dashArray(undefined, 4)).toBeUndefined();
    expect(dashArray("solid", 4)).toBeUndefined();
  });

  it("scales the pattern with stroke width", () => {
    // A fixed pattern reads as dotted on a thick rule and solid on a hairline.
    const thin = dashArray("dashed", 1)!;
    const thick = dashArray("dashed", 4)!;
    expect(thick[0] / thin[0]).toBeCloseTo(4, 10);
    expect(thick[1] / thin[1]).toBeCloseTo(4, 10);
  });

  it("makes dotted tighter than dashed", () => {
    expect(dashArray("dotted", 2)![0]).toBeLessThan(dashArray("dashed", 2)![0]);
  });

  it("keeps a visible pattern for a hairline stroke", () => {
    // A 0-width stroke would otherwise produce a [0, 0] dash, which Konva draws
    // as a solid line — the dash setting would appear to do nothing.
    const dash = dashArray("dashed", 0)!;
    expect(dash.every((n) => n > 0)).toBe(true);
  });
});

describe("mirrorProps", () => {
  it("is an identity transform when neither flip is set", () => {
    expect(mirrorProps(undefined, undefined, 5, 7, 100, 50)).toEqual({
      scaleX: 1,
      scaleY: 1,
      x: 5,
      y: 7,
    });
  });

  it("reflects horizontally and shifts the origin to the far edge", () => {
    // Mirroring about the node origin without this shift would move the whole
    // bitmap out of its frame.
    expect(mirrorProps(true, false, 5, 7, 100, 50)).toEqual({
      scaleX: -1,
      scaleY: 1,
      x: 105,
      y: 7,
    });
  });

  it("reflects vertically", () => {
    expect(mirrorProps(false, true, 5, 7, 100, 50)).toEqual({
      scaleX: 1,
      scaleY: -1,
      x: 5,
      y: 57,
    });
  });

  it("reflects both axes at once", () => {
    const props = mirrorProps(true, true, 0, 0, 20, 10);
    expect([props.scaleX, props.scaleY]).toEqual([-1, -1]);
    expect([props.x, props.y]).toEqual([20, 10]);
  });

  it("keeps the mirrored image covering the same span as the original", () => {
    // Flipping must not move the visible box, only its contents.
    const w = 100;
    const plain = mirrorProps(false, false, 12, 0, w, 10);
    const flipped = mirrorProps(true, false, 12, 0, w, 10);
    const plainSpan = [plain.x, plain.x + w];
    const flippedSpan = [flipped.x + w * flipped.scaleX, flipped.x];
    expect(flippedSpan).toEqual(plainSpan);
  });
});
