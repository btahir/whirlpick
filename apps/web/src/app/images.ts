// Local images for slices and the hub (PLAN §4.1): downscaled to ≤ 256 px, WebP (PNG fallback)
// data URLs ≤ 200 KB, id = "img_" + the first 16 hex of SHA-256(dataUrl). They live in IndexedDB
// and are never put into share links.
import type { ImageAsset } from "@whirlpick/core";

export const MAX_PX = 256;
export const MAX_BYTES = 200 * 1024;

async function sha16(s: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const d = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(s)));
    return Array.from(d.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Non-secure contexts have no SubtleCrypto: fall back to two FNV-1a passes (ids only).
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193);
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x811c9dc5);
  }
  return ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")).slice(0, 16);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That image couldn't be read."));
    img.src = src;
  });
}

/** Read an image file, downscale it to fit 256 × 256 and encode it within 200 KB. */
export async function imageFromFile(file: File): Promise<{ id: string; asset: ImageAsset }> {
  if (!/^image\//.test(file.type)) throw new Error("Choose an image file (PNG, JPEG, WebP or GIF).");
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("This browser can't process images.");
    ctx.drawImage(img, 0, 0, w, h);
    let dataUrl = "";
    for (const q of [0.86, 0.72, 0.55, 0.4]) {
      dataUrl = c.toDataURL("image/webp", q);
      if (!dataUrl.startsWith("data:image/webp")) dataUrl = c.toDataURL("image/jpeg", q);
      if (dataUrl.length <= MAX_BYTES) break;
    }
    if (dataUrl.length > MAX_BYTES) throw new Error("That image is too detailed to keep. Try a simpler one.");
    return { id: `img_${await sha16(dataUrl)}`, asset: { dataUrl, width: w, height: h } };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Decoded images for the renderer, keyed by image id. */
export class ImageCache {
  readonly map = new Map<string, CanvasImageSource>();
  private pending = new Set<string>();
  constructor(private readonly onLoad: () => void) {}

  sync(images: Record<string, ImageAsset>): void {
    for (const [id, a] of Object.entries(images)) {
      if (this.map.has(id) || this.pending.has(id)) continue;
      this.pending.add(id);
      loadImage(a.dataUrl)
        .then((img) => {
          this.map.set(id, img);
          this.onLoad();
        })
        .catch(() => {})
        .finally(() => this.pending.delete(id));
    }
  }
}
