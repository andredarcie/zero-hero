import * as THREE from 'three';

// ── The world's light treatment ───────────────────────────────────────────────
//
// Real Three.js lights over the NEAREST-filtered pixel art. Three custom touches:
//
// · The direct light is CAPPED at ~the art's own colours (diffuse × 1.25), so
//   light REVEALS the artwork — like the 2D game's darkness-erase did — and a
//   hot flame core can never wash sprites out to white.
// · Retro banding: with lightSteps ≥ 1 the direct light quantizes into that many
//   flat brightness tiers (a stepped SNES "lantern"); 0 = smooth. World3D's params
//   default it ON — the firelight must read as low-res pixel art, not an HD ramp.
// · The light itself is LOW RES: it is evaluated on a fixed grid of world-space
//   "light texels" (lightRes per tile), not per screen pixel. See below.

/** Shared band count (0 = smooth), live-tunable via window.hd3d.lightSteps. */
export const lightStepsUniform: THREE.IUniform = { value: 0 };

/**
 * LIGHT RESOLUTION — how many light texels fit across one tile (0 = off, smooth).
 *
 * A modern renderer evaluates light per screen pixel, so a fire's falloff is a
 * silky gradient that slides around under the chunky art: an HD light on a 16px
 * sprite. The 2D game did the opposite — it drew its light into a low-res
 * overlay, so the glow came in blocks the same size as the pixels it lit.
 *
 * We reproduce that: before the lighting is computed, the fragment's WORLD
 * position is snapped to this grid, so every fragment inside one light texel
 * gets the exact same distance to the flame — square blocks of light, locked to
 * the world (they do not swim when the camera moves) and sized in step with the
 * art. Live-tunable via window.hd3d.lightRes.
 *
 * KEEP IT AT THE ART'S OWN RESOLUTION (TILESET_FRAME_SIZE, 16 px per tile): one
 * light texel must be one art pixel. Anything coarser lays a second, chunkier
 * grid OVER the pixels and reads as a checkerboard, not as pixel art.
 *
 * NOTE: on the lit world materials below this snap is currently INVISIBLE — a
 * fire's direct light sits far above the cap across its whole clearing, so the
 * `min()` flattens it to the same value either way. Where it does the work is the
 * fire's warm POOL (the additive disc in World3D), which snaps to this same grid.
 */
export const lightResUniform: THREE.IUniform = { value: 16 };

/** Shared elapsed-seconds clock for animated surface FX (lava flow, water glint). */
export const flowTimeUniform: THREE.IUniform = { value: 0 };

/**
 * TEXEL ANTI-ALIASING — 1 = the art's pixel grid is anti-aliased, 0 = plain NEAREST.
 * Live-tunable via window.hd3d.texelAa, which is the A/B for the whole effect below.
 */
export const texelAaUniform: THREE.IUniform = { value: 1 };

/**
 * THE JAGGIES, AND WHY THEY ARE NOT THE ART'S FAULT.
 *
 * A tile is 16 art pixels wide and it lies on a plane in perspective, so one art pixel almost never
 * lands on a whole number of screen pixels: it covers 2.6 of them, or 1.3, and a different amount
 * again one row further back. NEAREST has only one answer to that question — it picks whichever
 * texel the pixel's exact centre fell in — so a texel comes out 3 screen pixels wide here and 2
 * there, and a straight run of them breaks into a ragged staircase that crawls as the camera moves.
 * That is the serrilhado, and no amount of care in the artwork can fix it: it is a sampling
 * artefact, produced between the art and the screen.
 *
 * The honest fix is to ask what fraction of the pixel each texel actually covers, and MSAA/SSAA
 * answer that by rendering more samples — more fragments, which is exactly the bill we refuse to
 * pay. But for a flat grid of texels the coverage is analytic: `fwidth` says how many texels one
 * screen pixel spans, so we know how far the pixel reaches across the seam without sampling
 * anything twice.
 *
 * So keep the sample at the texel's CENTRE — a flat, crisp, unfiltered texel, exactly the pixel art
 * NEAREST would have drawn — until the pixel actually straddles a seam, and only there slide the
 * sample across it, letting the GPU's own bilinear unit blend the two texels in proportion to the
 * pixel's coverage. The texel interiors stay hard (this is NOT the bilinear mush that would soften
 * the art); only the boundary between them gets anti-aliased.
 *
 * It costs a handful of ALU per fragment and — the point of the whole exercise — the SAME single
 * texture fetch as before: no extra taps, no extra pass, no extra render target. Requires the
 * texture to be LinearFilter (see textures3d): with NEAREST the GPU rounds the slid UV back to the
 * same texel and the whole thing silently degrades to what it does today.
 *
 * `bounds` is the frame's texel-centre box inside the sheet. The tileset is an ATLAS, and a bilinear
 * fetch reaches half a texel past the UV it is given — right into the neighbouring tile's art. So
 * the slid sample is clamped to the frame's own texels, which is per-tile CLAMP_TO_EDGE and the
 * reason the quad UVs no longer need the inset they used to carry.
 */
