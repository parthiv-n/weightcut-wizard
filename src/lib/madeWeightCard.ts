/**
 * Made Weight share-card generator.
 *
 * Renders a 1080×1080 polaroid-style PNG/JPEG that fighters can post to
 * IG/Stories the moment they hit target. Pure Canvas — no html-to-image,
 * no extra deps, no DOM mount required. Falls back from OffscreenCanvas
 * to a detached <canvas> when the runtime lacks OffscreenCanvas (older
 * iOS WebViews).
 *
 * Design intent (per docs/corner-social-tab-plan.md "single viral hook"):
 *   - Paper-white polaroid FRAME so it pops on IG feeds
 *   - Near-black INTERIOR with white type + orange accent on the arrow
 *   - Headline "MADE WEIGHT" + "170.4 → 155.0" + "12 days · Tiger Muay Thai"
 *   - Subtle WeightCut Wizard watermark top-right
 *   - Avatar circle + display name near bottom of photo area
 *   - Optional gym logo bottom-right of photo area
 *
 * The function is robust to missing assets: if avatar / gym logo fail to
 * load (CORS, 404, slow network) we draw a tasteful placeholder and keep
 * rendering — never throw and never block the share.
 */

export interface MadeWeightInput {
  startingWeightKg: number;
  finalWeightKg: number;
  /** YYYY-MM-DD */
  weighInDate: string;
  /** YYYY-MM-DD — used for the "X days" duration line. */
  campStartDate?: string;
  displayName: string;
  gymName?: string;
  gymLogoUrl?: string | null;
  avatarUrl?: string | null;
  weightUnit?: "kg" | "lb";
}

// 1080×1080 — IG square, also works as Story background.
const SIZE = 1080;

// Polaroid frame insets.
const FRAME_TOP = 40;
const FRAME_SIDE = 40;
const FRAME_BOTTOM = 80;

// Photo area is everything inside the frame.
const PHOTO_X = FRAME_SIDE;
const PHOTO_Y = FRAME_TOP;
const PHOTO_W = SIZE - FRAME_SIDE * 2;
const PHOTO_H = SIZE - FRAME_TOP - FRAME_BOTTOM;

// Centerlines used for the headline / weights / duration stack.
const PHOTO_CENTER_X = PHOTO_X + PHOTO_W / 2;

// shadcn primary orange in the dark theme (#f97316 sat ramp).
const ACCENT = "#FF8A3D";
const PAPER = "#FAFAF7"; // off-white so the frame doesn't blow out on screen
const INK = "#FFFFFF";
const INK_MUTED = "rgba(255,255,255,0.72)";
const PHOTO_BG_TOP = "#0A0A0A";
const PHOTO_BG_BOTTOM = "#181818";

const FONT_STACK =
  '-apple-system, "SF Pro Display", "SF Pro", "Helvetica Neue", system-ui, sans-serif';

const KG_PER_LB = 2.2046226218;

function toDisplayWeight(kg: number, unit: "kg" | "lb"): string {
  const value = unit === "lb" ? kg * KG_PER_LB : kg;
  return value.toFixed(1);
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? `${singular}s`);
}

function diffDays(a: string, b: string): number {
  // a, b are YYYY-MM-DD. Parse as UTC midnight to avoid TZ off-by-one.
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 0;
  return Math.max(0, Math.round((db - da) / 86_400_000));
}

