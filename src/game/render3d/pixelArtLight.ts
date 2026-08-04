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

/** Shared elapsed-seconds clock for animated surface FX (lava flow, water glint, sea flow). */
export const flowTimeUniform: THREE.IUniform = { value: 0 };

/**
 * A ÁGUA QUE ANDA — o efeito de superfície do mar (o `worldFx: 'seaFlow'`, ver PatchOpts).
 *
 * A água deste mundo é de dois tipos, e só um deles se movia. O rio é um PROP: cada tile tem um
 * WaterObject com um quad próprio que cicla water_0..3, então ele já ondulava. O mar é um FRAME
 * DE CHÃO (SEA_TILE_FRAME) — não existe um objeto por tile, existem milhares de quads assados numa
 * malha só — e desde que o mundo do overworld passou a escrever TODA água (rio, lago e oceano)
 * como esse frame, a água do jogo virou uma foto: um tapete azul-escuro absolutamente imóvel.
 * Animar isso com objetos era impossível (cinco mil timers), então o movimento tem de vir do
 * SHADER, que é onde uma superfície inteira se move de graça.
 *
 * Três coisas, e cada uma resolve uma leitura diferente:
 *
 *   1. A CORRENTE (`zhSeaDrift`) — a janela amostrada do frame escorrega dentro do próprio tile.
 *      A arte do mar (spritefactory/sprites/sea.mjs) é um speckle CÍCLICO no toro de 16×16: por
 *      isso o `mod` aqui costura sem emenda e o dash reaparece do outro lado como se tivesse
 *      atravessado. O deslocamento é em TEXEL INTEIRO (`floor`) e não contínuo — pixel art não
 *      escorrega meio pixel; a água anda em passos, no ritmo em que a arte foi desenhada. Os dois
 *      eixos andam a taxas primas entre si, senão a diagonal viraria uma escada visível.
 *   2. A ARREBENTAÇÃO na praia (o bloco no map_fragment) — a única pista de que aquilo é ÁGUA e
 *      não piso azul é a beira. `vShore` mede, por canto do tile, quanta terra encosta ali (o
 *      mesmo trio de vizinhos que a oclusão-ambiente do chão lê, para as duas concordarem sobre
 *      onde fica a costa), e a onda avança e recua sobre essa rampa. A borda é SERRILHADA por
 *      texel (zhSeaHash) de propósito: um degradê macio seria a única aresta lisa do jogo, e
 *      espuma real não tem borda reta. As duas cores são as da própria ramp de água — a ondulação
 *      e o glint do mar, que é a cor BASE do rio: a beira lê como água RASA, que é o que ela é.
 *   3. O BALANÇO de valor — um seno lento multiplicando o albedo, para o mar aberto (onde não há
 *      praia nenhuma) também respirar.
 *
 * O glint (as faíscas de lua) é o mesmo do rio, compartilhado abaixo: uma água que cintila
 * diferente da outra a dois tiles de distância denunciaria que são dois sistemas.
 */
const SEA_DRIFT_TEXELS_PER_S = [2.6, 1.1] as const;

/**
 * Quanta vida a agua tem, ao vivo: 1 = o padrao, 0 = a foto parada de antes, 2 = o dobro. Uma
 * escala para os tres efeitos, porque "mais/menos movimento" e uma decisao unica de olho — e ela
 * tem de poder ser tomada com o jogo rodando (window.hd3d.seaFlow), nunca recompilando.
 */
export const seaFlowUniform: THREE.IUniform = { value: 1 };

/** As faíscas frias da lua sobre a ondulação — o mesmo brilho para o rio e para o mar. */
const WATER_GLINT_GLSL = /* glsl */ `
  {
    vec2 wp = vWorldFxPos.xz;
    vec2 cell = floor(wp * 4.0);
    float rnd = fract(sin(dot(cell, vec2(41.3, 289.1))) * 43758.5453);
    float ph = fract(rnd + uFlowTime * 0.20);
    float flash = smoothstep(0.93, 1.0, sin(ph * 6.2831853) * 0.5 + 0.5);
    // 0.38, not the original 0.95: this adds BEFORE tone mapping, so at 0.95 a
    // glint pixel cleared the bloom threshold and the river read as neon sparks.
    gl_FragColor.rgb += vec3(0.45, 0.58, 0.82) * flash * 0.38;
  }
`;

/**
 * As funções do mar. Declaradas junto do TEXEL_AA_GLSL (é de lá que vem `uMapSize`) e depois do
 * bloco do worldFx (é de lá que vem `uFlowTime`) — a ordem de inserção é a ordem no arquivo.
 */