export const TEXEL_AA_GLSL = /* glsl */ `
  uniform vec2 uMapSize;
  uniform float uTexelAa;
  vec2 zhTexelUv(vec2 uv, vec4 bounds) {
    vec2 t = uv * uMapSize;                   // UV in texels
    vec2 centre = floor(t) + 0.5;             // this texel's centre: what NEAREST would fetch
    vec2 seam = floor(t + 0.5);               // the texel boundary the fragment sits nearest to
    vec2 px = max(fwidth(t), vec2(1e-5));     // texels covered by one screen pixel
    // Ride the seam only while the pixel straddles it; elsewhere this clamps to the texel centre.
    vec2 aa = seam + clamp((t - seam) / px, -0.5, 0.5);
    return clamp(mix(centre, aa, uTexelAa) / uMapSize, bounds.xy, bounds.zw);
  }
`;

/** Per-material texel-AA state: the sheet's size, and the frame of it a material samples. */
export type TexelAaUniforms = { size: THREE.IUniform; bounds?: THREE.IUniform };

/**
 * Aim the uniforms at whatever frame `tex` currently windows onto (offset/repeat — the transform
 * getTexture3D bakes into its clones), inset by half a texel so a bilinear fetch cannot reach the
 * next frame in the sheet. Call it again whenever the material's map is swapped (a walk cycle).
 */
export const syncTexelAaUniforms = (u: TexelAaUniforms, tex: THREE.Texture): void => {
  const img = tex.image as { width: number; height: number } | undefined;
  if (!img?.width || !img.height) return;
  (u.size.value as THREE.Vector2).set(img.width, img.height);
  if (!u.bounds) return;
  const hx = 0.5 / img.width;
  const hy = 0.5 / img.height;
  (u.bounds.value as THREE.Vector4).set(
    tex.offset.x + hx,
    tex.offset.y + hy,
    tex.offset.x + tex.repeat.x - hx,
    tex.offset.y + tex.repeat.y - hy,
  );
};

/**
 * IMPERFECT FIRELIGHT — how far (in tiles) the light's contours get dented.
 *
 * Real flamelight is never a compass circle: the flame's shape, smoke and the
 * ground's unevenness lobe it. Quantised into flat tiers the perfection got
 * WORSE — hard rings read as drawn with a compass (user feedback). So every
 * fragment samples its firelight from a position nudged by a slow-crawling
 * world-anchored noise field (fireWobble below): the tiers stay flat pixel-art
 * bands, but their edges swell and dent organically. The same field warps the
 * fire's glow disc, so all the contours dent together. 0 = perfect circles.
 * Live-tunable via window.hd3d.lightWobble.
 */
export const lightWobbleUniform: THREE.IUniform = { value: 1.2 };

/**
 * The wobble field, shared by the world materials and the fire-glow disc: cheap
 * value noise over WORLD position (locked to the ground — it never swims under a
 * camera pan), lobes ~1.5 tiles wide, drifting slowly so the imperfection lives.
 * Returns ±0.5; callers scale by uLightWobble.
 */
export const FIRE_WOBBLE_GLSL = /* glsl */ `
  float zhHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float zhNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(zhHash(i), zhHash(i + vec2(1.0, 0.0)), u.x),
      mix(zhHash(i + vec2(0.0, 1.0)), zhHash(i + vec2(1.0, 1.0)), u.x),
      u.y);
  }
  float fireWobble(vec2 worldPos, float t) {
    return zhNoise(worldPos * 0.7 + vec2(t * 0.11, -t * 0.08)) - 0.5;
  }
`;

/**
 * How far direct light may push a surface past its own art colour before it caps.
 * 1.25 = the art barely brightens (light only "reveals" it); higher lets a fire
 * build a bright, saturated warm POOL on the ground (the 2D game's cozy glow)
 * without going all the way to white. Live-tunable via window.hd3d.lightCap.
 */
export const lightCapUniform: THREE.IUniform = { value: 1.25 };

