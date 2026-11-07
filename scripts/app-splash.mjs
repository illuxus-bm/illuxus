#!/usr/bin/env node
/**
 * Renders the iOS and Android launch-screen logo from the website's wordmark
 * (public/illuxus-wordmark-{light,dark}.svg), so the native splash shows the
 * same mark, at the same size and in the same place, as the web splash in
 * index.html that follows it: one screen, no jump.
 *
 *   node scripts/app-splash.mjs        (needs `rsvg-convert`: brew install librsvg)
 *
 * Writes:
 *   android/app/src/main/res/drawable{,-night}-<density>/splash_logo.png
 *     288 dp square (the Android 12+ splash icon canvas) with the 166 × 48 dp
 *     wordmark in the middle; inside the 192 dp circle Android masks it to.
 *   ios/App/App/Assets.xcassets/SplashLogo.imageset/
 *     166 × 48 pt, @1x/@2x/@3x, light and dark appearances.
 *
 * The background colours live beside them (values{,-night}/colors.xml and
 * SplashBackground.colorset) and match index.html's splash.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOGO_W = 166; // index.html .splash-logo img: 48px tall, 2400:693
const LOGO_H = 48;
const ANDROID_CANVAS = 288;
const ANDROID_DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
// On a light background the navy mark; on a dark one the light mark.
const MARKS = { light: "public/illuxus-wordmark-light.svg", dark: "public/illuxus-wordmark-dark.svg" };

function inner(svgPath) {
  const svg = readFileSync(join(ROOT, svgPath), "utf8");
  const w = Number(svg.match(/width="(\d+)"/)[1]);
  const h = Number(svg.match(/height="(\d+)"/)[1]);
  return { body: svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, ""), w, h };
}

/** The wordmark at LOGO_W × LOGO_H, centred on a canvas of the given size. */
function canvasSvg(mark, canvasW, canvasH) {
  const { body, w, h } = inner(mark);
  const x = (canvasW - LOGO_W) / 2;
  const y = (canvasH - LOGO_H) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">` +
    `<svg x="${x}" y="${y}" width="${LOGO_W}" height="${LOGO_H}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${body}</svg></svg>`;
}

function render(svg, scale, out) {
  const dir = mkdtempSync(join(tmpdir(), "splash-"));
  try {
    const src = join(dir, "in.svg");
    writeFileSync(src, svg);
    mkdirSync(dirname(out), { recursive: true });
    execFileSync("rsvg-convert", ["--zoom", String(scale), "--keep-aspect-ratio", "-o", out, src]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Android: light mark by day, light-on-dark mark at night.
for (const [density, scale] of Object.entries(ANDROID_DENSITIES)) {
  const svgDay = canvasSvg(MARKS.light, ANDROID_CANVAS, ANDROID_CANVAS);
  const svgNight = canvasSvg(MARKS.dark, ANDROID_CANVAS, ANDROID_CANVAS);
  render(svgDay, scale, join(ROOT, `android/app/src/main/res/drawable-${density}/splash_logo.png`));
  render(svgNight, scale, join(ROOT, `android/app/src/main/res/drawable-night-${density}/splash_logo.png`));
}

// iOS: one image set with light and dark appearances.
const set = join(ROOT, "ios/App/App/Assets.xcassets/SplashLogo.imageset");
const images = [];
for (const [appearance, mark] of Object.entries(MARKS)) {
  for (const scale of [1, 2, 3]) {
    const filename = `splash-logo-${appearance}@${scale}x.png`;
    render(canvasSvg(mark, LOGO_W, LOGO_H), scale, join(set, filename));
    images.push({
      filename,
      idiom: "universal",
      scale: `${scale}x`,
      ...(appearance === "dark" ? { appearances: [{ appearance: "luminosity", value: "dark" }] } : {}),
    });
  }
}
writeFileSync(join(set, "Contents.json"), `${JSON.stringify({ images, info: { author: "xcode", version: 1 } }, null, 2)}\n`);

console.log("Wrote the Android and iOS splash logos.");
