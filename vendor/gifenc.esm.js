/* Minimal GIF89a encoder (ES module, zero deps) — written for the Helm Studio's
   flipbook → GIF export. Scope-tuned for dark line-art frames rendered on canvas:
   a single GLOBAL palette built from every frame (exact when ≤256 colours, else
   popularity-picked from 15-bit-posterised counts with nearest-match mapping),
   full-frame images, infinite Netscape loop, per-frame delays. No transparency,
   no interlace, no local palettes. Imported dynamically by the Studio and directly
   by node tests — keep it dependency-free and DOM-free. */

/* frames: [{ data: Uint8ClampedArray|Uint8Array (RGBA), delayMs: Number }]
   Every frame must be width×height. Returns a Uint8Array of the whole GIF file. */
export function encodeGif({ width, height, frames, loop = true }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('gifenc: bad dimensions');
  }
  if (!Array.isArray(frames) || !frames.length) throw new Error('gifenc: no frames');
  const px = width * height;
  for (const f of frames) {
    if (!f || !f.data || f.data.length !== px * 4) throw new Error('gifenc: frame size mismatch');
  }

  const { palette, indexFrames } = buildPalette(frames, px);
  // colour-table size: the smallest 2^(n+1) ≥ palette length (GIF minimum 2)
  let tableBits = 1;
  while ((1 << (tableBits + 1)) < palette.length) tableBits++;
  const tableSize = 1 << (tableBits + 1);

  const out = new ByteSink();
  // Header + logical screen descriptor
  out.str('GIF89a');
  out.u16(width); out.u16(height);
  out.u8(0x80 | (7 << 4) | tableBits);   // global table, 8-bit resolution, size
  out.u8(0); out.u8(0);                  // bg index, aspect
  // Global colour table (pad to the declared size)
  for (let i = 0; i < tableSize; i++) {
    const c = palette[i] || [0, 0, 0];
    out.u8(c[0]); out.u8(c[1]); out.u8(c[2]);
  }
  // Netscape looping extension (0 = forever)
  if (loop && frames.length > 1) {
    out.u8(0x21); out.u8(0xFF); out.u8(11); out.str('NETSCAPE2.0');
    out.u8(3); out.u8(1); out.u16(0); out.u8(0);
  }
  const minCode = Math.max(2, tableBits + 1);
  frames.forEach((f, i) => {
    // graphics control: delay in centiseconds (browser floor ~20ms)
    const delay = Math.max(2, Math.round((f.delayMs || 100) / 10));
    out.u8(0x21); out.u8(0xF9); out.u8(4);
    out.u8(0x04);                        // disposal 1 (keep), no transparency
    out.u16(delay); out.u8(0); out.u8(0);
    // image descriptor (full frame, global table)
    out.u8(0x2C); out.u16(0); out.u16(0); out.u16(width); out.u16(height); out.u8(0);
    lzwEncode(indexFrames[i], minCode, out);
  });
  out.u8(0x3B);                          // trailer
  return out.bytes();
}

/* ── palette ── */
function buildPalette(frames, px) {
  // exact pass: unique 24-bit colours across all frames, bail at >256
  const exact = new Map();               // rgb24 -> index
  let overflow = false;
  for (const f of frames) {
    const d = f.data;
    for (let i = 0; i < px * 4; i += 4) {
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      if (!exact.has(key)) {
        if (exact.size >= 256) { overflow = true; break; }
        exact.set(key, exact.size);
      }
    }
    if (overflow) break;
  }
  if (!overflow) {
    const palette = [...exact.keys()].map(k => [(k >> 16) & 255, (k >> 8) & 255, k & 255]);
    const indexFrames = frames.map(f => {
      const d = f.data, idx = new Uint8Array(px);
      for (let i = 0, p = 0; i < px * 4; i += 4, p++) {
        idx[p] = exact.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      }
      return idx;
    });
    return { palette, indexFrames };
  }
  // quantised pass: posterise to 15-bit, keep the 256 most frequent, nearest-map the rest
  const counts = new Map();              // rgb15 -> count
  for (const f of frames) {
    const d = f.data;
    for (let i = 0; i < px * 4; i += 4) {
      const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256).map(e => e[0]);
  const palette = top.map(k => [((k >> 10) & 31) << 3, ((k >> 5) & 31) << 3, (k & 31) << 3]);
  const slot = new Map(top.map((k, i) => [k, i]));
  const nearest = (key) => {                          // cached nearest palette slot
    let hit = slot.get(key);
    if (hit != null) return hit;
    const r = ((key >> 10) & 31) << 3, g = ((key >> 5) & 31) << 3, b = (key & 31) << 3;
    let best = 0, bd = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const d2 = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
      if (d2 < bd) { bd = d2; best = i; }
    }
    slot.set(key, best);
    return best;
  };
  const indexFrames = frames.map(f => {
    const d = f.data, idx = new Uint8Array(px);
    for (let i = 0, p = 0; i < px * 4; i += 4, p++) {
      idx[p] = nearest(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
    }
    return idx;
  });
  return { palette, indexFrames };
}

/* ── LZW (GIF variant) ── */
function lzwEncode(indices, minCode, out) {
  out.u8(minCode);
  const CLEAR = 1 << minCode, EOI = CLEAR + 1;
  let dictSize, codeBits, dict;
  const reset = () => {
    dict = new Map();
    dictSize = EOI + 1;
    codeBits = minCode + 1;
  };
  const sub = new SubBlockWriter(out);
  reset();
  sub.write(CLEAR, codeBits);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit != null) { prefix = hit; continue; }
    sub.write(prefix, codeBits);
    if (dictSize < 4096) {
      dict.set(key, dictSize++);
      if (dictSize - 1 === (1 << codeBits) && codeBits < 12) codeBits++;
    } else {
      sub.write(CLEAR, codeBits);
      reset();
    }
    prefix = k;
  }
  sub.write(prefix, codeBits);
  sub.write(EOI, codeBits);
  sub.flush();
  out.u8(0);                             // block terminator
}

/* LSB-first bit packer emitting 255-byte GIF sub-blocks. */
class SubBlockWriter {
  constructor(sink) { this.sink = sink; this.acc = 0; this.nbits = 0; this.block = []; }
  write(code, bits) {
    this.acc |= code << this.nbits;
    this.nbits += bits;
    while (this.nbits >= 8) {
      this.push(this.acc & 255);
      this.acc >>= 8; this.nbits -= 8;
    }
  }
  push(byte) {
    this.block.push(byte);
    if (this.block.length === 255) this.emit();
  }
  emit() {
    this.sink.u8(this.block.length);
    for (const b of this.block) this.sink.u8(b);
    this.block = [];
  }
  flush() {
    if (this.nbits > 0) { this.push(this.acc & 255); this.acc = 0; this.nbits = 0; }
    if (this.block.length) this.emit();
  }
}

class ByteSink {
  constructor() { this.chunks = []; }
  u8(v) { this.chunks.push(v & 255); }
  u16(v) { this.u8(v & 255); this.u8((v >> 8) & 255); }
  str(s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); }
  bytes() { return Uint8Array.from(this.chunks); }
}
