import * as THREE from 'three';

// ── Soft contact-shadow blobs (the 2D game's grounding ellipses) ──────────────
//
// In the 2D game EVERY standing thing — trees, the hero, NPCs, enemies, props —
// sat on a soft dark ground ellipse ("anchors lifted obstacles so they read as
// standing up"). This module recreates that exact look in 3D: a soft radial
// dark blob laid flat on the ground under each object.
//
// Two things make it read like the 2D reference (and NOT like the old hard
// triangle-fan ellipse it replaces):
//   · SOFT edge — a radial-gradient texture (solid dark core, feathered rim)
//     instead of a hard-edged filled shape.
//   · ROUND on the ground — the blob is a near-circle on the XZ plane; the
//     tilted camera foreshortens it into a natural ground ellipse. (The old
//     mesh pre-flattened rz, which the camera tilt then crushed into a sliver.)
//
// Rendered as black at low opacity with normal blending — identical maths to the
// 2D `ellipse(…, 0x000000, 0.26)`: it simply darkens the ground it covers.

let sharedTexture: THREE.CanvasTexture | undefined;

/**
 * The soft radial blob mask (white core → transparent rim); the material tints it
 * black. Rendered at a LOW resolution and sampled with NEAREST so the shadow's edge
 * breaks into chunky pixel blocks (the 2D pixel-art look) rather than a smooth
 * anti-aliased gradient. The soft falloff is kept — the low res just pixelates it.
 */
const BLOB_TEX_RES = 22;
export const getShadowBlobTexture = (): THREE.CanvasTexture => {
  if (sharedTexture) return sharedTexture;
  const c = document.createElement('canvas');
  c.width = c.height = BLOB_TEX_RES;
  const ctx = c.getContext('2d')!;
  const r = BLOB_TEX_RES / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  // A fairly solid core so the blob reads as a definite shadow, then a soft
  // feathered rim so its edge dissolves into the ground like the 2D reference.
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.42)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BLOB_TEX_RES, BLOB_TEX_RES);
  sharedTexture = new THREE.CanvasTexture(c);
  sharedTexture.colorSpace = THREE.SRGBColorSpace;
  sharedTexture.magFilter = THREE.NearestFilter;
  sharedTexture.minFilter = THREE.NearestFilter;
  sharedTexture.generateMipmaps = false;
  return sharedTexture;
};

/** A flat black blob material at `alpha` opacity (shared texture, never depth-writes). */
export const makeShadowBlobMaterial = (alpha: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    map: getShadowBlobTexture(),
    color: 0x000000,
    transparent: true,
    opacity: alpha,
    depthWrite: false,
  });

/**
 * A single soft ground blob, ready to position under an object. `rx`/`rz` are the
 * blob's radii in tiles on the ground plane (keep them close for a round blob —
 * the camera tilt supplies the foreshortening). The mesh sits just above the
 * ground so it never z-fights the terrain.
 */
export const makeShadowBlob = (rx: number, rz: number, alpha: number): THREE.Mesh => {
  const geo = new THREE.PlaneGeometry(2 * rx, 2 * rz);
  geo.rotateX(-Math.PI / 2); // lie flat on the ground
  const mesh = new THREE.Mesh(geo, makeShadowBlobMaterial(alpha));
  mesh.position.y = 0.02;
  // Draw after the additive fire glow (renderOrder 2) so the blob darkens the lit pool
  // instead of being washed out by it.
  mesh.renderOrder = 3;
  return mesh;
};

/**
 * One merged geometry of soft blob quads — the static solid tiles (trees/walls)
 * all share a single draw call. Each quad is UV-mapped to the whole blob texture.
 */
export const buildShadowBlobGeometry = (
  centers: ReadonlyArray<{ x: number; z: number }>,
  rx: number,
  rz: number,
  y = 0.018,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  centers.forEach(({ x, z }, i) => {
    pos.push(x - rx, y, z - rz, x + rx, y, z - rz, x + rx, y, z + rz, x - rx, y, z + rz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    const b = i * 4;
    idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
};