/**
 * Skip the point lights that are switched OFF.
 *
 * The scene's point-light COUNT is frozen on purpose (World3D: FIRE_LIGHT_SLOTS) — three.js bakes
 * it into every compiled shader's cache key, so moving it recompiles every lit material in the
 * world. The price of that bargain is a fixed loop: eight fire slots are evaluated by EVERY lit
 * fragment on screen whether or not a fire is currently borrowing them, and an idle slot still
 * pays for its vector, its length(), its attenuation pow() and its BRDF — to add exactly nothing.
 * Most of the time only one or two fires are near enough to hold a light, so most of that loop is
 * arithmetic performed on darkness.
 *
 * three.js folds intensity into the light's colour uniform, so an idle slot is literally black.
 * Skipping a black light is EXACT rather than an approximation: `getPointLightInfo` would hand
 * back `color * attenuation` = 0, and RE_Direct would add `dotNL * 0` = 0. And the branch tests a
 * uniform, so every fragment in a warp takes it together — there is no divergence to pay for.
 *
 * Surgery on three's own chunk, so it is scoped to the point-light block by index: the same
 * `RE_Direct(...)` line appears in the spot- and directional-light loops, and a blind replace
 * would wrap those too.
 */
const skipDarkPointLights = (chunk: string): string => {
  const blockStart = chunk.indexOf('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )');
  if (blockStart < 0) return chunk;
  const blockEnd = chunk.indexOf('#pragma unroll_loop_end', blockStart);
  if (blockEnd < 0) return chunk;

  const head = chunk.slice(0, blockStart);
  const block = chunk.slice(blockStart, blockEnd);
  const tail = chunk.slice(blockEnd);

  const getInfo = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
  const reDirect = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  // A three.js upgrade that renames either line leaves the chunk untouched: slower, never wrong.
  if (!block.includes(getInfo) || !block.includes(reDirect)) return chunk;

  const guarded = block
    .replace(getInfo, `if ( pointLight.color.r + pointLight.color.g + pointLight.color.b > 0.0 ) {\n\t\t${getInfo}`)
    .replace(reDirect, `${reDirect}\n\t\t}`);

  return head + guarded + tail;
};

type PatchOpts = {
  /** Quantize the direct light into lightStepsUniform bands. */
  quantize?: boolean;
  /**
   * Upright-cutout treatment: shade as if the surface faced UP (lit like the
   * ground), so a sprite never goes black because a light sits behind its plane.
   */
  normalUp?: boolean;
  /**
   * Billboard-only: measure light distance from the mesh origin (the FOOT), so
   * the sprite is lit uniformly by the ground it stands on — its top must not
   * read brighter/darker than its base. Never use on merged geometry (its
   * origin is the world origin, not a foot).
   */
  footDistance?: boolean;
  /** Wire the solid-colour fill uniforms (Phaser's setTintFill). */
  fill?: { color: THREE.IUniform; mix: THREE.IUniform };
  /**
   * Animated surface effect keyed off world position + the shared flow clock:
   *   · 'lavaFlow'   — a molten heat shimmer crossing the tile (brightness wave).
   *   · 'waterGlint' — sparse cool moonlight sparkles skittering over the ripples.
   * Both are anchored in WORLD space, so a river/lava field shimmers as one sheet
   * instead of repeating the same pattern per tile.
   */
  worldFx?: 'lavaFlow' | 'waterGlint';
  /**
   * Anti-alias the art's texel grid (see TEXEL_AA_GLSL). With `bounds` the sampled frame comes from
   * a uniform — one frame per material, swapped as a whole (a billboard's walk cycle). Without it,
   * the frame comes from a per-vertex `aUvBounds` attribute, which is what the merged tile meshes
   * need: one mesh, and every quad in it windows onto a different frame of the tileset.
   */
  texelAa?: TexelAaUniforms;
};

/**
 * Every shader compile, with the stack that CREATED the material (dev only).
 *
 * A program is compiled and linked by the driver on the frame its material is first drawn, and it
 * costs 50–300ms — a visible freeze. The profiler can already see that a compile happened, but not
 * whose: `onBeforeCompile` runs deep inside the renderer, so its own stack names three.js and
 * nothing else. The stack that matters is the one from when the material was BORN, so take it
 * there and carry it to the compile. Read it with `__shaderCompiles` after a run.
 */
const compileLog: Array<{ key: string; atMs: number; createdBy: string }> = [];
if (import.meta.env.DEV) {
  (window as unknown as { __shaderCompiles: typeof compileLog }).__shaderCompiles = compileLog;
}

