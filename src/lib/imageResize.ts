/**
 * Resize an image dataUrl to a square N×N webp blob using cover-fit (centered crop).
 * Used for gym logos: small uploads, sharp on retina, ~10-15KB output.
 */
export async function resizeImageToSquareWebp(
  dataUrl: string,
  size = 256,
  quality = 0.85
): Promise<Blob> {
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

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob returned null"))),
      "image/webp",
      quality
    );
  });
}

/**
 * Resize a dataUrl down to maxWidth (preserving aspect) as webp.
 * Used for fight-poster-style announcement images where we want to
 * keep the full frame, not a center-cropped square.
 */
export async function resizeImageToMaxWidthWebp(
  dataUrl: string,
  maxWidth = 1080,
  quality = 0.82
): Promise<Blob> {
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
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob returned null"))),
      "image/webp",
      quality
    );
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
