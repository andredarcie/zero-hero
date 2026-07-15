// PNG decode/encode with zero dependencies — only node:zlib.
//
// The playtest harness already carries a minimal reader (playtest/compare-visual.mjs) but it only
// speaks RGBA/RGB, which is what Playwright writes. The game's hand-drawn sprites are whatever the
// artist's tool saved — indexed, grayscale, with or without tRNS — so this decoder covers every
// 8-bit colour type. Everything is normalised to flat RGBA (Uint8Array, 4 bytes/px).

import zlib from 'node:zlib';
import fs from 'node:fs';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** @returns {{width:number,height:number,data:Uint8Array}} data is RGBA, 4 bytes per pixel. */
export const decodePng = (buf) => {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG');
  let p = 8;
  let width = 0; let height = 0; let bitDepth = 8; let colorType = 6; let interlace = 0;
  const idat = [];
  let plte = null; let trns = null;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(p + 8);
      height = buf.readUInt32BE(p + 12);
      bitDepth = body[8]; colorType = body[9]; interlace = body[12];
    } else if (type === 'PLTE') plte = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (interlace) throw new Error('interlaced PNG not supported');
  const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByType[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);
  if (bitDepth !== 8 && !(colorType === 3 && [1, 2, 4].includes(bitDepth))) {
    throw new Error(`unsupported bit depth ${bitDepth} for colour type ${colorType}`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bitsPerPx = bitDepth * channels;
  const stride = Math.ceil((width * bitsPerPx) / 8);
  const bpp = Math.max(1, bitsPerPx >> 3); // filter distance in bytes
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c); const pb = Math.abs(a - c); const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }

  const out = new Uint8Array(width * height * 4);
  const readSample = (line, x) => { // one sample at bit depths 1/2/4/8 (indexed only for <8)
    if (bitDepth === 8) return line[x];
    const bit = x * bitDepth;
    const byte = line[bit >> 3];
    const shift = 8 - bitDepth - (bit & 7);
    return (byte >> shift) & ((1 << bitDepth) - 1);
  };
  for (let y = 0; y < height; y += 1) {
    const line = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (colorType === 6) {
        out[o] = line[x * 4]; out[o + 1] = line[x * 4 + 1];
        out[o + 2] = line[x * 4 + 2]; out[o + 3] = line[x * 4 + 3];
      } else if (colorType === 2) {
        out[o] = line[x * 3]; out[o + 1] = line[x * 3 + 1]; out[o + 2] = line[x * 3 + 2];
        out[o + 3] = 255;
        if (trns && trns.length >= 6
          && out[o] === trns.readUInt16BE(0) % 256
          && out[o + 1] === trns.readUInt16BE(2) % 256
          && out[o + 2] === trns.readUInt16BE(4) % 256) out[o + 3] = 0;
      } else if (colorType === 3) {
        const idx = readSample(line, x);
        out[o] = plte[idx * 3]; out[o + 1] = plte[idx * 3 + 1]; out[o + 2] = plte[idx * 3 + 2];
        out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (colorType === 0) {
        const g = line[x];
        out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = 255;
      } else { // 4: gray + alpha
        const g = line[x * 2];
        out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = line[x * 2 + 1];
      }
    }
  }
  return { width, height, data: out };
};

export const readPng = (file) => decodePng(fs.readFileSync(file));

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const chunk = (type, body) => {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
};

/** Encode flat RGBA into an 8-bit RGBA PNG (filter 0 everywhere — sprites are tiny). */
export const encodePng = ({ width, height, data }) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride)
      .copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

export const writePng = (file, image) => fs.writeFileSync(file, encodePng(image));