/** Compose every shader patch a lit pixel-art material needs (single onBeforeCompile). */
export const patchPixelMaterial = (mat: THREE.Material, opts: PatchOpts): void => {
  // Three caches compiled programs by this key; without it, materials patched
  // DIFFERENTLY would silently share whichever variant compiled first.
  mat.customProgramCacheKey = () =>
    `pixelArt|q${opts.quantize ? 1 : 0}n${opts.normalUp ? 1 : 0}f${opts.footDistance ? 1 : 0}t${opts.fill ? 1 : 0}w${opts.worldFx ?? '0'}g${opts.quantize && !opts.footDistance ? 1 : 0}x${opts.texelAa ? (opts.texelAa.bounds ? 'u' : 'a') : '0'}`;

  const bornAt = import.meta.env.DEV ? new Error().stack ?? '' : '';

  mat.onBeforeCompile = (shader) => {
    if (import.meta.env.DEV) {
      compileLog.push({
        key: mat.customProgramCacheKey?.() ?? '?',
        atMs: Math.round(performance.now()),
        createdBy: bornAt.split('\n').slice(2, 6).map((l) => l.trim()).join(' ← '),
      });
    }
    if (opts.worldFx) {
      // A world-space position varying so the FX tiles seamlessly across a field.
      shader.uniforms.uFlowTime = flowTimeUniform;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vWorldFxPos;\nvoid main() {')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n vWorldFxPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        'uniform float uFlowTime;\nvarying vec3 vWorldFxPos;\nvoid main() {',
      );
      if (opts.worldFx === 'lavaFlow') {
        // Heat shimmer: a slow diagonal brightness wave over the molten crust,
        // multiplying the emissive so bright ridges push harder into the bloom.
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           float lavaWave = 0.78 + 0.22 * sin(vWorldFxPos.x * 2.1 + vWorldFxPos.z * 1.6 + uFlowTime * 2.0)
                                  + 0.10 * sin(vWorldFxPos.x * 5.3 - vWorldFxPos.z * 4.1 - uFlowTime * 3.3);
           diffuseColor.rgb *= clamp(lavaWave, 0.55, 1.35);`,
        );
      } else {
        // Moonlight glint: sparse cells flash a cool highlight in turn — added to
        // the FINAL colour (post-lighting) so the ripples catch light in the dark.
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>
           {
             vec2 wp = vWorldFxPos.xz;
             vec2 cell = floor(wp * 4.0);
             float rnd = fract(sin(dot(cell, vec2(41.3, 289.1))) * 43758.5453);
             float ph = fract(rnd + uFlowTime * 0.20);
             float flash = smoothstep(0.93, 1.0, sin(ph * 6.2831853) * 0.5 + 0.5);
             // 0.38, not the original 0.95: this adds BEFORE tone mapping, so at 0.95 a
             // glint pixel cleared the bloom threshold and the river read as neon sparks.
             gl_FragColor.rgb += vec3(0.45, 0.58, 0.82) * flash * 0.38;
           }`,
        );
      }
    }

    if (opts.footDistance) {
      shader.vertexShader = shader.vertexShader.replace(
        'vViewPosition = - mvPosition.xyz;',
        'vViewPosition = - (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;',
      );
    }

    // ── Low-res light (see lightResUniform) ──────────────────────────────────
    // Three computes the lights from `geometryPosition`, the fragment's position in view
    // space. We hand it a SNAPPED one instead: the fragment's world position rounded to the
    // light grid, then taken back into view space. Every fragment inside a light texel then
    // sits at the same distance from the flame, so the pool of firelight comes out in square
    // blocks that are pinned to the world — the 2D game's downscaled light overlay, rebuilt.
    // (Only lit world materials take this; billboards with footDistance light from their foot
    // and must not be re-snapped per fragment.)
    const wantsSnap = Boolean(opts.quantize) && !opts.footDistance;
    if (wantsSnap) {
      shader.uniforms.uLightRes = lightResUniform;
      shader.uniforms.uLightWobble = lightWobbleUniform;
      shader.uniforms.uFlowTime = flowTimeUniform;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vLightGridPos;\nvoid main() {')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vLightGridPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        // worldFx materials already declared uFlowTime above.
        `uniform float uLightRes;
         uniform float uLightWobble;
         ${opts.worldFx ? '' : 'uniform float uFlowTime;'}
         ${FIRE_WOBBLE_GLSL}
         varying vec3 vLightGridPos;
         void main() {`,
      );
    }

    // The light loop itself. Every lit material skips its dark lights; only the world materials
    // (never the foot-lit billboards) additionally snap the lookup to the light grid.
    let lightsChunk = THREE.ShaderChunk.lights_fragment_begin;
    if (wantsSnap) {
      lightsChunk = lightsChunk.replace(
        'vec3 geometryPosition = - vViewPosition;',
        `vec3 geometryPosition = - vViewPosition;
         if (uLightRes > 0.0) {
           vec3 lightTexel = (floor(vLightGridPos * uLightRes) + 0.5) / uLightRes;
           // Imperfect firelight: the texel pretends to sit a little off its true
           // spot, so its distance to every POINT light (fire/torch) warps and the
           // banded pool lobes organically. The directional moon has no distance —
           // the flat night fill stays untouched.
           lightTexel.xz += vec2(
             fireWobble(lightTexel.xz, uFlowTime),
             fireWobble(lightTexel.zx + 31.7, uFlowTime)
           ) * uLightWobble;
           geometryPosition = (viewMatrix * vec4(lightTexel, 1.0)).xyz;
         }`,
      );
    }
    lightsChunk = skipDarkPointLights(lightsChunk);
    // A MeshBasicMaterial has no light loop at all, so this is a no-op there.
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', lightsChunk);
    if (opts.normalUp) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
         normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`,
      );
    }

    if (opts.fill) {
      shader.uniforms.uFillColor = opts.fill.color;
      shader.uniforms.uFillMix = opts.fill.mix;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          'uniform vec3 uFillColor;\nuniform float uFillMix;\nvoid main() {',
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           diffuseColor.rgb = mix(diffuseColor.rgb, uFillColor, uFillMix);`,
        );
    }

    if (opts.quantize) {
      shader.uniforms.uLightSteps = lightStepsUniform;
      shader.uniforms.uLightCap = lightCapUniform;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          'uniform float uLightSteps;\nuniform float uLightCap;\nvoid main() {',
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
           // Optional retro banding (uLightSteps ≥ 1), then CAP at a multiple of the
           // art's own colours: light REVEALS the pixel art (like the 2D darkness-erase
           // did) and a fire builds a warm POOL, but it never runs away to pure white.
           if (uLightSteps >= 1.0) {
             reflectedLight.directDiffuse =
               floor(reflectedLight.directDiffuse * uLightSteps) / uLightSteps;
           }
           reflectedLight.directDiffuse = min(
             reflectedLight.directDiffuse,
             diffuseColor.rgb * uLightCap
           );`,
        );
    }

    // ── Texel-grid AA (see TEXEL_AA_GLSL) ────────────────────────────────────
    // Runs LAST, and it must: every patch above that touches the map APPENDS itself after the
    // `#include <map_fragment>` token and leaves the token standing, so this — the one that
    // finally expands the token into real code — has to be the one holding the pen at the end.
    if (opts.texelAa) {
      const chunk = THREE.ShaderChunk.map_fragment;
      const fetch = 'texture2D( map, vMapUv )';
      // A three.js upgrade that renames the fetch leaves the chunk untouched: the art stays
      // NEAREST-crisp exactly as it is today, never wrong. (Same bargain as skipDarkPointLights.)
      if (chunk.includes(fetch)) {
        // The frame is one uniform per material, or — for the merged tile meshes, where every quad
        // in the one mesh windows onto a different frame — a per-vertex attribute.
        const perQuad = !opts.texelAa.bounds;
        const bounds = perQuad ? 'vUvBounds' : 'uUvBounds';
        shader.uniforms.uMapSize = opts.texelAa.size;
        shader.uniforms.uTexelAa = texelAaUniform;
        if (perQuad) {
          shader.vertexShader = shader.vertexShader
            .replace(
              'void main() {',
              'attribute vec4 aUvBounds;\nvarying vec4 vUvBounds;\nvoid main() {',
            )
            .replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\n vUvBounds = aUvBounds;',
            );
        } else {
          shader.uniforms.uUvBounds = opts.texelAa.bounds as THREE.IUniform;
        }
        shader.fragmentShader = shader.fragmentShader
          .replace(
            'void main() {',
            `${perQuad ? 'varying vec4 vUvBounds;' : 'uniform vec4 uUvBounds;'}
             ${TEXEL_AA_GLSL}
             void main() {`,
          )
          .replace(
            '#include <map_fragment>',
            chunk.replace(fetch, `texture2D( map, zhTexelUv( vMapUv, ${bounds} ) )`),
          );
      }
    }
  };
};
