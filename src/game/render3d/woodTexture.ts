import * as THREE from 'three';

// ── Pixel-art wood for the 3D carpentry (the river bridge) ────────────────────
//
// The bridge deck is real box geometry, but its faces are PAINTED PIXEL ART —
// tiny NEAREST DataTextures authored in art pixels (16 per tile) using exactly
// the four colours of the game's own wood sprites (bridge.png / wood.png):
//
//   #966b48 lit plank edge · #815938 plank body · #63452c grain/shade · #4a3320 seams
//
// The plank pattern is lifted straight from bridge.png: a bright edge row, a
// grained body with the odd dark fleck, a shaded row, and dark butt-joint seams
// staggered between neighbouring boards (col 8 on one, cols 4/12 on the next).
//
// A deck crossing an east-west river swaps its boxes' dimensions instead of
// rotating them, so `rotated` transposes the art to keep the grain running down
// each part's long axis.

export type WoodKind = 'plankA' | 'plankB' | 'stringer' | 'post';

// The exact wood palette, one letter per colour so the patterns read as sprites.
const PALETTE: Record<string, [number, number, number]> = {
  H: [0x96, 0x6b, 0x48], // lit edge (bridge.png's top plank row)
  M: [0x81, 0x59, 0x38], // plank body
  D: [0x63, 0x45, 0x2c], // grain flecks / shaded edge
  S: [0x4a, 0x33, 0x20], // seams and gaps (the darkest wood in the sprite)
};

// Authored TOP-DOWN like a sprite sheet: first row = the plank's far (north) edge
// on the deck's top face, or a standing part's head on its side faces.
const PATTERNS: Record<WoodKind, string[]> = {
  plankA: [
    'HHHHHHHHSHHHHHHH',
    'MDMMMMMMSMMMMMDM',
    'DDDDDDDDSDDDDDDD',
  ],
  plankB: [
    'HHHHSHHHHHHHSHHH',
    'MDMMSMMMMMMMSMDM',
    'DDDDSDDDDDDDSDDD',
  ],
  // The beams live in the shade under the deck: dark body, darker grain streaks.
  stringer: [
    'DDDSDDDDDDSDDDDD',
    'SDDSSDSSDDSSDSSD',
  ],
  // A leg standing in the river: a catch of light at the head, soaked dark below.
  post: [
    'MD',
    'DS',
    'DS',
    'DD',
    'DS',
    'SD',
    'SS',
    'SS',
  ],
};

const cache = new Map<string, THREE.DataTexture>();

/** The pixel-art wood texture for one bridge part (cached; `rotated` transposes the grain). */
export const getWoodTexture = (kind: WoodKind, rotated = false): THREE.DataTexture => {
  const key = `${kind}|${rotated ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const art = PATTERNS[kind];
  const rows = rotated
    // Transpose: pattern rows become columns, so the grain follows the swapped long axis.
    ? art[0].split('').map((_, x) => art.map((row) => row[x]).join(''))
    : art;
  const h = rows.length;
  const w = rows[0].length;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    // DataTexture row 0 is v=0 (the bottom/near edge); the art is authored top-down.
    const line = rows[h - 1 - y];
    for (let x = 0; x < w; x++) {
      const [r, g, b] = PALETTE[line[x]];
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
};
