/**
 * Product-photo textures for appliances.
 *
 * Häfele publish an orthographic elevation for every product — a straight-on
 * shot of the appliance filling the frame on white, not a three-quarter
 * marketing render. Their filenames say which is which: `ppic-` is the
 * elevation, `dimd-` a dimension drawing, `mont-` a mounting drawing. Only
 * `ppic-` images belong here.
 *
 * Mapping that elevation onto the face you actually look at gets the real
 * appliance — its handle, its controls, its badge — instead of a correctly
 * sized grey box. It also beats sourcing 3D models per product: a hundred
 * downloaded models of mixed provenance look worse together than one set of
 * shapes driven by correct numbers and real photography.
 *
 * Two things have to happen before the photo is usable as a texture:
 *
 *  1. **Trim the white.** The product covers only 8–18% of a typical supplier
 *     frame. Untrimmed, a black cooktop renders as a small black rectangle
 *     floating in a white border.
 *  2. **Letterbox to the face.** After trimming, the photo's aspect ratio will
 *     not match the appliance face. Stretching an oven door to fit is
 *     immediately obvious, so the product is drawn "contain"-style, centred,
 *     and the margin is filled with the photo's own dominant colour so the
 *     edges blend into the body instead of banding.
 *
 * Both need pixel access, so the image host must send CORS headers. Supabase
 * Storage does; hot-linking a supplier CDN generally does not, which is the
 * other reason to copy the images into the `appliance-assets` bucket. If the
 * canvas is tainted we fall back to the untrimmed image rather than failing.
 */
import { useEffect, useState } from 'react';
import * as THREE from 'three';

export interface ApplianceFaceTexture {
  /** Letterboxed, trimmed product elevation, ready to map onto one face. */
  texture: THREE.Texture;
  /** Dominant product colour, for tinting the other five faces. */
  dominantHex: string;
}

/** Pixels at least this bright on every channel count as background. */
const WHITE_CUTOFF = 242;
/** Give up on a trim that would keep almost nothing — the photo isn't an elevation. */
const MIN_COVERAGE = 0.005;

const cache = new Map<string, Promise<ApplianceFaceTexture | null>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

/**
 * Bounding box of everything that isn't background, plus the mean colour of
 * those pixels. Returns null when the canvas is tainted (no CORS headers).
 */
function analyse(img: HTMLImageElement): {
  box: { x: number; y: number; w: number; h: number };
  dominantHex: string;
} | null {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;

  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = h;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  if (!pctx) return null;
  pctx.drawImage(img, 0, 0);

  let data: Uint8ClampedArray;
  try {
    data = pctx.getImageData(0, 0, w, h).data;
  } catch {
    return null; // tainted canvas — caller falls back to the raw image
  }

  let minX = w, minY = h, maxX = -1, maxY = -1;
  let rs = 0, gs = 0, bs = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 16) continue;
      if (r >= WHITE_CUTOFF && g >= WHITE_CUTOFF && b >= WHITE_CUTOFF) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      rs += r; gs += g; bs += b; n++;
    }
  }
  if (maxX < 0 || n / (w * h) < MIN_COVERAGE) return null;

  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return {
    box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    dominantHex: `#${hex(rs)}${hex(gs)}${hex(bs)}`,
  };
}

async function build(url: string, faceAspect: number): Promise<ApplianceFaceTexture | null> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(url);
  } catch {
    return null;
  }

  const info = analyse(img);
  if (!info) {
    // Tainted or unrecognisable: use the whole image untrimmed. Worse, but a
    // real photo of the right product still beats a flat grey box.
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace ?? tex.colorSpace;
    tex.needsUpdate = true;
    return { texture: tex, dominantHex: '#9aa0a6' };
  }

  const { box, dominantHex } = info;
  // Canvas matches the FACE's aspect so the texture maps 1:1 with no stretch.
  const outH = 512;
  const outW = Math.max(64, Math.round(outH * faceAspect));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = dominantHex;
  ctx.fillRect(0, 0, outW, outH);

  // "contain" the trimmed product, centred.
  const scale = Math.min(outW / box.w, outH / box.h);
  const dw = box.w * scale;
  const dh = box.h * scale;
  ctx.drawImage(img, box.x, box.y, box.w, box.h, (outW - dw) / 2, (outH - dh) / 2, dw, dh);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace ?? texture.colorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { texture, dominantHex };
}

/** Cached per url+aspect. Appliance faces repeat across a design. */
export function getApplianceFaceTexture(
  url: string,
  faceAspect: number,
): Promise<ApplianceFaceTexture | null> {
  const key = `${url}|${faceAspect.toFixed(3)}`;
  let p = cache.get(key);
  if (!p) {
    p = build(url, faceAspect);
    cache.set(key, p);
  }
  return p;
}

/**
 * Product elevation for one appliance face. Returns null until it loads, and
 * stays null on any failure — every caller must render fine without it.
 */
export function useApplianceFaceTexture(
  url: string | null | undefined,
  faceAspect: number,
): ApplianceFaceTexture | null {
  const [result, setResult] = useState<ApplianceFaceTexture | null>(null);
  const key = url ? `${url}|${faceAspect.toFixed(3)}` : '';
  useEffect(() => {
    if (!url || !Number.isFinite(faceAspect) || faceAspect <= 0) {
      setResult(null);
      return;
    }
    let active = true;
    getApplianceFaceTexture(url, faceAspect)
      .then(r => { if (active) setResult(r); })
      .catch(() => { if (active) setResult(null); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return result;
}

/**
 * Only `ppic-` images are product elevations. A `dimd-` or `mont-` drawing
 * mapped onto an oven door would render a dimensioned line drawing on the
 * front of the appliance, which is worse than no image at all.
 */
export function isProductElevationUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (/\/(dimd|mont|illu)-\d+\.(jpg|jpeg|png|webp)/i.test(url)) return false;
  return true;
}
