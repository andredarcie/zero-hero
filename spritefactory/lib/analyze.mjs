// The sprite linter. Every rule here was MEASURED from the shipped art (see
// reports/palette-report.txt), not invented:
//
//   - frames are 16×16 (sheets stack them); alpha is binary (0.23% semi across all 151 PNGs,
//     and those are artifacts);
//   - a 16×16 frame carries 2–8 colours — rock is 2, tree is 3, the hero sheet is 8;
//   - colours come from the game palette (ink navy #1d2b53 is the game's black — sprites are
//     flat silhouettes, not black-outlined cartoons);
//   - props/items leave breathing room inside the tile ("no sprite may overflow its tile" is the
//     project's fundamental art rule); terrain tiles are full-bleed 100% opaque.
//
// Levels: 'fail' blocks the build, 'warn' ships but demands a look, 'info' is context.

import { isGameColor, nearestGameColor, hexToRgb, rgbToHex, dist, luma, RAMPS } from './palette.mjs';

// Map a colour to the named ramp it belongs to (exact member, else nearest ramp colour's family).
const rampFamily = (hex) => {
  for (const [name, colors] of Object.entries(RAMPS)) if (colors.includes(hex)) return name;
  let best = null; let bestD = Infinity;
  for (const [name, colors] of Object.entries(RAMPS)) {
    for (const c of colors) {
      const d = dist(hexToRgb(hex), hexToRgb(c));
      if (d < bestD) { bestD = d; best = name; }
    }
  }
  return best;
};

const NIGHT_GROUND = hexToRgb('#452939'); // the tall-grass maroon the world floor reads as at night
const DAY_GROUND = hexToRgb('#64b964');   // the grass tile

/**
 * @param image  {width,height,data} RGBA
 * @param opts   { kind, frameW=16, frameH=16, allowNewColors=[], allowOrphans=false, name }
 *   kind: 'prop' | 'item' | 'character' | 'terrain' | 'effect' | 'icon'
 */
