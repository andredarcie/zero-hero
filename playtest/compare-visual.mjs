// Diff two sets of reference shots pixel by pixel. A performance change must move NO pixel.
//
//   node playtest/compare-visual.mjs playtest/results/visual-main playtest/results/visual
//
// Prints, per shot: how many pixels differ, by how much, and where the worst one is. A handful of
// pixels differing by 1/255 is the GPU rounding differently on a different code path; a block of
// them differing by 40 is a bug you were about to ship.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/** Minimal PNG reader: 8-bit RGBA/RGB, no interlace — which is what Playwright writes. */
const readPng = (file) => {
  const buf = fs.readFileSync(file);
  let p = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(p + 8);
      height = buf.readUInt32BE(p + 12);
      colorType = buf[p + 17];
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(p + 8, p + 8 + len));
    }
    p += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`${file}: unsupported PNG colour type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }
  return { width, height, channels, px };
};

const [dirA, dirB] = process.argv.slice(2);
if (!dirA || !dirB) {
  console.error('usage: node playtest/compare-visual.mjs <dirA> <dirB>');
  process.exit(2);
}

const shots = fs.readdirSync(dirA).filter((f) => f.endsWith('.png'));
let failed = false;

for (const shot of shots) {
  const fileB = path.join(dirB, shot);
  if (!fs.existsSync(fileB)) {
    console.log(`${shot.padEnd(14)} MISSING in ${dirB}`);
    failed = true;
    continue;
  }
  const a = readPng(path.join(dirA, shot));
  const b = readPng(fileB);
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`${shot.padEnd(14)} SIZE ${a.width}x${a.height} vs ${b.width}x${b.height}`);
    failed = true;
    continue;
  }

  let differing = 0;
  let worst = 0;
  let worstAt = null;
  let sum = 0;
  const total = a.width * a.height;
  for (let i = 0; i < total; i += 1) {
    const ia = i * a.channels;
    const ib = i * b.channels;
    const d = Math.max(
      Math.abs(a.px[ia] - b.px[ib]),
      Math.abs(a.px[ia + 1] - b.px[ib + 1]),
      Math.abs(a.px[ia + 2] - b.px[ib + 2]),
    );
    if (d > 0) {
      differing += 1;
      sum += d;
      if (d > worst) {
        worst = d;
        worstAt = [i % a.width, Math.floor(i / a.width)];
      }
    }
  }

  const pct = ((differing / total) * 100).toFixed(3);
  const mean = differing ? (sum / differing).toFixed(1) : '0';
  const verdict = worst === 0 ? 'IDENTICAL' : worst <= 2 ? 'identical (rounding)' : 'DIFFERENT';
  if (worst > 2) failed = true;
  console.log(
    `${shot.padEnd(14)} ${verdict.padEnd(21)} ${differing}/${total} px (${pct}%) differ · `
    + `worst ${worst}/255${worstAt ? ` at ${worstAt[0]},${worstAt[1]}` : ''} · mean ${mean}`,
  );
}

process.exit(failed ? 1 : 0);