const SEA_FLOW_GLSL = /* glsl */ `
  float zhSeaHash(vec2 p) { return fract(sin(dot(p, vec2(23.7, 91.3))) * 24634.6345); }
  vec2 zhSeaDrift(vec2 uv, vec4 bounds) {
    vec2 texel = 1.0 / uMapSize;
    // bounds is the box of the frame's texel CENTRES (tilesetFrameUv), half a texel inside the
    // frame; half a texel back at each end is the frame's exact window in the atlas.
    vec2 lo = bounds.xy - 0.5 * texel;
    vec2 span = (bounds.zw + 0.5 * texel) - lo;
    vec2 rate = vec2(${SEA_DRIFT_TEXELS_PER_S[0]}, ${SEA_DRIFT_TEXELS_PER_S[1]}) * uSeaFlow;
    vec2 drift = floor(uFlowTime * rate) * texel;
    return lo + mod(uv - lo + drift, span);
  }
`;

/** A arrebentação + o balanço, no albedo (antes da luz — é a cor da água, não um brilho). */
const SEA_SHALLOW_GLSL = /* glsl */ `
  {
    float wave = 0.5 + 0.5 * sin(uFlowTime * 1.05 - (vWorldFxPos.x + vWorldFxPos.z) * 0.9);
    // The edge is broken up per TEXEL, on the world grid: ragged foam, never a smooth line.
    float edge = zhSeaHash(floor(vWorldFxPos.xz * 16.0)) * 0.16;
    // vShore runs 0 (open water) to ~0.67 along a straight coast, and to 1 at the back of a
    // cove. The thresholds are calibrated to that range: the shallow band covers the last
    // third of the tile and the crest is a one-or-two-pixel lip — both riding the wave in and out.
    float shallow = step(0.40 - 0.18 * wave + edge, vShore);
    float crest = step(0.60 - 0.10 * wave + edge, vShore);
    // The SWELL of open water: wide bands crossing the surface, and where a band passes the water
    // steps one rung up the ramp. Stepped, with the same per-texel ragged edge as the foam, for the
    // same reason: a smooth gradient is not pixel art. Without it only the coast moves — and the
    // coast is the minority of this world's water.
    float swell = 0.5 + 0.5 * sin(vWorldFxPos.x * 0.5 + vWorldFxPos.z * 0.75 + uFlowTime * 0.85);
    // Linear, because the map is already decoded (the texture is SRGBColorSpace): #265160 (the
    // ramp's ripple) and #0b8a8f (the sea's glint, which is the RIVER's base colour — shallows).
    float life = clamp(uSeaFlow, 0.0, 2.0); // hd3d.seaFlow: 0 puts the water back to being a photo
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.019, 0.082, 0.117),
      step(0.72 + edge * 0.7, swell) * 0.7 * min(life, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.019, 0.082, 0.117), shallow * 0.85 * min(life, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.003, 0.254, 0.275), crest * min(life, 1.0));
    diffuseColor.rgb *= 1.0 - (0.03 - 0.03 * wave) * life;
  }
`;

// ── THE SHADOW MASK (hd3d.shadowMask — plano.md fase 3) ──────────────────────
//
// The cast silhouettes stop being decals multiplied over the finished frame and become
// DATA: every fire silhouette is drawn once into a small top-down ortho render target
// (max-blended, so overlaps never double-darken), and the lit materials sample it to
// attenuate ONLY the point lights' direct term. Ambient and the moon pass through — a
// fire's shadow is the absence of THAT fire's light, not a hole burned in the night —
// and a billboard sampling the mask at its foot finally RECEIVES shade: the hero
// darkens when he steps into a tree's shadow.
//
// All three uniforms are shared and branch-checked per fragment (uMaskOn), so flipping
// the hd3d knob costs nothing and recompiles nothing.
export const shadowMaskUniform: THREE.IUniform = { value: null };
/** World rect the mask covers: (minX, minZ, sizeX, sizeZ) in tiles. */
export const shadowMaskRectUniform: THREE.IUniform<THREE.Vector4> = {
  value: new THREE.Vector4(0, 0, 1, 1),
};
export const shadowMaskOnUniform: THREE.IUniform = { value: 0 };

/**
 * The mask sample, shared by the lit materials and the fire-glow disc. `probe` is a
 * per-material XZ offset for BILLBOARD receivers: a caster's own silhouette starts at
 * its own feet, so sampling exactly there would make every caster stand in its own
 * shadow — the probe leans the sample ~half a tile TOWARD the light, just clear of the
 * self-cast, so a sprite receives every shadow but its own.
 */
