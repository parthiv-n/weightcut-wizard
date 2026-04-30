/**
 * Resize an image dataUrl to a square N×N blob using cover-fit (centered crop).
 *
 * Used for gym logos: small uploads, sharp on retina, ~10-15KB output.
 *
 * Tries `image/webp` first (smaller files). Falls back to `image/jpeg` if the
 * browser produces a null/empty blob — older iOS WebKit (14.0–14.4) silently
 * returns null for `canvas.toBlob('image/webp', ...)`, and an empty body
 * passed to `supabase.storage.upload()` surfaces as the cryptic
 * `TypeError: Load failed` in iOS WebKit.
 */
export interface EncodedImage {
  blob: Blob;
  mime: string;
  /** File extension WITHOUT a leading dot (e.g. `webp`, `jpg`). */
  ext: string;
}

export async function resizeImageToSquareWebp(
  dataUrl: string,
  size = 256,
  quality = 0.85
): Promise<EncodedImage> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d canvas context");

  // Cover-fit: crop center to maintain aspect ratio
  const srcSize = Math.min(img.width, img.height);
  const sx = (img.width - srcSize) / 2;
  const sy = (img.height - srcSize) / 2;
  ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);

  return encodeCanvasWithFallback(canvas, quality);
}

/**
 * Resize a dataUrl down to maxWidth (preserving aspect) as webp/jpeg.
 * Used for fight-poster-style announcement images where we want to
 * keep the full frame, not a center-cropped square.
 */
export async function resizeImageToMaxWidthWebp(
  dataUrl: string,
  maxWidth = 1080,
  quality = 0.82
): Promise<EncodedImage> {
  const img = await loadImage(dataUrl);
  const ratio = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d canvas context");
  ctx.drawImage(img, 0, 0, w, h);
  return encodeCanvasWithFallback(canvas, quality);
}

/**
 * Try webp first (smaller), fall back to jpeg if the browser silently fails.
 * iOS WebKit 14.0–14.4 had broken webp encoding via `canvas.toBlob`.
 */
async function encodeCanvasWithFallback(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<EncodedImage> {
  const webp = await canvasToBlob(canvas, "image/webp", quality);
  if (webp && webp.size > 0) {
    return { blob: webp, mime: "image/webp", ext: "webp" };
  }

  const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.88);
  if (jpeg && jpeg.size > 0) {
    return { blob: jpeg, mime: "image/jpeg", ext: "jpg" };
  }

  throw new Error("Image encoding failed (canvas.toBlob produced no data)");
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mime, quality);
    } catch {
      // Some old WebKit builds throw synchronously for unsupported mimes
      resolve(null);
    }
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}
