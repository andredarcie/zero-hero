// Install a built sprite into a TILESET ATLAS frame, instead of as its own PNG file.
//
//   node spritefactory/install-tile.mjs <name> <tileset-path-under-public/assets> <frame> [flags]
//   node spritefactory/install-tile.mjs sea environment/tilesets/forest_tile_set.png 33
//
// Flags:
//   --src=<i>[:<n>]  install only frames i..i+n-1 of the built sheet (default: all of it).
//                    The SHEET is the unit of authorship — one spec paints a whole family — but
//                    the atlas slots it lands in are not always contiguous: a remaster keeps the
//                    ids the world already stores and appends its extra variants at the end. Two
//                    installs of two ranges is the honest way to say that.
//   --force          overwrite frames that already have art. The refusal below exists so a WRONG
//                    NUMBER cannot silently eat a tile; a deliberate remaster of a known frame is
//                    a different act, and it has to say so out loud.
//
// Why this exists as a separate step from `factory.mjs install`: terrain does not ship as one
// file per tile. The ground/upper layers index frames of ONE atlas (forest_tile_set.png, 3
// columns, row-major), and World3D merges every ground quad into a single mesh sampling that
// single texture — which is exactly why a sea of ~5000 tiles costs nothing. A new terrain tile
// is therefore not a new asset, it is a new FRAME inside an existing sheet.
//
// The frame index is row-major (frame = row * columns + col), so APPENDING rows at the bottom
// is the only safe way to grow the sheet: every existing frame id keeps its meaning. Inserting
// or reordering would silently re-point every tile already authored in world.json. This script
// refuses to overwrite a frame that already has any opaque pixel, so a typo cannot eat the art.

import fs from 'node:fs';
import path from 'node:path';
import { readPng, writePng } from './lib/png.mjs';

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, '..');
const TILE = 16;

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const [name, tilesetRel, frameArg] = argv.filter((a) => !a.startsWith('--'));
if (!name || !tilesetRel || frameArg === undefined) {
  console.error('usage: node spritefactory/install-tile.mjs <name> <tileset-rel-path> <frame> [--src=i[:n]] [--force]');
  process.exit(1);
}
const frame = Number(frameArg);
const force = flags.includes('--force');
const srcFlag = flags.find((f) => f.startsWith('--src='));
const [srcFirst, srcCount] = srcFlag
  ? srcFlag.slice('--src='.length).split(':').map(Number)
  : [0, undefined];
const unknown = flags.find((f) => f !== '--force' && !f.startsWith('--src='));
if (unknown) {
  console.error(`unknown flag ${unknown} — accepted: --src=i[:n], --force`);
  process.exit(1);
}

const srcPath = path.join(HERE, 'out', `${name}.png`);
if (!fs.existsSync(srcPath)) {
  console.error(`no build for "${name}" — run: node spritefactory/factory.mjs build ${name}`);
  process.exit(1);
}
// Refuse to install art the linter failed, exactly like factory.mjs install does.
const reportPath = path.join(HERE, 'out', `${name}-report.txt`);
if (fs.existsSync(reportPath) && /\bFAIL\b/.test(fs.readFileSync(reportPath, 'utf8'))) {
  console.error(`"${name}" has FAILs in its linter report — fix them before installing.`);
  process.exit(1);
}

// A built sheet lays its frames out in a ROW (framesToSheet), so a multi-frame sprite installs
// into that many CONSECUTIVE tileset frames — which is how the sea ships its three variants.
const src = readPng(srcPath);
if (src.height !== TILE || src.width % TILE !== 0) {
  console.error(`"${name}" is ${src.width}x${src.height}; expected a row of ${TILE}x${TILE} frames.`);
  process.exit(1);
}
const sheetFrames = src.width / TILE;
// The slice of the built sheet this call installs (see --src).
const first = Number.isFinite(srcFirst) ? srcFirst : 0;
const frameCount = srcCount ?? sheetFrames - first;
if (first < 0 || frameCount < 1 || first + frameCount > sheetFrames) {
  console.error(`--src=${first}:${frameCount} is outside "${name}"'s ${sheetFrames} built frame(s).`);
  process.exit(1);
}

const dstPath = path.join(ROOT, 'public', 'assets', tilesetRel);
const dst = readPng(dstPath);
const cols = dst.width / TILE;
if (!Number.isInteger(cols)) {
  console.error(`${tilesetRel} is ${dst.width}px wide — not a whole number of ${TILE}px columns.`);
  process.exit(1);
}

const lastRow = Math.floor((frame + frameCount - 1) / cols);
const neededHeight = (lastRow + 1) * TILE;

// Grow the sheet downward if the frame lies past the last row. New rows start fully
// transparent, so unused slots stay obviously empty rather than picking up stale pixels.
let { width, height, data } = dst;
if (neededHeight > height) {
  const grown = new Uint8Array(width * neededHeight * 4); // zero-filled == transparent
  grown.set(data);
  data = grown;
  height = neededHeight;
  console.log(`grew ${tilesetRel} to ${width}x${height} (${cols * (height / TILE)} frames)`);
}

// Never clobber existing art: a wrong frame number should fail loudly, not silently.
// Checked for EVERY target frame before writing any of them, so a partial install is
// impossible — a half-written row would be worse than a clean refusal. `--force` is the
// deliberate remaster (it still reports what it is about to paint over, so an accident that
// happens to carry the flag is visible in the log).
for (let f = 0; !force && f < frameCount; f++) {
  const row = Math.floor((frame + f) / cols);
  const col = (frame + f) % cols;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const di = (((row * TILE) + y) * width + (col * TILE) + x) * 4;
      if (data[di + 3] !== 0) {
        console.error(`frame ${frame + f} of ${tilesetRel} is not empty — refusing to overwrite it.`);
        process.exit(1);
      }
    }
  }
}

for (let f = 0; f < frameCount; f++) {
  const row = Math.floor((frame + f) / cols);
  const col = (frame + f) % cols;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const si = (y * src.width + ((first + f) * TILE) + x) * 4;
      const di = (((row * TILE) + y) * width + (col * TILE) + x) * 4;
      for (let c = 0; c < 4; c++) data[di + c] = src.data[si + c];
    }
  }
}

writePng(dstPath, { width, height, data });
const what = frameCount === sheetFrames ? '' : ` (sheet frames ${first}..${first + frameCount - 1})`;
console.log(`installed "${name}"${what} into ${tilesetRel} frames ${frame}..${frame + frameCount - 1}${force ? ' — OVERWROTE existing art (--force)' : ''}.`);
