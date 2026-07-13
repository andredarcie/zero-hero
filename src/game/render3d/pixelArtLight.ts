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
};

/** Compose every shader patch a lit pixel-art material needs (single onBeforeCompile). */
export const patchPixelMaterial = (mat: THREE.Material, opts: PatchOpts): void => {
  // Three caches compiled programs by this key; without it, materials patched
  // DIFFERENTLY would silently share whichever variant compiled first.
  mat.customProgramCacheKey = () =>
    `pixelArt|q${opts.quantize ? 1 : 0}n${opts.normalUp ? 1 : 0}f${opts.footDistance ? 1 : 0}t${opts.fill ? 1 : 0}w${opts.worldFx ?? '0'}g${opts.quantize && !opts.footDistance ? 1 : 0}`;
  mat.onBeforeCompile = (shader) => {
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
             gl_FragColor.rgb += vec3(0.45, 0.58, 0.82) * flash * 0.95;
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
    if (opts.quantize && !opts.footDistance) {
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
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          // worldFx materials already declared uFlowTime above.
          `uniform float uLightRes;
           uniform float uLightWobble;
           ${opts.worldFx ? '' : 'uniform float uFlowTime;'}
           ${FIRE_WOBBLE_GLSL}
           varying vec3 vLightGridPos;
           void main() {`,
        )
        .replace(
          '#include <lights_fragment_begin>',
          THREE.ShaderChunk.lights_fragment_begin.replace(
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
          ),
        );
    }
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
  };
};
