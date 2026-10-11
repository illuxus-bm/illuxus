import QRCode from "qrcode";

/**
 * Canvas-drawn artwork for the 3D stage: ticket faces, the hall screen, the
 * bar labels and the ticket's contact shadow. Everything is drawn at runtime
 * so it follows the theme palette and needs no image assets.
 */

const POSTER = '"Bebas Neue", "Oswald", "Arial Narrow", Impact, sans-serif';
const SANS = 'Onest, Poppins, system-ui, sans-serif';

export const TICKET_ASPECT = 2.25;
/** Tear line position as a fraction of the ticket width. */
export const TICKET_TEAR = 2.6 / 3.6;

/** Resolves once the two webfonts used on the canvases are available. */
export function fontsReady(): Promise<unknown> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  return Promise.all([
    document.fonts.load('400 120px "Bebas Neue"'),
    document.fonts.load("700 32px Onest"),
    document.fonts.load("600 24px Onest"),
  ]).catch(() => undefined);
}

function spaced(ctx: CanvasRenderingContext2D, px: number) {
  // Letter-spacing on canvas text is not supported everywhere; skip quietly.
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let qrCache: { size: number; data: Uint8Array } | null = null;
function qrMatrix() {
  if (!qrCache) {
    const qr = QRCode.create("https://illuxus.com", { errorCorrectionLevel: "M" });
    qrCache = { size: qr.modules.size, data: qr.modules.data };
  }
  return qrCache;
}

export interface TicketArt {
  tier: string;
  serial: string;
  seat: string;
  paper: string;
  ink: string;
  foil: string;
  foilInk: string;
}

export function drawTicketFront(canvas: HTMLCanvasElement, art: TicketArt) {
  const W = 1800;
  const H = 800;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const tearX = W * TICKET_TEAR;

  ctx.fillStyle = art.paper;
  ctx.fillRect(0, 0, W, H);

  // Foil edge
  ctx.fillStyle = art.foil;
  ctx.fillRect(0, 0, 44, H);

  ctx.fillStyle = art.ink;
  ctx.textBaseline = "alphabetic";

  // Masthead
  ctx.font = `700 30px ${SANS}`;
  spaced(ctx, 7);
  ctx.globalAlpha = 0.72;
  ctx.fillText("ILLUXUS  ·  ADMIT ONE", 112, 122);
  ctx.globalAlpha = 1;

  // Tier chip
  ctx.font = `700 28px ${SANS}`;
  spaced(ctx, 5);
  const tier = art.tier.toUpperCase();
  const chipW = ctx.measureText(tier).width + 56;
  roundedRect(ctx, tearX - 56 - chipW, 78, chipW, 60, 30);
  ctx.fillStyle = art.foil;
  ctx.fill();
  ctx.fillStyle = art.foilInk;
  ctx.fillText(tier, tearX - 56 - chipW + 28, 119);

  // Event name
  ctx.fillStyle = art.ink;
  spaced(ctx, 2);
  ctx.font = `400 196px ${POSTER}`;
  ctx.fillText("FOUNDER", 106, 330);
  ctx.fillText("SUMMIT 2026", 106, 500);

  // Rule
  ctx.globalAlpha = 0.28;
  ctx.fillRect(112, 560, tearX - 112 - 56, 2);
  ctx.globalAlpha = 1;

  // Fields
  const fields: [string, string, number][] = [
    ["DATE", "12 DEC 2026", 112],
    ["DOORS", "18:30", 480],
    ["GATE", "02", 720],
    ["SEAT", art.seat, 900],
  ];
  for (const [label, value, x] of fields) {
    ctx.font = `600 22px ${SANS}`;
    spaced(ctx, 5);
    ctx.globalAlpha = 0.6;
    ctx.fillText(label, x, 628);
    ctx.globalAlpha = 1;
    ctx.font = `700 42px ${SANS}`;
    spaced(ctx, 1);
    ctx.fillText(value, x, 688);
  }

  // Perforation
  ctx.save();
  ctx.strokeStyle = art.ink;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 14]);
  ctx.beginPath();
  ctx.moveTo(tearX, 46);
  ctx.lineTo(tearX, H - 46);
  ctx.stroke();
  ctx.restore();

  // Stub: QR, serial, barcode
  const stubCx = (tearX + W) / 2;
  const qr = qrMatrix();
  const qrSize = 300;
  const cell = qrSize / qr.size;
  const qrX = stubCx - qrSize / 2;
  const qrY = 180;
  ctx.fillStyle = art.ink;
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (qr.data[row * qr.size + col]) {
        ctx.fillRect(qrX + col * cell, qrY + row * cell, cell + 0.6, cell + 0.6);
      }
    }
  }
  ctx.textAlign = "center";
  ctx.font = `700 28px ${SANS}`;
  spaced(ctx, 6);
  ctx.fillText(`NO. ${art.serial}`, stubCx, 556);
  ctx.textAlign = "left";
  let x = stubCx - 150;
  let i = 0;
  while (x < stubCx + 150) {
    const w = [4, 2, 6, 3, 2, 5, 3][i % 7];
    if (i % 2 === 0) ctx.fillRect(x, 610, w, 100);
    x += w + 2;
    i++;
  }
  spaced(ctx, 0);
}

export function drawTicketBack(canvas: HTMLCanvasElement, art: TicketArt) {
  const W = 1800;
  const H = 800;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = art.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = art.foil;
  ctx.fillRect(W - 44, 0, 44, H);
  ctx.fillStyle = art.ink;
  ctx.textAlign = "center";
  ctx.font = `400 170px ${POSTER}`;
  spaced(ctx, 3);
  ctx.fillText("EVENTS YOU'LL REMEMBER", W / 2 - 22, 430);
  ctx.font = `700 30px ${SANS}`;
  spaced(ctx, 8);
  ctx.globalAlpha = 0.7;
  ctx.fillText("ILLUXUS.COM", W / 2 - 22, 520);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  spaced(ctx, 0);
}

export function drawScreen(canvas: HTMLCanvasElement, bg: string, text: string, accent: string) {
  const W = 1024;
  const H = 384;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(62, 62, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `700 24px ${SANS}`;
  spaced(ctx, 6);
  ctx.fillText("LIVE", 84, 71);
  ctx.fillStyle = text;
  ctx.textAlign = "center";
  ctx.font = `400 128px ${POSTER}`;
  spaced(ctx, 2);
  ctx.fillText("FOUNDER SUMMIT 2026", W / 2, 244, W - 120);
  ctx.fillStyle = accent;
  ctx.fillRect(W / 2 - 90, 290, 180, 5);
  ctx.textAlign = "left";
  spaced(ctx, 0);
}

export function drawBarLabel(canvas: HTMLCanvasElement, name: string, count: number, color: string) {
  const W = 512;
  const H = 256;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.font = `400 150px ${POSTER}`;
  ctx.fillText(String(count), W / 2, 140);
  ctx.font = `700 34px ${SANS}`;
  spaced(ctx, 6);
  ctx.globalAlpha = 0.75;
  ctx.fillText(name.toUpperCase(), W / 2, 206);
  ctx.globalAlpha = 1;
  spaced(ctx, 0);
}

export function drawShadow(canvas: HTMLCanvasElement) {
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(0,0,0,0.55)");
  gradient.addColorStop(0.6, "rgba(0,0,0,0.16)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
}
