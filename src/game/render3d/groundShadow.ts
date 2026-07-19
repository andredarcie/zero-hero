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
 * A soft shadow STRIP between two ground points — one LIMB of a projected silhouette.
 *
 * The per-billboard cast shadows assume a sprite STANDING at its tile; an articulated
 * machine's parts float between joints, so its silhouette must be drawn by whoever
 * knows the skeleton: project each joint onto the ground (World3D.groundCastAt) and
 * lay one strip per limb between the projected points. Chained strips share their
 * joints, so the silhouette is connected BY CONSTRUCTION — and because the projection
 * matches the standing sprites' stretch stylization, the chain grows out of the base
 * sprite's own cast shadow instead of contradicting it.
 *
 * HARD-edged, like every cast silhouette. The sprites' shadows are alpha-test CUTOUTS —
 * straight, crisp, pixelated by the low-res frame — and a first version of these strips
 * used the soft radial blob texture instead: side by side with the base's crisp
 * silhouette the limbs read as BLUR, two shadow languages on one machine (user feedback).
 * A plain black quad has exactly the cutout's edge. `set(…, fade)` scales the opacity —
 * pass the cast's own alpha so the limb darkens and breathes like every other silhouette.
 */
export class ShadowStrip {
  private readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly baseAlpha: number;

  public constructor(parent: THREE.Object3D, thickness: number, alpha: number) {
    this.baseAlpha = alpha;
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: alpha,
      depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2); // lie flat on the ground
    this.mesh = new THREE.Mesh(geo, this.mat);
    // A hair above the blobs (0.02) so strip-over-blob never z-fights; both only
    // darken, so the stacking order is invisible — the offset just settles the test.
    this.mesh.position.y = 0.024;
    // After the additive fire glow (2) and the contact blobs (3), like every cast
    // silhouette (see makeCastMesh): it must darken the lit pool, not wash out in it.
    this.mesh.renderOrder = 4;
    this.mesh.scale.set(0.001, 1, thickness);
    parent.add(this.mesh);
  }

  public set(ax: number, az: number, bx: number, bz: number, fade = 1): void {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    this.mesh.visible = true;
    this.mesh.position.set(ax + dx / 2, this.mesh.position.y, az + dz / 2);
    // Rotation about +Y maps local +X to (cos θ, 0, -sin θ) — hence the negation.
    this.mesh.rotation.y = -Math.atan2(dz, dx);
    // Half a thickness of overhang past each joint: chained strips CAP each other's ends,
    // so a bend never opens a wedge of light at the shared joint.
    this.mesh.scale.x = len + this.mesh.scale.z;
    this.mat.opacity = this.baseAlpha * fade;
  }

  /** No light to cast by this frame (no lit fire in reach, moon shadows off). */
  public hide(): void {
    this.mesh.visible = false;
  }

  public destroy(): void {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

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