export const SHADOW_MASK_GLSL = /* glsl */ `
  uniform sampler2D uShadowMask;
  uniform vec4 uMaskRect;
  uniform float uMaskOn;
  float zhShadowMask(vec2 worldXZ, vec2 probe) {
    if (uMaskOn < 0.5) return 0.0;
    vec2 uv = (worldXZ + probe - uMaskRect.xy) / uMaskRect.zw;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
    return texture2D(uShadowMask, uv).r;
  }
`;

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
const skipDarkPointLights = (chunk: string, maskPointLights: boolean): string => {
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

  // The shadow mask attenuates ONLY this block — the point lights (fires, torch, hero
  // glow). The directional moon and the ambient never see it: a fire's shadow is the
  // absence of that fire's light, not a hole burned through the whole night.
  const masked = maskPointLights
    ? `${getInfo}\n\t\tdirectLight.color *= zhMaskLit;`
    : getInfo;
  const guarded = block
    .replace(getInfo, `if ( pointLight.color.r + pointLight.color.g + pointLight.color.b > 0.0 ) {\n\t\t${masked}`)
    .replace(reDirect, `${reDirect}\n\t\t}`);

  return head + guarded + tail;
};

/** Probe for materials that sample the mask at their own position (the ground). */
const zeroProbeUniform: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2(0, 0) };

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
  /**
   * Where that foot IS, in the quad's own local space. An upright billboard's geometry is
   * translated so its origin sits at its feet, so the default 0 is right for it — but a
   * CENTRED quad's origin is its MIDDLE, and sampling there lights the sprite from its chest.
   * A centred quad must pass -0.5 (the bottom edge of a unit quad); the modelView transform
   * scales it by the sprite's own height, so the sample lands on the real foot at any size.
   *
   * This is not cosmetic. The held item is centred and hangs at the hero's chest, ~0.4 tiles
   * from the hero's own point light (World3D aims one at y=1.2 on his tile) instead of the
   * ~1.2 tiles his foot-anchored body samples at. With decay 1.6 that is ~6x the irradiance,
   * which pinned the carried item against uLightCap at ALL times, anywhere, day or night —
   * the one lit billboard in the game sampling light from inside a light.
   */
  footAnchorY?: number;
  /** Wire the solid-colour fill uniforms (Phaser's setTintFill). */
  fill?: { color: THREE.IUniform; mix: THREE.IUniform };
  /**
   * Animated surface effect keyed off world position + the shared flow clock:
   *   · 'lavaFlow'   — a molten heat shimmer crossing the tile (brightness wave).
   *   · 'waterGlint' — sparse cool moonlight sparkles skittering over the ripples.
   *   · 'seaFlow'    — the glint PLUS a real current: the sampled window drifts inside the
   *                    frame, and the shore breaks (see the SEA_* GLSL above). Needs a per-quad
   *                    `aShore` attribute and `texelAa` — it is the merged sea mesh's material.
   * All are anchored in WORLD space, so a river/lava field shimmers as one sheet
   * instead of repeating the same pattern per tile.
   */
  worldFx?: 'lavaFlow' | 'waterGlint' | 'seaFlow';
  /**
   * Anti-alias the art's texel grid (see TEXEL_AA_GLSL). With `bounds` the sampled frame comes from
   * a uniform — one frame per material, swapped as a whole (a billboard's walk cycle). Without it,
   * the frame comes from a per-vertex `aUvBounds` attribute, which is what the merged tile meshes
   * need: one mesh, and every quad in it windows onto a different frame of the tileset.
   */
  texelAa?: TexelAaUniforms;
  /**
   * Shadow-mask receive probe (see SHADOW_MASK_GLSL): a per-material XZ offset for the
   * sample. Billboard CASTERS pass their own uniform, steered each frame toward their
   * light so a sprite never stands in its own silhouette; omitted (the ground, props
   * without a cast) the sample lands at the fragment's own position.
   */
  maskProbe?: THREE.IUniform;
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
    `pixelArt|q${opts.quantize ? 1 : 0}n${opts.normalUp ? 1 : 0}f${opts.footDistance ? 1 : 0}a${(opts.footAnchorY ?? 0).toFixed(2)}t${opts.fill ? 1 : 0}w${opts.worldFx ?? '0'}g${opts.quantize && !opts.footDistance ? 1 : 0}x${opts.texelAa ? (opts.texelAa.bounds ? 'u' : 'a') : '0'}m${opts.quantize ? (opts.maskProbe ? 'p' : 'g') : '0'}`;

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
        // Shared by the river's quads and the merged sea: two waters that sparkled
        // to different rhythms two tiles apart would announce that they are two systems.
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `#include <opaque_fragment>\n${WATER_GLINT_GLSL}`,
        );
      }
      if (opts.worldFx === 'seaFlow') {
        // The shore ramp travels per vertex: one mesh holds the whole ocean, and every quad in
        // it has its own coastline (see buildFlatTileGeometry's `shore`).
        shader.uniforms.uSeaFlow = seaFlowUniform;
        shader.vertexShader = shader.vertexShader
          .replace('void main() {', 'attribute float aShore;\nvarying float vShore;\nvoid main() {')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n vShore = aShore;');
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', 'uniform float uSeaFlow;\nvarying float vShore;\nvoid main() {')
          // Straight after the map fetch, because the breaking wave is the water's own COLOUR
          // (shallow water), not a highlight laid over it: the light must fall on it like it
          // falls on everything else. The token itself is left standing for the texelAa patch.
          .replace('#include <map_fragment>', `#include <map_fragment>\n${SEA_SHALLOW_GLSL}`);
      }
    }

    if (opts.footDistance) {
      // Baked as a literal, so it is part of the cache key above — two anchors are two programs.
      const anchorY = (opts.footAnchorY ?? 0).toFixed(2);
      shader.vertexShader = shader.vertexShader.replace(
        'vViewPosition = - mvPosition.xyz;',
        `vViewPosition = - (modelViewMatrix * vec4(0.0, ${anchorY}, 0.0, 1.0)).xyz;`,
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

    // ── The shadow mask's receive path (see SHADOW_MASK_GLSL) ────────────────
    // Every LIT material gets it: a world-position varying and one branch-guarded sample
    // that attenuates the point lights' direct term. Compiled in unconditionally so the
    // hd3d.shadowMask knob is a uniform flip — never a recompile.
    if (opts.quantize) {
      shader.uniforms.uShadowMask = shadowMaskUniform;
      shader.uniforms.uMaskRect = shadowMaskRectUniform;
      shader.uniforms.uMaskOn = shadowMaskOnUniform;
      shader.uniforms.uMaskProbe = opts.maskProbe ?? zeroProbeUniform;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vZhMaskPos;\nvoid main() {')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n vZhMaskPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `${SHADOW_MASK_GLSL}
         uniform vec2 uMaskProbe;
         varying vec3 vZhMaskPos;
         void main() {`,
      );
    }

    // The light loop itself. Every lit material skips its dark lights; only the world materials
    // (never the foot-lit billboards) additionally snap the lookup to the light grid.
    let lightsChunk = THREE.ShaderChunk.lights_fragment_begin;
    if (opts.quantize) {
      lightsChunk = lightsChunk.replace(
        'vec3 geometryPosition = - vViewPosition;',
        `vec3 geometryPosition = - vViewPosition;
         float zhMaskLit = 1.0 - zhShadowMask(vZhMaskPos.xz, uMaskProbe);`,
      );
    }
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
    lightsChunk = skipDarkPointLights(lightsChunk, Boolean(opts.quantize));
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
           // The cap has to cover the TOTAL, not just the direct term. Ambient is added after
           // this by RE_IndirectDiffuse and it is not small — at ambient 8.5 the Lambert BRDF
           // alone lands indirectDiffuse near 1.2x the albedo — so capping only the direct half
           // let a lit surface reach ~2.8x its own art colour and CLIP: the steel axe's head
           // came out 4000 pixels of pure #ffffff with no interior detail left, and every
           // bone-white sprite blew out the same way. Budgeting the direct term against what
           // ambient already spent enforces the ceiling this comment always claimed, and leaves
           // ambient-only surfaces (1.2 < uLightCap) untouched, so the night keeps its mood.
           reflectedLight.directDiffuse = min(
             reflectedLight.directDiffuse,
             max(vec3(0.0), diffuseColor.rgb * uLightCap - reflectedLight.indirectDiffuse)
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
        // The sea's current is a UV drift, so it has to happen INSIDE the fetch — and it has to
        // WRAP within the frame's own window, which is why it cannot be a uniform added in the
        // vertex shader: `bounds` clamps, and a clamped drift smears the frame's edge texel
        // instead of bringing the pattern round the other side.
        const uvExpr = opts.worldFx === 'seaFlow' ? `zhSeaDrift( vMapUv, ${bounds} )` : 'vMapUv';
        shader.fragmentShader = shader.fragmentShader
          .replace(
            'void main() {',
            `${perQuad ? 'varying vec4 vUvBounds;' : 'uniform vec4 uUvBounds;'}
             ${TEXEL_AA_GLSL}
             ${opts.worldFx === 'seaFlow' ? SEA_FLOW_GLSL : ''}
             void main() {`,
          )
          .replace(
            '#include <map_fragment>',
            chunk.replace(fetch, `texture2D( map, zhTexelUv( ${uvExpr}, ${bounds} ) )`),
          );
      }
    }
  };
};