function formatDate(iso: string): string {
  // "May 18, 2026"
  try {
    const d = new Date(`${iso}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Load an image with crossOrigin set so we can draw it without tainting
 * the canvas. Resolves to null on any failure — caller treats it as
 * "asset unavailable, draw a placeholder".
 */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    // Some CDNs return cache headers that block reuse; bust if needed.
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyCtx =
  | OffscreenCanvasRenderingContext2D
  | CanvasRenderingContext2D;

function createCanvas(size: number): { canvas: AnyCanvas; ctx: AnyCtx } {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
    if (ctx) return { canvas, ctx };
  }
  const el = document.createElement("canvas");
  el.width = size;
  el.height = size;
  const ctx = el.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  return { canvas: el, ctx };
}

async function canvasToBlob(canvas: AnyCanvas, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return await (canvas as OffscreenCanvas).convertToBlob({
      type: "image/jpeg",
      quality,
    });
  }
  return await new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Draws the paper-white polaroid frame with a soft drop shadow.
 * We use a slight rotation around the photo area later, but the frame
 * itself stays axis-aligned because IG re-crops anything that hangs
 * outside the square.
 */
function drawFrame(ctx: AnyCtx): void {
  // Background — slight warm grey so the frame doesn't look posterized
  // when uploaded to IG/Twitter compression.
  ctx.fillStyle = "#EDECE6";
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Frame (the visible polaroid paper).
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = PAPER;
  // Inset the frame by 16px so we get a margin between paper and the
  // outer JPEG boundary — gives the drop shadow room to breathe.
  ctx.fillRect(16, 16, SIZE - 32, SIZE - 32);
  ctx.restore();
}

function drawPhotoArea(ctx: AnyCtx): void {
  // Inner near-black photo area with a top→bottom gradient so the type
  // sits on a richer ground than a flat #000.
  const grad = ctx.createLinearGradient(0, PHOTO_Y, 0, PHOTO_Y + PHOTO_H);
  grad.addColorStop(0, PHOTO_BG_TOP);
  grad.addColorStop(1, PHOTO_BG_BOTTOM);
  ctx.fillStyle = grad;
  ctx.fillRect(PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H);

  // A 1px inner stroke for crispness on retina IG feeds.
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.strokeRect(PHOTO_X + 0.5, PHOTO_Y + 0.5, PHOTO_W - 1, PHOTO_H - 1);
}

function drawWatermark(ctx: AnyCtx): void {
  ctx.save();
  ctx.font = `italic 14px ${FONT_STACK}`;
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText("WeightCut Wizard", PHOTO_X + PHOTO_W - 24, PHOTO_Y + 22);
  ctx.restore();
}

function drawHeadline(ctx: AnyCtx, top: number): number {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  // Tight tracking on bold sans for an athletic-poster feel.
  ctx.font = `800 80px ${FONT_STACK}`;
  ctx.fillText("MADE WEIGHT", PHOTO_CENTER_X, top);
  ctx.restore();
  return top + 92; // approx line-box height
}

function drawWeights(
  ctx: AnyCtx,
  top: number,
  start: string,
  final: string,
  unit: string,
): number {
  ctx.save();
  ctx.textBaseline = "alphabetic";

  // Measure each piece independently so we can stack them centered and
  // colour the arrow.
  const numFont = `700 64px ${FONT_STACK}`;
  const unitFont = `600 26px ${FONT_STACK}`;
  ctx.font = numFont;
  const startW = ctx.measureText(start).width;
  const finalW = ctx.measureText(final).width;
  ctx.font = unitFont;
  const unitW = ctx.measureText(` ${unit}`).width;
  const arrowText = "→";
  ctx.font = numFont;
  const arrowW = ctx.measureText(arrowText).width;

  const gap = 28;
  const totalW = startW + gap + arrowW + gap + finalW + unitW;
  const baseY = top + 56;
  let x = PHOTO_CENTER_X - totalW / 2;

  // Starting weight (slightly muted to make the final pop).
  ctx.font = numFont;
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.fillText(start, x, baseY);
  x += startW + gap;

  // Orange arrow — the visual hero of the line.
  ctx.fillStyle = ACCENT;
  ctx.fillText(arrowText, x, baseY);
  x += arrowW + gap;

  // Final weight — full white.
  ctx.fillStyle = INK;
  ctx.fillText(final, x, baseY);
  x += finalW;

  // Unit suffix.
  ctx.font = unitFont;
  ctx.fillStyle = INK_MUTED;
  ctx.fillText(` ${unit}`, x, baseY);

  ctx.restore();
  return top + 90;
}

function drawSubline(ctx: AnyCtx, top: number, text: string): number {
  if (!text) return top;
  ctx.save();
  ctx.font = `500 28px ${FONT_STACK}`;
  ctx.fillStyle = INK_MUTED;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(text, PHOTO_CENTER_X, top);
  ctx.restore();
  return top + 40;
}

function drawDate(ctx: AnyCtx, top: number, text: string): number {
  ctx.save();
  ctx.font = `600 18px ${FONT_STACK}`;
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(text.toUpperCase(), PHOTO_CENTER_X, top);
  ctx.restore();
  return top + 28;
}

function drawAvatar(
  ctx: AnyCtx,
  centerX: number,
  centerY: number,
  radius: number,
  img: HTMLImageElement | null,
  initials: string,
): void {
  ctx.save();
  // Soft ring so the avatar reads on dark/dark.
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    // Cover-fit into the circle.
    const side = radius * 2;
    const ratio = img.width / img.height || 1;
    let dw = side;
    let dh = side;
    if (ratio > 1) dw = side * ratio;
    else dh = side / ratio;
    ctx.drawImage(img, centerX - dw / 2, centerY - dh / 2, dw, dh);
  } else {
    // Placeholder: orange→dark gradient + initials.
    const grad = ctx.createLinearGradient(
      centerX - radius,
      centerY - radius,
      centerX + radius,
      centerY + radius,
    );
    grad.addColorStop(0, "#3a1d0a");
    grad.addColorStop(1, ACCENT);
    ctx.fillStyle = grad;
    ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    ctx.fillStyle = INK;
    ctx.font = `700 ${Math.round(radius * 0.9)}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, centerX, centerY + 2);
  }
  ctx.restore();
  ctx.restore();
}

