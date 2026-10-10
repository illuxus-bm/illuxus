/**
 * Text measurement for the template seed — pure, no DOM.
 *
 * `seedBrochureDocument` has to decide how tall a card is, where a title
 * wraps and how large a headline can be BEFORE anything is rendered, and it
 * runs in places with no usable canvas (vitest, and the first paint before a
 * web font has loaded — measuring then returns the fallback font's widths and
 * a different answer on the second open). The seed used to guess with
 * "about 30 characters per line", which is why body copy overflowed its
 * card, agenda descriptions were cut off and the cover title was a fraction
 * of the size it had room for.
 *
 * The widths below are Poppins' real advance widths (per-mille of the font
 * size, ASCII 32–126, measured in Chromium), for the regular and bold
 * weights. Poppins is the Poster Bold default and one of the widest families
 * the editor offers, so for any other family these numbers err on the side
 * of reserving slightly too much room rather than too little — the safe
 * direction, since Konva drops lines that don't fit a text box's height.
 */
import { ptToMm } from "./editor-units";

const FIRST_CODE = 32;

// prettier-ignore
const REGULAR_WIDTHS = [267,298,292,840,622,759,739,159,454,454,486,683,198,551,210,476,628,320,575,589,629,628,635,546,631,630,213,264,555,723,539,524,1013,674,613,772,707,513,504,778,692,246,530,599,432,861,703,786,579,788,608,587,541,675,676,976,621,584,541,423,658,423,629,733,257,676,676,607,676,620,329,676,640,246,248,515,246,1030,640,640,676,676,373,522,364,640,561,820,479,563,455,462,291,462,519];
// prettier-ignore
const BOLD_WIDTHS = [212,392,411,904,658,870,798,221,477,477,534,628,287,580,282,453,652,376,571,605,677,650,637,535,648,615,284,347,551,696,541,538,1080,737,659,762,727,541,547,762,731,295,578,697,477,918,752,786,624,788,652,615,591,705,730,1052,715,671,596,510,802,510,709,780,291,679,679,605,679,616,360,679,674,295,294,618,295,1059,674,637,679,679,428,558,406,674,626,866,588,632,496,499,291,499,636];

/** Common non-ASCII glyphs brochure copy actually uses: [regular, bold]. */
const EXTRA_WIDTHS: Record<string, [number, number]> = {
  "₹": [520, 553],
  "–": [677, 695],
  "—": [885, 930],
  "’": [219, 314],
  "‘": [219, 314],
  "“": [380, 541],
  "”": [380, 541],
  "•": [412, 501],
  "…": [581, 760],
};

/** Used for anything not in the tables (accented letters, other scripts). */
const FALLBACK_WIDTH = 640;

function charWidth(ch: string, bold: boolean): number {
  const code = ch.charCodeAt(0);
  const index = code - FIRST_CODE;
  if (index >= 0 && index < REGULAR_WIDTHS.length) {
    return bold ? BOLD_WIDTHS[index] : REGULAR_WIDTHS[index];
  }
  const extra = EXTRA_WIDTHS[ch];
  if (extra) return extra[bold ? 1 : 0];
  return FALLBACK_WIDTH;
}

/** Width of a single line of text, in mm. Pure. */
export function estimateTextWidthMm(text: string, fontSizePt: number, bold = false): number {
  let units = 0;
  for (const ch of text) units += charWidth(ch, bold);
  return (units / 1000) * ptToMm(fontSizePt);
}

/**
 * Word-wraps `text` to `maxWidthMm`, honouring explicit `\n` breaks. Pure.
 *
 * Follows Konva's own `wrap: "word"` rule (`Text._setTextData`) rather than a
 * plain split on spaces, because both renderers draw text with Konva and the
 * seed's line count has to agree with theirs: take the longest run of
 * characters that fits, then back up to the last space OR hyphen in it — so
 * "cloud-native" may break after the hyphen — and only split inside a word
 * when the word alone is wider than the box.
 */
export function wrapTextLines(
  text: string,
  maxWidthMm: number,
  fontSizePt: number,
  bold = false,
): string[] {
  const widthOf = (s: string): number => estimateTextWidthMm(s, fontSizePt, bold);
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = paragraph;
    if (widthOf(line) <= maxWidthMm) {
      lines.push(line);
      continue;
    }
    while (line.length > 0) {
      const chars = Array.from(line);
      // Longest prefix that fits.
      let fit = 0;
      let width = 0;
      while (fit < chars.length) {
        const next = width + estimateTextWidthMm(chars[fit], fontSizePt, bold);
        if (next > maxWidthMm) break;
        width = next;
        fit += 1;
      }
      if (fit === 0) fit = 1; // a single glyph wider than the box still advances
      let cut = fit;
      const nextChar = chars[fit];
      if (fit < chars.length && nextChar !== " " && nextChar !== "-") {
        const prefix = chars.slice(0, fit);
        const wrapIndex = Math.max(prefix.lastIndexOf(" "), prefix.lastIndexOf("-")) + 1;
        if (wrapIndex > 0) cut = wrapIndex;
      }
      lines.push(chars.slice(0, cut).join("").trimEnd());
      line = chars.slice(cut).join("").trimStart();
      if (line.length > 0 && widthOf(line) <= maxWidthMm) {
        lines.push(line);
        break;
      }
    }
  }
  return lines;
}

/** Height of `lineCount` lines, in mm — Konva's `lineHeight × fontSize`. */
export function textBlockHeightMm(lineCount: number, fontSizePt: number, lineHeight: number): number {
  return lineCount * ptToMm(fontSizePt) * lineHeight;
}

/** Wrapped height of `text` in a box `maxWidthMm` wide. Pure. */
export function estimateTextHeightMm(
  text: string,
  maxWidthMm: number,
  fontSizePt: number,
  lineHeight: number,
  bold = false,
): number {
  return textBlockHeightMm(wrapTextLines(text, maxWidthMm, fontSizePt, bold).length, fontSizePt, lineHeight);
}

/**
 * Largest font size (pt) in `[minPt, maxPt]` at which every one of `lines`
 * fits `maxWidthMm`. Width is linear in font size, so this is a division
 * rather than a search. Pure.
 */
export function fitFontSizePt(
  lines: string[],
  maxWidthMm: number,
  maxPt: number,
  minPt: number,
  bold = false,
): number {
  const widest = Math.max(0, ...lines.map((l) => estimateTextWidthMm(l, 1, bold)));
  if (widest === 0) return maxPt;
  return Math.max(minPt, Math.min(maxPt, maxWidthMm / widest));
}

/**
 * Splits `text` into exactly `lineCount` lines at word boundaries, choosing
 * the split whose widest line is narrowest — so a headline reads as a
 * balanced block instead of one long line and an orphan. Returns fewer lines
 * when there aren't enough words. Pure.
 */
export function balanceLines(text: string, lineCount: number, bold = true): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];
  const count = Math.max(1, Math.min(lineCount, words.length));
  if (count === 1) return [words.join(" ")];

  let best: string[] = [];
  let bestWidth = Infinity;
  const visit = (start: number, remaining: number, acc: string[]): void => {
    if (remaining === 1) {
      const lines = [...acc, words.slice(start).join(" ")];
      const widest = Math.max(...lines.map((l) => estimateTextWidthMm(l, 1, bold)));
      if (widest < bestWidth) {
        bestWidth = widest;
        best = lines;
      }
      return;
    }
    for (let end = start + 1; end <= words.length - (remaining - 1); end += 1) {
      visit(end, remaining - 1, [...acc, words.slice(start, end).join(" ")]);
    }
  };
  visit(0, count, []);
  return best;
}
