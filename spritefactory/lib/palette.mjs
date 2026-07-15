// The game's colour language, curated from the extractor's audit (lib/palette-data.mjs holds the
// raw census; reports/palette-report.txt the evidence). Two layers:
//
//   RAMPS — the named ladders a NEW sprite should compose from. Each ramp is dark → light.
//   GAME_PALETTE — every canonical colour the shipped art actually uses; the analyzer treats
//                  membership here as "on palette" so remasters of old sprites stay legal.
//
// The single most important colour: #1d2b53. It is the game's INK — sprites here don't wear black
// outlines, their dark mass IS this navy (the hero is a navy silhouette; the vase is navy on navy).

import { GAME_PALETTE } from './palette-data.mjs';

export { GAME_PALETTE };

export const RAMPS = {
  // The game's "black". Bodies, silhouettes, night-side of everything.
  ink:      ['#141d38', '#1d2b53', '#243669', '#324476'],
  // Undead bone, key-pickup halo, UI silver.
  bone:     ['#858585', '#b5b5b5', '#cdcdcd', '#ffffff'],
  // Boulders and masonry — a cool lavender-gray, NOT a brown-gray.
  stone:    ['#5d6165', '#7c7e8b', '#989aa7', '#a9abbe'],
  // Tree-canopy shadow, charcoal props.
  slate:    ['#272b2d', '#313638', '#3a3f3f'],
  // Foliage that reads at night: dry olive, not lush green.
  olive:    ['#4d4f2c', '#626439', '#8a8d49'],
  // The dark maroon the night ground is made of (tall grass, shadow ground).
  nightsoil:['#3e2533', '#452939'],
  // Wood: handles, planks, logs.
  wood:     ['#63452c', '#815938', '#886644', '#b7916a'],
  // Drier, redder wood — dry bush twigs, cracked bark.
  drywood:  ['#68380f', '#733e11', '#826841'],
  // Fire, danger, hearts.
  ember:    ['#a53030', '#c83e3e', '#e7462a'],
  // Flame cores, coins, treasure.
  gold:     ['#c9c81b', '#f1cc36', '#f8e394'],
  // The hero's accent green.
  heroGreen:['#027849', '#008751', '#00985b'],
  // Daylight grass tile (terrain only — props use olive).
  meadow:   ['#64b964', '#7dde99'],
  // River water (animated tiles) and deep pools.
  water:    ['#1f424f', '#265160', '#0b8a8f', '#27a9af', '#bbf2f4'],
  // Deep-water / moonlit steel blues.
  deepblue: ['#334c62', '#3f607e', '#557998'],
  // Lava floor.
  lava:     ['#e73200', '#e14400', '#dd9118'],
};

export const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

export const rgbToHex = ([r, g, b]) =>
  `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;

const CANON_SET = new Set(GAME_PALETTE.map((c) => c.hex));
const RAMP_COLORS = Object.values(RAMPS).flat();
for (const hex of RAMP_COLORS) CANON_SET.add(hex);

export const isGameColor = (hex) => CANON_SET.has(hex.toLowerCase());

/** Straight-line RGB distance — fine at this palette's spacing. */
export const dist = (a, b) => {
  const dr = a[0] - b[0]; const dg = a[1] - b[1]; const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

/** Nearest canonical colour to an arbitrary RGB, with the distance — the analyzer's "did you
 *  mean". Prefers ramp colours on a tie so suggestions pull toward the curated language. */
export const nearestGameColor = (rgb) => {
  let best = null; let bestD = Infinity;
  for (const hex of [...RAMP_COLORS, ...CANON_SET]) {
    const d = dist(rgb, hexToRgb(hex));
    if (d < bestD) { bestD = d; best = hex; }
  }
  return { hex: best, distance: bestD };
};

/** Perceived luminance 0..255 (ITU-R 601) — the readability checks key off this. */
export const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
