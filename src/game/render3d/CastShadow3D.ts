import * as THREE from 'three';

// ── Firelight cast shadows (a faithful 3D port of the 2D CastShadow.ts) ───────
//
// A flame is a point light a little above the ground: an object between it and
// the dark throws a shadow that (a) points straight away from the flame and
// (b) grows longer as the flame dips and its light grazes lower. Because billboards
// face the camera, a real shadow-map would only cast a thin sliver of them — so,
// exactly like the 2D game, we lay a BLACK SILHOUETTE of the object's own sprite
// flat on the ground, anchored at its foot, rotated to point away from the flame
// and stretched along its length. It fades out toward the edge of the light.
//
// The knobs mirror the 2D constants so the look is identical.

const FOOT_Y = 0.015; // sits just above the ground (over the contact blob)
export const CAST_MAX_ALPHA = 0.6; // darkness right beside the flame
const WIDTH_FACTOR = 0.92; // shadows are a touch slimmer than the object
// A silhouette laid flat on the ground is foreshortened by the tilted camera, so it
// must run LONGER than the 2D screen-space shadow to read the same. Even hugging the
// flame it clearly reaches past the object's foot; at the light's edge it rakes long.
const NEAR_STRETCH = 1.3; // length multiplier hugging the flame
const FAR_STRETCH = 3.2; // length multiplier at the edge of the light (long, grazing)

/** A flat ground silhouette quad: foot at the origin, body extending along -Z, unit sized. */
export const makeCastMesh = (): THREE.Mesh => {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0); // origin at the foot (bottom-centre)
  geo.rotateX(-Math.PI / 2); // lay flat: head now points along -Z, foot at 0
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    alphaTest: 0.4, // keep only the sprite silhouette
    side: THREE.DoubleSide, // a flipped (mirrored) scale must not backface-cull
  });
  const mesh = new THREE.Mesh(geo, mat);
  // Draw AFTER the additive fire glow (renderOrder 2) so the silhouette darkens the lit
  // pool instead of being washed out by it — otherwise shadows vanish right around the
  // fire, exactly where the ground is brightest (user feedback: "invisible square").
  mesh.renderOrder = 4;
  mesh.visible = false;
  return mesh;
};

/**
 * Lay `mesh` down as `objX,objY`'s shadow cast away from a flame at `fireX,fireY`.
 * `level` is the flame's instantaneous brightness (~0.6 dim … 1.4 flaring), `radius`
 * its reach in tiles, `alpha` the darkness beside it. Hides the mesh past the reach.
 * Returns true if the shadow is visible.
 */
export const configureCast = (
  mesh: THREE.Mesh,
  objX: number,
  objY: number,
  tex: THREE.Texture,
  flipX: boolean,
  width: number,
  height: number,
  fireX: number,
  fireY: number,
  level: number,
  radius: number,
  alpha: number,
): boolean => {
  const dx = objX - fireX;
  const dz = objY - fireY;
  const dist = Math.hypot(dx, dz) || 1e-3;
  const t = Math.min(1, dist / radius);

  // Length: longer the farther from the flame (grazing light), and longer as the
  // flame dips (level < 1 → taller shadow) — the inverse coupling that made the 2D
  // shadows wax and wane with the fire.
  const distStretch = NEAR_STRETCH + (FAR_STRETCH - NEAR_STRETCH) * t;
  const flameStretch = 1.5 - 0.5 * level; // low flame → long shadow
  const length = height * distStretch * Math.max(0.4, flameStretch);

  // Fade toward the light's edge (the ground there is already black); darkest beside it.
  const a = alpha * (1 - t * t);
  if (a <= 0.02) { mesh.visible = false; return false; }

  const mat = mesh.material as THREE.MeshBasicMaterial;
  if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
  mat.opacity = a;
  mesh.position.set(objX, FOOT_Y, objY);
  // Base head direction is -Z; rotate it onto the away-from-flame direction.
  mesh.rotation.y = Math.atan2(-dx / dist, -dz / dist);
  mesh.scale.set((flipX ? -1 : 1) * width * WIDTH_FACTOR, 1, length);
  mesh.visible = true;
  return true;
};
