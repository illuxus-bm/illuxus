// supabase/functions/og-event/image-guard.ts: which images the public share-card
// function will fetch and decode (QA audit F-12).
import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_SIDE, decodable, imageSize, isOwnStorageUrl, readCapped,
} from "../../../supabase/functions/og-event/image-guard";

const BASE = "https://abcd1234.supabase.co";

describe("isOwnStorageUrl", () => {
  it("allows public objects in the project's Storage", () => {
    expect(isOwnStorageUrl(`${BASE}/storage/v1/object/public/site-assets/events/a.jpg`, BASE)).toBe(true);
    expect(isOwnStorageUrl(`${BASE}/storage/v1/render/image/public/site-assets/a.jpg?width=1200`, BASE)).toBe(true);
  });

  it.each([
    ["another host", "https://example.com/banner.jpg"],
    ["another project", "https://other.supabase.co/storage/v1/object/public/a.jpg"],
    ["a look-alike host", "https://abcd1234.supabase.co.evil.com/storage/v1/object/public/a.jpg"],
    ["a private object", `${BASE}/storage/v1/object/sign/site-assets/a.jpg?token=x`],
    ["the database API", `${BASE}/rest/v1/registrations`],
    ["climbing out of public/", `${BASE}/storage/v1/object/public/../../../rest/v1/registrations`],
    ["plain http", "http://abcd1234.supabase.co/storage/v1/object/public/a.jpg"],
    ["credentials in the URL", "https://user:pw@abcd1234.supabase.co/storage/v1/object/public/a.jpg"],
    ["a metadata address", "http://169.254.169.254/latest/meta-data/"],
    ["not a URL", "not a url"],
  ])("refuses %s", (_label, url) => {
    expect(isOwnStorageUrl(url, BASE)).toBe(false);
  });

  it("refuses everything when the project URL is unknown", () => {
    expect(isOwnStorageUrl(`${BASE}/storage/v1/object/public/a.jpg`, undefined)).toBe(false);
  });
});

/** Minimal headers carrying only the size, as each format stores it. */
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}
function gif(width: number, height: number): Uint8Array {
  const b = new Uint8Array(13);
  b.set([...new TextEncoder().encode("GIF89a")]);
  new DataView(b.buffer).setUint16(6, width, true);
  new DataView(b.buffer).setUint16(8, height, true);
  return b;
}
function jpeg(width: number, height: number): Uint8Array {
  // SOI, an APP0 segment to skip, then SOF0 with the size.
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, ...new Array(9).fill(0)];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0]);
}
function webpVp8x(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([...new TextEncoder().encode("RIFF")], 0);
  b.set([...new TextEncoder().encode("WEBPVP8X")], 8);
  const w = width - 1;
  const h = height - 1;
  b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24);
  return b;
}

describe("imageSize", () => {
  it("reads PNG, JPEG, GIF and WebP headers", () => {
    expect(imageSize(png(1200, 630))).toEqual({ width: 1200, height: 630 });
    expect(imageSize(jpeg(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    expect(imageSize(gif(320, 200))).toEqual({ width: 320, height: 200 });
    expect(imageSize(webpVp8x(4000, 3000))).toEqual({ width: 4000, height: 3000 });
  });

  it("returns null for other or broken data", () => {
    expect(imageSize(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))).toBeNull();
    expect(imageSize(new Uint8Array(0))).toBeNull();
  });
});

describe("decodable", () => {
  it("allows ordinary banners", () => {
    expect(decodable({ width: 1600, height: 900 })).toBe(true);
  });
  it("refuses decompression bombs and unknown sizes", () => {
    expect(decodable({ width: MAX_IMAGE_SIDE + 1, height: 10 })).toBe(false);
    // Each side within the limit, but 25 MP over the pixel cap.
    expect(decodable({ width: 5000, height: 5000 })).toBe(false);
    expect(decodable(imageSize(png(65535, 65535)))).toBe(false);
    expect(decodable({ width: 0, height: 100 })).toBe(false);
    expect(decodable(null)).toBe(false);
  });
});

describe("readCapped", () => {
  const body = (bytes: number, declare = true) =>
    new Response(new Uint8Array(bytes), { headers: declare ? { "content-length": String(bytes) } : {} });

  it("reads a body within the cap", async () => {
    expect((await readCapped(body(1000), 4096))?.byteLength).toBe(1000);
  });
  it("refuses a body declared over the cap without reading it", async () => {
    expect(await readCapped(body(5000), 4096)).toBeNull();
  });
  it("stops reading a body that runs over the cap without declaring its length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(1024)); }, // never ends
    });
    expect(await readCapped(new Response(stream), 4096)).toBeNull();
  });
});
