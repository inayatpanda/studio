// Downscale an image File to <= maxEdge px, re-encode JPEG, return base64 (no data: prefix).
// Tries createImageBitmap first (fast), then falls back to an <img> decode for engines/formats
// it can't handle. Throws a clear, user-facing message when the browser can't decode the file
// at all (most often a HEIC/HEIF photo straight from an iPhone or Mac Photos library).
function decodeViaImgElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode-failed')); };
    img.src = url;
  });
}

// Decode any image File to a drawable source (ImageBitmap or HTMLImageElement) with a clear
// HEIC-aware error. Shared by resizeToBase64 + the crop editor.
export async function decodeImage(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    try {
      return await decodeViaImgElement(file);
    } catch {
      throw new Error("Couldn’t read that image. If it’s a HEIC photo (the default on iPhone/Mac), export or convert it to JPEG or PNG first, then add it.");
    }
  }
}

// Default longest-edge cap for committed photos. The content guide caps photos at
// ≤ 2560 px on the longest side — keeps commits small without visible quality loss.
export const MAX_EDGE = 2560;

const srcW = (s) => s.width || s.naturalWidth;
const srcH = (s) => s.height || s.naturalHeight;

// Core encoder: draw a (decoded) source into a canvas, optionally cropping to `crop`
// {x,y,w,h} in source pixels, downscaling so the longest edge ≤ maxEdge, and re-encode.
// `format` ∈ 'jpeg' | 'png' | 'webp'. Returns { base64, bytes, width, height, mime }.
async function encode(src, { maxEdge = MAX_EDGE, quality = 0.82, format = 'jpeg', crop = null } = {}) {
  const sw = srcW(src), sh = srcH(src);
  if (!sw || !sh) throw new Error('That image came through empty — try a JPEG or PNG.');
  // Crop region (default = whole image), clamped to the source bounds.
  let cx = crop ? Math.max(0, Math.round(crop.x)) : 0;
  let cy = crop ? Math.max(0, Math.round(crop.y)) : 0;
  let cw = crop ? Math.round(crop.w) : sw;
  let ch = crop ? Math.round(crop.h) : sh;
  cw = Math.min(cw, sw - cx); ch = Math.min(ch, sh - cy);
  if (cw < 1 || ch < 1) { cx = 0; cy = 0; cw = sw; ch = sh; }
  const scale = Math.min(1, maxEdge / Math.max(cw, ch));
  const width = Math.max(1, Math.round(cw * scale));
  const height = Math.max(1, Math.round(ch * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  // PNG keeps transparency; JPEG/WebP get a neutral fill so transparent pixels aren't black.
  if (format === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
  ctx.drawImage(src, cx, cy, cw, ch, 0, 0, width, height);
  const mime = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise((res) => canvas.toBlob(res, mime, quality));
  if (!blob) throw new Error('Couldn’t process that image — try a JPEG or PNG.');
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { base64: btoa(binary), bytes: bytes.length, width, height, mime };
}

export async function resizeToBase64(file, maxEdge = MAX_EDGE, quality = 0.82) {
  const src = await decodeImage(file);
  const out = await encode(src, { maxEdge, quality, format: 'jpeg' });
  src.close?.();
  return { filename: file.name.replace(/\.[^.]+$/, '') + '.jpg', base64: out.base64, bytes: out.bytes, width: out.width, height: out.height };
}

// Encode an already-decoded source with crop/format/quality options — used by the
// crop & resize editor, which holds the decoded image while the user drags.
export async function encodeSource(src, opts = {}) {
  return encode(src, opts);
}
