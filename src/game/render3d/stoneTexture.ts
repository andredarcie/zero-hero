import * as THREE from 'three';

// ── Pixel-art granite for the 3D stone ford ───────────────────────────────────
//
// The sibling of woodTexture.ts, and for the same reason. The bridge deck is real box
// geometry wearing painted pixel art; the stone ford has to be real box geometry too, or it
// goes back to being a camera-facing card standing in the river — a sticker of a rock, which
// is exactly what the first cut looked like next to the deck's actual carpentry.
//
// The palette is WET river granite, and it is deliberately DARK — pitched to the same value
// range as the wood next to it (whose brightest plank is only #966b48). The first cut used the
// pale greys of rock.png (#b9bec4 crown) and the result was a stone that blew out to a glowing
// white blob at night: near-white pixels cross the post chain's bloom threshold, so a "stone"
// lit itself up like a lantern in the middle of a dark river. Stone in water is dark stone.
//
//   #79818a damp crown · #5c636b body · #454b52 shaded flank · #313740 waterline / crevice
//
// Two patterns, because a ford is not one tile of "stone" — it is a big worn SLAB you step on
// with smaller boulders wedged around it holding it in the current. The slab is lighter and
// smoother on top (that is the face you actually see from up here); the boulders are rounder,
// darker, and take a fleck of moss, so the group reads as river rock and not cut masonry.

export type StoneKind = 'slab' | 'boulder';

const PALETTE: Record<string, [number, number, number]> = {
  H: [0x79, 0x81, 0x8a], // damp crown — the lightest pixel on the whole ford
  M: [0x5c, 0x63, 0x6b], // body
  D: [0x45, 0x4b, 0x52], // shaded flank
  S: [0x31, 0x37, 0x40], // crevice / waterline
  G: [0x4c, 0x58, 0x42], // a fleck of river moss
};

// Authored TOP-DOWN, like the wood: first row is the far (north) edge of the box's top face.
const PATTERNS: Record<StoneKind, string[]> = {
  // The stepping face: worn smooth and pale in the middle, dark and wet around the rim, with
  // a couple of cracks and a patch of moss where the water licks it.
  slab: [
    'SDDMMMMHHMMMMDDS',
    'DMMHHHHHHHHMHMMD',
    'DMHHHMHHHHHHHMMD',
    'MMHHHHHSHHHHHHMD',
    'DMHHMHHHHHHHHHMD',
    'DMMHHHHHHHHHHMGD',
    'DGMMHHHHHHHMMMGD',
    'SDDMMMMMMMMMDDSS',
  ],
  // A rounder rock, mostly in shadow: lit only along its crown, soaked dark at the base.
  boulder: [
    'SDMMHHMMDS',
    'DMHHHHHHMD',
    'DMHHHHHMMD',
    'SDMMHHMMGD',
    'SSDDMMDDSS',
  ],
};

const cache = new Map<StoneKind, THREE.DataTexture>();

/** The pixel-art granite texture for one part of the stone ford (cached). */
export const getStoneTexture = (kind: StoneKind): THREE.DataTexture => {
  const hit = cache.get(kind);
  if (hit) return hit;

  const rows = PATTERNS[kind];
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
  cache.set(kind, tex);
  return tex;
};