export const analyzeSprite = (image, opts = {}) => {
  const { width, height, data } = image;
  const kind = opts.kind ?? 'prop';
  const frameW = opts.frameW ?? 16;
  const frameH = opts.frameH ?? 16;
  const allowNew = new Set((opts.allowNewColors ?? []).map((h) => h.toLowerCase()));
  const findings = [];
  const add = (level, rule, msg) => findings.push({ level, rule, msg });

  if (width % frameW || height % frameH) {
    add('fail', 'frame-grid', `image is ${width}x${height}, not a multiple of the ${frameW}x${frameH} frame`);
    return { findings, frames: [] };
  }
  const cols = width / frameW; const rows = height / frameH;
  const frameCount = cols * rows;

  let semi = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0 && data[i] < 255) semi += 1;
  if (semi) add('fail', 'alpha-binary', `${semi} semi-transparent pixels — the game's alpha is binary (no anti-aliasing, no soft shadows)`);

  const frames = [];
  for (let f = 0; f < frameCount; f += 1) {
    const fx = (f % cols) * frameW; const fy = Math.floor(f / cols) * frameH;
    const counts = new Map(); // hex -> px
    let minX = frameW; let minY = frameH; let maxX = -1; let maxY = -1; let opaque = 0;
    const at = (x, y) => {
      const i = ((fy + y) * width + fx + x) * 4;
      return data[i + 3] >= 128 ? [data[i], data[i + 1], data[i + 2]] : null;
    };
    for (let y = 0; y < frameH; y += 1) {
      for (let x = 0; x < frameW; x += 1) {
        const c = at(x, y);
        if (!c) continue;
        opaque += 1;
        const hex = rgbToHex(c);
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    const tag = frameCount > 1 ? `frame ${f}: ` : '';
    const coverage = opaque / (frameW * frameH);
    frames.push({ index: f, colors: counts, opaque, coverage, bbox: maxX < 0 ? null : { minX, minY, maxX, maxY } });

    if (!opaque) { add('fail', 'empty-frame', `${tag}completely transparent`); continue; }

    // ---- colour discipline -------------------------------------------------------------
    if (counts.size > 12) add('fail', 'color-count', `${tag}${counts.size} colours — the game's 16x16 sprites use 2-8 (rock has 2, the hero sheet 8)`);
    else if (counts.size > 8) add('warn', 'color-count', `${tag}${counts.size} colours — above the 2-8 norm; merge the closest pairs`);

    for (const hex of counts.keys()) {
      if (isGameColor(hex)) continue;
      if (allowNew.has(hex)) { add('info', 'new-color', `${tag}${hex} is new but declared in allowNewColors`); continue; }
      const near = nearestGameColor(hexToRgb(hex));
      add('fail', 'off-palette', `${tag}${hex} is not on the game palette — nearest is ${near.hex} (d=${near.distance.toFixed(0)}); use it, or declare the new colour in allowNewColors with a reason`);
    }

    const hexes = [...counts.keys()];
    for (let i = 0; i < hexes.length; i += 1) {
      for (let j = i + 1; j < hexes.length; j += 1) {
        const d = dist(hexToRgb(hexes[i]), hexToRgb(hexes[j]));
        if (d < 12) add('warn', 'near-duplicate', `${tag}${hexes[i]} and ${hexes[j]} differ by d=${d.toFixed(1)} — invisible at 1x, merge them`);
      }
    }

    // ---- geometry ----------------------------------------------------------------------
    const touchesEdge = minX === 0 || minY === 0 || maxX === frameW - 1 || maxY === frameH - 1;
    if (kind === 'terrain') {
      if (coverage < 1) add('fail', 'terrain-bleed', `${tag}terrain tiles are full-bleed; ${(100 * (1 - coverage)).toFixed(0)}% of the tile is transparent`);
    } else {
      add('info', 'bbox', `${tag}content ${maxX - minX + 1}x${maxY - minY + 1} at (${minX},${minY}), coverage ${(100 * coverage).toFixed(0)}%`);
      if (touchesEdge && kind === 'item') add('warn', 'edge-touch', `${tag}pickup touches the frame edge — items float centred with clear margin (see wood.png, coin.png)`);
      if (touchesEdge && (kind === 'prop' || kind === 'effect') && coverage < 0.5) {
        add('warn', 'edge-touch', `${tag}sparse prop touches the frame edge — will read as clipped; pull it inside the tile`);
      }
    }

    // ---- stray pixels --------------------------------------------------------------------
    if (!opts.allowOrphans) {
      const orphans = [];
      for (let y = 0; y < frameH; y += 1) {
        for (let x = 0; x < frameW; x += 1) {
          if (!at(x, y)) continue;
          const n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
          if (n.every((c) => !c)) orphans.push(`(${x},${y})`);
        }
      }
      if (orphans.length) add('warn', 'orphan-pixel', `${tag}${orphans.length} isolated pixel(s) at ${orphans.slice(0, 6).join(' ')}${orphans.length > 6 ? '…' : ''} — intentional sparks? set allowOrphans: true; stray noise? erase`);
    }

    // ---- readability -------------------------------------------------------------------
    if (kind !== 'terrain' && opaque > 0) {
      for (const [bg, name] of [[NIGHT_GROUND, 'night ground'], [DAY_GROUND, 'day grass']]) {
        const bgLuma = luma(bg);
        let best = 0;
        for (const hex of counts.keys()) best = Math.max(best, Math.abs(luma(hexToRgb(hex)) - bgLuma));
        if (best < 30) add('warn', 'contrast', `${tag}every colour sits within ${best.toFixed(0)} luma of the ${name} — the sprite will vanish there`);
      }
    }

    // ---- form / flatness ("chapado") -----------------------------------------------------
    // The lesson of barrel v2→v3: a prop can pass every colour rule and still read as cardboard
    // when its dominant material only uses the middle of its ramp. Measure it: group the frame's
    // colours by ramp family; if one family owns ≥50% of the pixels and its used colours span
    // less than 35 luma, the form is flat. Threshold calibrated on shipped art: vase.png's
    // navy-on-navy spans 39 (passes), barrel v2's wood spanned 33 (fails). Props and items only —
    // 16×16 characters are flat silhouettes by design (the hero is), effects glow, terrain tiles.
    if ((kind === 'prop' || kind === 'item') && counts.size >= 3 && opaque >= 50) {
      const famPx = new Map(); const famColors = new Map();
      for (const [hex, n] of counts) {
        const fam = rampFamily(hex);
        famPx.set(fam, (famPx.get(fam) ?? 0) + n);
        if (!famColors.has(fam)) famColors.set(fam, []);
        famColors.get(fam).push(hex);
      }
      const [domFam, domPx] = [...famPx.entries()].sort((a, b) => b[1] - a[1])[0];
      const used = famColors.get(domFam);
      if (domPx / opaque >= 0.5 && used.length >= 2) {
        const lumas = used.map((h) => luma(hexToRgb(h)));
        const spread = Math.max(...lumas) - Math.min(...lumas);
        if (spread < 35) {
          add('warn', 'value-range', `${tag}dominant material (${domFam}) spans only ${spread.toFixed(0)} luma — reads flat ("chapado"); reach for the top of the ${domFam} ramp and shade in clusters (README: boas práticas de forma)`);
        }
      }
    }

    // ---- outline style -----------------------------------------------------------------
    const black = counts.get('#000000') ?? 0;
    if (black > 0 && black / opaque > 0.25) {
      add('warn', 'black-outline', `${tag}${black}px of pure #000000 — this game's "black" is the ink navy #1d2b53; flat silhouettes, not black-outlined cartoons`);
    }
  }

  return { findings, frames };
};

export const formatReport = ({ findings, frames }, name = '') => {
  const lines = [];
  const fails = findings.filter((f) => f.level === 'fail');
  const warns = findings.filter((f) => f.level === 'warn');
  lines.push(`${name}: ${frames.length} frame(s) — ${fails.length} fail, ${warns.length} warn`);
  for (const f of findings) {
    const mark = f.level === 'fail' ? 'FAIL' : f.level === 'warn' ? 'warn' : 'info';
    lines.push(`  [${mark}] ${f.rule}: ${f.msg}`);
  }
  for (const fr of frames) {
    const cols = [...fr.colors.entries()].sort((a, b) => b[1] - a[1])
      .map(([h, n]) => `${h}×${n}`).join(' ');
    lines.push(`  frame ${fr.index}: ${cols}`);
  }
  return lines.join('\n');
};
