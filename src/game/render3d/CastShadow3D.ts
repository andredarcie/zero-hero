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
// The MOON casts the same silhouettes: a fixed faint heading that gives the forest
// its depth between fires, where until now everything floated on flat ground. The
// moon never moves, so the static solids' moon shadows bake into one instanced
// draw at build time (World3D.fillMoonCastField) and actors' single shadow meshes
// swing from flame-cast to moon-cast at a pool's edge (handoffCast below).
//
// The knobs mirror the 2D constants so the look is identical.

const FOOT_Y = 0.015; // sits just above the ground (over the contact blob)
export const CAST_MAX_ALPHA = 0.6; // darkness right beside the flame
export const WIDTH_FACTOR = 0.92; // shadows are a touch slimmer than the object
// A silhouette laid flat on the ground is foreshortened by the tilted camera, so it
// must run LONGER than the 2D screen-space shadow to read the same. Even hugging the
// flame it clearly reaches past the object's foot; at the light's edge it rakes long.
const NEAR_STRETCH = 1.3; // length multiplier hugging the flame
const FAR_STRETCH = 3.2; // length multiplier at the edge of the light (long, grazing)

/**
 * Where the quad's ORIGIN has to sit so the ART's own bottom edge lands on the object's foot.
 *
 * The silhouette is the whole FRAME laid flat, and any transparent rows under the art travel with
 * it — stretched by `length`, so a two-pixel margin stops being two pixels and becomes a visible
 * strip of bare ground between an object and its shadow (see frameFootPad, which measures it).
 * Pulling the origin BACK along the heading by that same fraction of the length puts the drawing's
 * foot where the object actually stands. A no-op (footPad = 0) for every sprite already flush with
 * its frame, which is nearly all of them — so this fixes the outliers without touching the rest.
 */
export const castAnchor = (
  objX: number,
  objY: number,
  length: number,
  rotY: number,
  footPad: number,
): { x: number; y: number } => {
  if (footPad <= 0) return { x: objX, y: objY };
  const back = footPad * length;
  // The quad's head points along -Z before the rotation, so (-sin, -cos) is its ground heading
  // and moving AGAINST it is a plus.
  return { x: objX + Math.sin(rotY) * back, y: objY + Math.cos(rotY) * back };
};

