// The sprite factory CLI — build, inspect and audit sprites in the game's exact standard.
//
//   node spritefactory/factory.mjs build <name|path>    build one spec from sprites/
//   node spritefactory/factory.mjs build --all           build every spec
//   node spritefactory/factory.mjs check <png> [kind]    run the linter on an existing PNG
//   node spritefactory/factory.mjs dump <png>            print a PNG as a text grid (study tool)
//   node spritefactory/factory.mjs palette               print the curated ramps
//   node spritefactory/factory.mjs install <name> <dest> copy a built sprite into public/assets/
//
// build writes three artifacts per sprite into out/:
//   <name>.png          the sheet, ready to install
//   <name>-preview.png  the review sheet (zoom + day/night context) — LOOK at this one
//   <name>-report.txt   the linter verdict
// and exits non-zero if any rule FAILed, so the loop can't declare victory early.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readPng, writePng } from './lib/png.mjs';
import { Pix, seededRng, speckle, gridToImage, framesToSheet } from './lib/pixel.mjs';
import { analyzeSprite, formatReport } from './lib/analyze.mjs';
import { makePreview } from './lib/preview.mjs';
import { RAMPS, GAME_PALETTE, hexToRgb, rgbToHex, nearestGameColor } from './lib/palette.mjs';

const HERE = import.meta.dirname;
const OUT = path.join(HERE, 'out');
const SPRITES = path.join(HERE, 'sprites');
const ROOT = path.resolve(HERE, '..');

const buildSpec = async (specPath) => {
  const mod = await import(pathToFileURL(specPath).href);
  const spec = mod.default;
  if (!spec?.name) throw new Error(`${specPath}: default export needs at least { name }`);
  const frameW = spec.frameW ?? 16;
  const frameH = spec.frameH ?? 16;

  let images;
  if (spec.draw) {
    const drawn = spec.draw({ Pix, seededRng, speckle, RAMPS, hexToRgb });
    images = (Array.isArray(drawn) ? drawn : [drawn]).map((f) => (f instanceof Pix ? f.toImage() : f));
  } else if (spec.frames) {
    images = spec.frames.map((grid) => gridToImage(grid, spec.palette ?? {}));
  } else {
    throw new Error(`${spec.name}: spec needs frames (text grids) or draw()`);
  }
  for (const img of images) {
    if (img.width !== frameW || img.height !== frameH) {
      throw new Error(`${spec.name}: a frame is ${img.width}x${img.height}, expected ${frameW}x${frameH}`);
    }
  }
  const sheet = images.length === 1 ? images[0] : framesToSheet(images, spec.layout ?? 'row');

  fs.mkdirSync(OUT, { recursive: true });
  const analysis = analyzeSprite(sheet, { ...spec, frameW, frameH });
  const report = formatReport(analysis, spec.name);
  writePng(path.join(OUT, `${spec.name}.png`), sheet);
  writePng(path.join(OUT, `${spec.name}-preview.png`), makePreview(sheet, { frameW, frameH }));
  fs.writeFileSync(path.join(OUT, `${spec.name}-report.txt`), report);
  console.log(report);
  console.log(`  → out/${spec.name}.png, out/${spec.name}-preview.png`);
  return analysis.findings.some((f) => f.level === 'fail');
};

const resolveSpec = (arg) => {
  if (fs.existsSync(arg)) return path.resolve(arg);
  const p = path.join(SPRITES, arg.endsWith('.mjs') ? arg : `${arg}.mjs`);
  if (fs.existsSync(p)) return p;
  throw new Error(`no spec named '${arg}' (looked in spritefactory/sprites/)`);
};

const cmdBuild = async (args) => {
  const targets = args[0] === '--all'
    ? fs.readdirSync(SPRITES).filter((f) => f.endsWith('.mjs')).map((f) => path.join(SPRITES, f))
    : args.map(resolveSpec);
  if (!targets.length) { console.log('nothing to build'); return; }
  let failed = false;
  for (const t of targets) failed = (await buildSpec(t)) || failed;
  if (failed) process.exit(1);
};

const cmdCheck = (args) => {
  const [file, kind = 'prop'] = args;
  const img = readPng(file);
  // Frame size: assume 16 unless the image is smaller (icons like hearts are 7x7).
  const frameW = img.width % 16 === 0 ? 16 : img.width;
  const frameH = img.height % 16 === 0 ? 16 : img.height;
  const analysis = analyzeSprite(img, { kind, frameW, frameH });
  console.log(formatReport(analysis, path.basename(file)));
  if (analysis.findings.some((f) => f.level === 'fail')) process.exit(1);
};

const cmdDump = (args) => {
  for (const file of args) {
    const abs = fs.existsSync(file) ? file : path.join(ROOT, 'public', 'assets', file);
    const { width, height, data } = readPng(abs);
    const legend = new Map();
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    console.log(`\n=== ${file} (${width}x${height}) ===`);
    for (let y = 0; y < height; y += 1) {
      let row = '';
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 128) { row += '.'; continue; }
        const k = rgbToHex([data[i], data[i + 1], data[i + 2]]);
        if (!legend.has(k)) legend.set(k, letters[legend.size] ?? '?');
        row += legend.get(k);
      }
      console.log(row);
    }
    console.log(`legend: ${[...legend].map(([k, ch]) => `${ch}=${k}`).join(' ')}`);
  }
};

const cmdPalette = () => {
  console.log('Curated ramps (dark → light). Compose new sprites from these.\n');
  for (const [name, colors] of Object.entries(RAMPS)) {
    console.log(`  ${name.padEnd(10)} ${colors.join(' ')}`);
  }
  console.log(`\nFull canonical palette: ${GAME_PALETTE.length} colours (lib/palette-data.mjs).`);
  console.log('Off-palette colours in a build get a nearest-colour suggestion from the linter.');
};

const cmdInstall = (args) => {
  const [name, dest] = args;
  if (!name || !dest) throw new Error('usage: install <name> <path-under-public/assets>');
  const src = path.join(OUT, `${name}.png`);
  if (!fs.existsSync(src)) throw new Error(`out/${name}.png not built yet`);
  const report = path.join(OUT, `${name}-report.txt`);
  if (fs.existsSync(report) && fs.readFileSync(report, 'utf8').includes('[FAIL]')) {
    throw new Error(`${name} still has FAILs — fix them before installing`);
  }
  const target = path.join(ROOT, 'public', 'assets', dest);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(src, target);
  console.log(`installed → public/assets/${dest}`);
  console.log('remember: the game loads sprites via src/game/assets/assetManifest.ts — add an entry there.');
};

const [cmd, ...rest] = process.argv.slice(2);
const commands = { build: cmdBuild, check: cmdCheck, dump: cmdDump, palette: cmdPalette, install: cmdInstall };
if (!commands[cmd]) {
  console.log('usage: node spritefactory/factory.mjs <build|check|dump|palette|install> ...');
  process.exit(cmd ? 1 : 0);
}
await commands[cmd](rest);