function drawDisplayName(ctx: AnyCtx, top: number, text: string): void {
  ctx.save();
  ctx.font = `600 24px ${FONT_STACK}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(text, PHOTO_CENTER_X, top);
  ctx.restore();
}

function drawGymLogo(ctx: AnyCtx, img: HTMLImageElement): void {
  // Bottom-right of photo area, with rounded clipping so any non-square
  // logo still looks tidy.
  const size = 88;
  const pad = 28;
  const x = PHOTO_X + PHOTO_W - pad - size;
  const y = PHOTO_Y + PHOTO_H - pad - size;
  const radius = 18;

  ctx.save();
  // Backing chip so a transparent PNG logo still reads on dark BG.
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRectPath(ctx, x - 6, y - 6, size + 12, size + 12, radius + 4);
  ctx.fill();

  ctx.save();
  roundRectPath(ctx, x, y, size, size, radius);
  ctx.clip();

  const ratio = img.width / img.height || 1;
  let dw = size;
  let dh = size;
  if (ratio > 1) dh = size / ratio;
  else dw = size * ratio;
  ctx.drawImage(img, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
  ctx.restore();
  ctx.restore();
}

function roundRectPath(
  ctx: AnyCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function buildSubline(
  campStartDate: string | undefined,
  weighInDate: string,
  gymName: string | undefined,
): string {
  const parts: string[] = [];
  if (campStartDate) {
    const days = diffDays(campStartDate, weighInDate);
    if (days > 0) parts.push(`${days} ${pluralize(days, "day")}`);
  }
  if (gymName && gymName.trim()) parts.push(gymName.trim());
  return parts.join(" · ");
}

/**
 * Generate the Made Weight card. Returns a JPEG blob at quality 0.92,
 * sized to stay under ~600KB at 1080² (typical output ≈ 250-450KB).
 */
export async function generateMadeWeightCard(
  input: MadeWeightInput,
): Promise<Blob> {
  const unit = input.weightUnit ?? "kg";
  const startStr = toDisplayWeight(input.startingWeightKg, unit);
  const finalStr = toDisplayWeight(input.finalWeightKg, unit);

  // Kick asset loads off in parallel so we don't serialise the network.
  const [avatarImg, gymLogoImg] = await Promise.all([
    input.avatarUrl ? loadImage(input.avatarUrl) : Promise.resolve(null),
    input.gymLogoUrl ? loadImage(input.gymLogoUrl) : Promise.resolve(null),
  ]);

  const { canvas, ctx } = createCanvas(SIZE);

  drawFrame(ctx);
  drawPhotoArea(ctx);
  drawWatermark(ctx);

  // Vertical type stack starts ~110px below the photo top so we leave
  // breathing room under the watermark.
  let y = PHOTO_Y + 110;
  y = drawHeadline(ctx, y);
  y += 18;
  y = drawWeights(ctx, y, startStr, finalStr, unit);
  y += 14;
  const sub = buildSubline(input.campStartDate, input.weighInDate, input.gymName);
  y = drawSubline(ctx, y, sub);
  y += 6;
  drawDate(ctx, y, formatDate(input.weighInDate));

  // Author block: avatar circle + display name pinned near the photo bottom.
  const avatarRadius = 48;
  const nameY = PHOTO_Y + PHOTO_H - 96;
  const avatarY = nameY - avatarRadius - 12;
  drawAvatar(
    ctx,
    PHOTO_CENTER_X,
    avatarY,
    avatarRadius,
    avatarImg,
    deriveInitials(input.displayName),
  );
  drawDisplayName(ctx, nameY + avatarRadius - 12, input.displayName);

  // Optional gym logo in the corner — drawn AFTER the avatar so it
  // overlays cleanly on the bottom-right edge.
  if (gymLogoImg) drawGymLogo(ctx, gymLogoImg);

  return await canvasToBlob(canvas, 0.92);
}