// Shared scratch for the hot paths below (applyCast runs per caster per frame, add per
// instance per frame): the anchor math without the fresh {x, y} per call.
const anchorScratch = { x: 0, y: 0 };
const castAnchorInto = (
  objX: number,
  objY: number,
  length: number,
  rotY: number,
  footPad: number,
): void => {
  if (footPad <= 0) {
    anchorScratch.x = objX;
    anchorScratch.y = objY;
    return;
  }
  const back = footPad * length;
  anchorScratch.x = objX + Math.sin(rotY) * back;
  anchorScratch.y = objY + Math.cos(rotY) * back;
};

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
 * Every STATIC solid's cast shadow, in ONE draw call.
 *
 * There is a shadow per tree, rock and wall standing near a lit fire, and they were 36 of the
 * frame's 120 draw calls — each one a program bind, a whole set of uniform uploads, and two
 * triangles. They were also where most of the frame's garbage came from: three allocates inside its
 * uniform setters, so the GC bill tracks the draw count, and the collector was stopping the world
 * for 300ms at a time.
 *
 * Two properties make batching them EXACT rather than merely close:
 *
 *  · They all take their silhouette from the same image. getTexture3D hands out clones of the
 *    tileset that differ only in which frame of it they window onto, so one shared texture plus a
 *    per-instance UV window reproduces every one of them (frameUvWindow, so the arithmetic lives
 *    in exactly one place and cannot drift).
 *
 *  · They are all PURE BLACK. Blending N layers of one colour is commutative — the result is
 *    dst · Π(1 - aᵢ) whichever way round you do it — so the arbitrary order inside an instanced
 *    batch lands on precisely the pixel the back-to-front sorted version did. This would NOT hold
 *    for coloured sprites.
 *
 * The alpha is applied per instance AFTER the alpha test. The test's job is only to CUT the
 * silhouette out of the sheet, and the centre-pinned fetch below hands it binary alphas, so the
 * cut is the same whichever side of the test the darkness multiplies in — except for a faint
 * shadow: multiplied in BEFORE (as the material's `opacity` used to be), any instance dimmer
 * than the 0.4 threshold was discarded whole. That is why a moonlight shadow (~0.2 dark, its
 * whole reason to exist) rendered as nothing, and why a fire shadow used to blink out at ~58%
 * of the pool radius instead of fading to the edge.
 */
export class SolidCastField {
  public readonly mesh: THREE.InstancedMesh;
  private readonly uvWindow: THREE.InstancedBufferAttribute;
  private readonly alpha: THREE.InstancedBufferAttribute;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3();
  // Collected this frame, then sorted back-to-front in end() — as PRE-ALLOCATED flat
  // buffers, not an array of fresh objects. This begin/add/end cycle runs every frame for
  // every instance; the object-literal version it replaces was the shadow path's main
  // source of per-frame garbage (~70+ objects a frame with two fires lit).
  private readonly pendX: Float32Array;
  private readonly pendZ: Float32Array;
  private readonly pendUv: Float32Array; // 4 per entry: offsetX offsetY repeatX repeatY
  private readonly pendW: Float32Array;
  private readonly pendL: Float32Array;
  private readonly pendRot: Float32Array;
  private readonly pendA: Float32Array;
  private readonly pendDepth: Float32Array;
  /** Caller tags (fillMoonCastField's tiles); only written when a ref is passed to add(). */
  private readonly pendRef: unknown[];
  /** Sort permutation, reused across frames. */
  private readonly order: number[] = [];
  private pendCount = 0;
  private readonly byDepthDesc = (a: number, b: number): number =>
    this.pendDepth[b] - this.pendDepth[a];

  public constructor(capacity: number, map: THREE.Texture) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0); // origin at the foot
    geo.rotateX(-Math.PI / 2); // lay flat, head along -Z

    // The tileset is filtered LINEAR now, for the tiles' sake (textures3d) — and a shadow is the
    // one thing here that must NOT be resampled: it is a silhouette cut out of the sheet by an
    // alphaTest, and a bilinear fetch would blur the alpha and creep the cutout's edge. So fetch
    // dead-centre of the texel, which is NEAREST reproduced exactly, and these come out the same
    // pixels they always did. (Jagged, and that is fine — the shadows are not what we are fixing.)
    const mapSize = new THREE.Vector2(1, 1);
    const img = map.image as { width: number; height: number } | undefined;
    if (img?.width && img.height) mapSize.set(img.width, img.height);

    this.uvWindow = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.uvWindow.setUsage(THREE.DynamicDrawUsage);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aUvWindow', this.uvWindow);
    geo.setAttribute('aCastAlpha', this.alpha);

    const mat = new THREE.MeshBasicMaterial({
      map,
      color: 0x000000,
      transparent: true,
      opacity: 1, // per-instance now; see the shader patch below
      depthWrite: false,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
    });
    mat.customProgramCacheKey = () => 'solidCastField';
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          'void main() {',
          `attribute vec4 aUvWindow;
           attribute float aCastAlpha;
           varying float vCastAlpha;
           void main() {`,
        )
        // Window onto this instance's frame of the sheet, in place of the material's single
        // map transform — which is what the per-shadow cloned textures used to buy.
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
           vMapUv = uv * aUvWindow.zw + aUvWindow.xy;
           vCastAlpha = aCastAlpha;`,
        );
      shader.uniforms.uMapSize = { value: mapSize };
      // Expand map_fragment ourselves so the fetch can be pinned to the texel's centre (see above).
      const fetch = 'texture2D( map, vMapUv )';
      const mapChunk = THREE.ShaderChunk.map_fragment.replace(
        fetch,
        'texture2D( map, ( floor( vMapUv * uMapSize ) + 0.5 ) / uMapSize )',
      );
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform vec2 uMapSize;\nvarying float vCastAlpha;\nvoid main() {')
        .replace('#include <map_fragment>', mapChunk)
        // AFTER the test — see the class comment: the test only cuts the silhouette, and a
        // faint (moonlight) instance must survive it to be faint rather than absent.
        .replace(
          '#include <alphatest_fragment>',
          '#include <alphatest_fragment>\n diffuseColor.a *= vCastAlpha;',
        );
    };

    this.pendX = new Float32Array(capacity);
    this.pendZ = new Float32Array(capacity);
    this.pendUv = new Float32Array(capacity * 4);
    this.pendW = new Float32Array(capacity);
    this.pendL = new Float32Array(capacity);
    this.pendRot = new Float32Array(capacity);
    this.pendA = new Float32Array(capacity);
    this.pendDepth = new Float32Array(capacity);
    this.pendRef = new Array(capacity).fill(undefined);

    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.count = 0;
    this.mesh.renderOrder = 4; // after the additive fire glow, like the single meshes did
    // The instances scatter across the clearing, so one bounding sphere would either cull them
    // all wrongly or bound the whole world. It is a single draw either way.
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  public begin(): void {
    this.pendCount = 0;
  }

  /** How many shadows were queued since begin(). */
  public get pendingCount(): number {
    return this.pendCount;
  }

  /**
   * One shadow. Mirrors applyCast's transform exactly. `ref` is an optional caller tag
   * handed back by end()'s onPlace with the instance slot the entry landed in after the
   * sort — how fillMoonCastField learns which slot is which tile, so the per-instance
   * alpha can be retuned later (the statics' fire→moon handoff) without a re-bake.
   */
  public add(
    objX: number,
    objY: number,
    uv: { offsetX: number; offsetY: number; repeatX: number; repeatY: number },
    width: number,
    length: number,
    rotY: number,
    alpha: number,
    footPad = 0,
    ref?: unknown,
  ): void {
    const i = this.pendCount;
    if (i >= this.mesh.instanceMatrix.count) return;
    // Stored ALREADY anchored (see castAnchor) — the sort below wants the quad's own position
    // anyway, and this keeps the instanced path and the single-mesh path the same transform.
    castAnchorInto(objX, objY, length, rotY, footPad);
    this.pendX[i] = anchorScratch.x;
    this.pendZ[i] = anchorScratch.y;
    this.pendUv[i * 4] = uv.offsetX;
    this.pendUv[i * 4 + 1] = uv.offsetY;
    this.pendUv[i * 4 + 2] = uv.repeatX;
    this.pendUv[i * 4 + 3] = uv.repeatY;
    this.pendW[i] = width;
    this.pendL[i] = length;
    this.pendRot[i] = rotY;
    this.pendA[i] = alpha;
    this.pendRef[i] = ref;
    this.pendCount = i + 1;
  }

  /**
   * Write the batch, FARTHEST FIRST.
   *
   * The one thing a batch cannot inherit is three's transparent sort. These shadows overlap, they
   * blend, and — because the scene has fog — their source colour is not quite the pure black that
   * would make the blend commutative: the fog tints each of them by its own depth. Drawn in an
   * arbitrary order they land on a slightly different pixel from the sorted ones, which is a
   * visible difference where three or four rake across each other. So sort them here, by the same
   * key three used (view depth, back to front) — 36 numbers, once a frame.
   */
  public end(camX: number, camZ: number, onPlace?: (ref: unknown, slot: number) => void): void {
    const n = this.pendCount;
    for (let i = 0; i < n; i += 1) {
      const dx = this.pendX[i] - camX;
      const dz = this.pendZ[i] - camZ;
      this.pendDepth[i] = dx * dx + dz * dz;
    }
    this.order.length = n;
    for (let i = 0; i < n; i += 1) this.order[i] = i;
    this.order.sort(this.byDepthDesc);

    for (let slot = 0; slot < n; slot += 1) {
      const p = this.order[slot];
      this.position.set(this.pendX[p], FOOT_Y, this.pendZ[p]);
      this.quaternion.setFromEuler(this.euler.set(0, this.pendRot[p], 0));
      this.scale.set(this.pendW[p], 1, this.pendL[p]);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(slot, this.matrix);
      this.uvWindow.setXYZW(
        slot, this.pendUv[p * 4], this.pendUv[p * 4 + 1], this.pendUv[p * 4 + 2], this.pendUv[p * 4 + 3],
      );
      this.alpha.setX(slot, this.pendA[p]);
      if (onPlace) onPlace(this.pendRef[p], slot);
    }

    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.uvWindow.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  /**
   * Retune one instance's darkness in place (the statics' fire→moon handoff), without
   * touching its transform. Only meaningful on a field whose contents are NOT refilled
   * every frame (the baked moon field); a per-frame field overwrites it in end().
   */
  public setInstanceAlpha(slot: number, alpha: number): void {
    this.alpha.setX(slot, alpha);
    this.alpha.needsUpdate = true;
  }
}

/** A cast shadow's placement, as plain mutable fields — the shape every helper below fills. */
export interface CastPose {
  length: number;
  rotY: number;
  alpha: number;
}

/**
 * The geometry of one cast shadow: where it lands, how long it rakes, how dark it is.
 * Shared by the single-mesh path (actors, each with its own sprite) and the instanced field.
 *
 * Writes into `out` and returns whether there is a shadow at all — the allocating wrapper
 * below exists for cold callers. This runs once per caster and once per candidate solid,
 * every frame: returning a fresh object here (as it originally did) put hundreds of
 * short-lived objects per frame on the GC, in the project whose worst historical stall was
 * a 300ms stop-the-world collection.
 *
 * `heightScale` is the shadowHeight knob made honest: the hd3d param always PROMISED
 * "higher light = shorter shadows" but only ever moved the light itself. Callers pass
 * (2.2 / shadowHeight), normalized so the tuned default is exactly the old behaviour.
 */
export const castTransformInto = (
  out: CastPose,
  objX: number,
  objY: number,
  height: number,
  fireX: number,
  fireY: number,
  level: number,
  radius: number,
  alpha: number,
  heightScale = 1,
): boolean => {
  const dx = objX - fireX;
  const dz = objY - fireY;
  const dist = Math.hypot(dx, dz) || 1e-3;
  const t = Math.min(1, dist / radius);

  const distStretch = NEAR_STRETCH + (FAR_STRETCH - NEAR_STRETCH) * t;
  const flameStretch = 1.5 - 0.5 * level; // low flame → long shadow
  const a = alpha * (1 - t * t);
  if (a <= 0.02) return false;

  out.length = height * distStretch * Math.max(0.4, flameStretch) * heightScale;
  out.rotY = Math.atan2(-dx / dist, -dz / dist);
  out.alpha = a;
  return true;
};

/** Allocating wrapper over castTransformInto, for cold (once-per-frame-per-object) callers. */
export const castTransform = (
  objX: number,
  objY: number,
  height: number,
  fireX: number,
  fireY: number,
  level: number,
  radius: number,
  alpha: number,
  heightScale = 1,
): CastPose | null => {
  const out: CastPose = { length: 0, rotY: 0, alpha: 0 };
  return castTransformInto(out, objX, objY, height, fireX, fireY, level, radius, alpha, heightScale)
    ? out
    : null;
};

/**
 * One caster's shadow this frame: the flame's cast when a fire reaches it, the MOON's
 * otherwise — and a swing between the two at the edge of the pool.
 *
 * The moon is the fallback, not an addition: a second mesh per actor would double the
 * shadow draw calls (and Survivors fields a hundred actors), so each caster keeps its
 * single quad and this decides where it points. The handoff has to be a blend because
 * both shadows are visible at the crossover: the fire's fades to nothing at its pool's
 * edge, and snapping a 0.16-dark shadow to a new angle the frame the pool ends reads as
 * a glitch. Instead the angle/length swing from flame-cast to moon-cast as the fire's
 * grip (its alpha, relative to the moon's) lets go — like walking out of a lamplit
 * circle at night.
 */
export const handoffCastInto = (
  out: CastPose,
  fire: CastPose | null,
  moonRotY: number,
  moonLength: number,
  moonAlpha: number,
): boolean => {
  if (moonAlpha <= 0.02) { // moon shadows off — pure fire behaviour
    if (!fire) return false;
    if (out !== fire) { out.length = fire.length; out.rotY = fire.rotY; out.alpha = fire.alpha; }
    return true;
  }
  if (!fire) {
    out.length = moonLength;
    out.rotY = moonRotY;
    out.alpha = moonAlpha;
    return true;
  }
  const w = Math.min(1, fire.alpha / moonAlpha);
  // Swing the short way round the circle.
  let d = (fire.rotY - moonRotY) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  out.length = moonLength + (fire.length - moonLength) * w;
  out.rotY = moonRotY + d * w;
  // max, not lerp: a lerp dips BELOW the moon's darkness mid-handoff (fire 0.08 →
  // 0.12 → moon 0.16), a visible pulse as the caster walks a straight line.
  out.alpha = Math.max(fire.alpha, moonAlpha);
  return true;
};

/** Allocating wrapper over handoffCastInto, for cold callers (the robotic arm's projector). */
export const handoffCast = (
  fire: CastPose | null,
  moonRotY: number,
  moonLength: number,
  moonAlpha: number,
): CastPose | null => {
  const out: CastPose = { length: 0, rotY: 0, alpha: 0 };
  return handoffCastInto(out, fire, moonRotY, moonLength, moonAlpha) ? out : null;
};

/**
 * Lay `mesh` down as `objX,objY`'s ground-silhouette shadow: `length` tiles along the
 * `rotY` heading at darkness `alpha` (see castTransform / handoffCast for where those
 * come from).
 */
export const applyCast = (
  mesh: THREE.Mesh,
  objX: number,
  objY: number,
  tex: THREE.Texture,
  flipX: boolean,
  width: number,
  length: number,
  rotY: number,
  alpha: number,
  footPad = 0,
): void => {
  const mat = mesh.material as THREE.MeshBasicMaterial;
  // `needsUpdate` looks like waste here — it makes three rebuild the program's cache key, and the
  // program cannot change, since a caster always has a map. It is not waste: three only refreshes a
  // material's uniforms when its version moves, so without it `uniforms.map` keeps pointing at the
  // texture the shadow was born with, and the hero's shadow freezes on one frame of his walk cycle
  // while he walks. (Tried it. The visual diff caught it, over the hero, to the pixel.)
  if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
  mat.opacity = alpha;
  // The test must scale with the darkness or it eats the shadow: three tests the
  // texel's alpha × opacity, so at a fixed 0.4 any shadow dimmer than 0.4 discarded
  // whole — a moonlight shadow rendered as nothing, and a fire shadow blinked out at
  // ~58% of the pool radius. Scaled, it still cuts the silhouette at texel alpha 0.4
  // exactly as before (alphaTest is a live uniform in three — no recompile).
  mat.alphaTest = Math.max(0.01, 0.4 * alpha);
  castAnchorInto(objX, objY, length, rotY, footPad);
  mesh.position.set(anchorScratch.x, FOOT_Y, anchorScratch.y);
  // Base head direction is -Z; rotate it onto the shadow's heading.
  mesh.rotation.y = rotY;
  mesh.scale.set((flipX ? -1 : 1) * width * WIDTH_FACTOR, 1, length);
  mesh.visible = true;
};
