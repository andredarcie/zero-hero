// As poças de luz no chão e a névoa da borda do mundo: o material da poça quente de cada fogo (em bandas, na grade de
// pixels da arte), o lugar dela a cada quadro, e a cortina de névoa que esconde o vazio além do mapa.

import * as THREE from 'three';
import {
  FIRE_WOBBLE_GLSL, flowTimeUniform, lightStepsUniform, lightWobbleUniform, SHADOW_MASK_GLSL, shadowMaskOnUniform,
  shadowMaskRectUniform, shadowMaskUniform,
} from './pixelArtLight';

// The fire pool's AUTHORED colour ramp (the A Short Hike lesson: each light band is a
// colour a painter chose, not one colour darkened by math). Stops sampled from the
// flame sprite's own palette (#F1CC36 yellow core / #C83E3E red body): a pale-gold
// heart, a golden-orange mid band, an ember-red rim. Shared by every fire glow and the
// carried torch; live-tunable via window.hd3d.fireRampCore/Mid/Rim.
export const fireRampCoreUniform: THREE.IUniform<THREE.Color> = { value: new THREE.Color('#ffe6a2') };
export const fireRampMidUniform: THREE.IUniform<THREE.Color> = { value: new THREE.Color('#f9a04e') };
export const fireRampRimUniform: THREE.IUniform<THREE.Color> = { value: new THREE.Color('#a34e2e') };
// The pool's own paint resolution, in texels per tile — COARSER than the art (8 = one
// light block per 2×2 art pixels, cleanly aligned to the art grid). This is A Short
// Hike's low-res trick applied to the light alone: the smooth authored gradient
// crunches into subtle chunky blocks while the frame and the sprites stay sharp.
// 2×2 approved live by the user; 4×4 was tried and read too coarse.
export const fireGlowResUniform: THREE.IUniform = { value: 8 };
// The additive campfire glow laid over the ground. Evaluated on the art's own pixel
// grid and banded into flat tiers (lightSteps), so the warm pool reads as a hand-shaded
// pixel-art circle of light — chunky stepped rings — instead of a smooth HD gradient.
/** The uniforms a fire's warm pool needs to place itself, kept on the material. */
type GlowUniforms = { center: THREE.IUniform<THREE.Vector2>; radius: THREE.IUniform<number> };

/**
 * The warm POOL a fire pours on the ground — as pixel art.
 *
 * It used to be a smooth 34×34 canvas gradient stretched across ~15 TILES with a NEAREST
 * filter: every texel of it landed as a ~half-tile square, so the pool came out as a coarse
 * checkerboard whose blocks had nothing to do with the art's own pixels ("quadriculada, não
 * pixel art"). Here the falloff is evaluated per fragment instead and snapped to the ART's
 * pixel grid (lightRes texels per tile = the tileset's 16), so the light steps in exactly the
 * pixels it lights. The snap is in WORLD space, so the blocks stay pinned to the ground and
 * never swim as the camera pans or the flame jitters — only their brightness dances.
 */
export const makeFireGlowMaterial = (opts: {
  /** A rampa de bandas desta poça. Omitida = a do FOGO (o padrão de sempre). */
  ramp?: { core: THREE.IUniform<THREE.Color>; mid: THREE.IUniform<THREE.Color>; rim: THREE.IUniform<THREE.Color> };
  /** O ruído que amassa os anéis. Omitido = o do fogo; a vista do herói passa o zero. */
  wobble?: THREE.IUniform;
} = {}): THREE.MeshBasicMaterial => {
  // Colour comes from the authored band ramp in the shader (fireRamp* uniforms), so the
  // material's own colour stays white.
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    opacity: 0,
  });
  const glow: GlowUniforms = {
    center: { value: new THREE.Vector2() },
    radius: { value: 1 },
  };
  mat.userData.glow = glow;
  mat.customProgramCacheKey = () => 'fireGlow';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowCenter = glow.center;
    shader.uniforms.uGlowRadius = glow.radius;
    shader.uniforms.uLightRes = fireGlowResUniform; // the pool paints COARSER than the art
    shader.uniforms.uLightSteps = lightStepsUniform;
    shader.uniforms.uLightWobble = opts.wobble ?? lightWobbleUniform;
    shader.uniforms.uFlowTime = flowTimeUniform;
    shader.uniforms.uRampCore = opts.ramp?.core ?? fireRampCoreUniform;
    shader.uniforms.uRampMid = opts.ramp?.mid ?? fireRampMidUniform;
    shader.uniforms.uRampRim = opts.ramp?.rim ?? fireRampRimUniform;
    // The mask shades the glow POOL too (hd3d.shadowMask): with the decal silhouettes
    // gone from the scene, the additive haze must dim itself where a cast falls — same
    // data, same place, instead of a black quad drawn over it.
    shader.uniforms.uShadowMask = shadowMaskUniform;
    shader.uniforms.uMaskRect = shadowMaskRectUniform;
    shader.uniforms.uMaskOn = shadowMaskOnUniform;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vGlowPos;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vGlowPos = (modelMatrix * vec4(transformed, 1.0)).xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform vec2 uGlowCenter;
         uniform float uGlowRadius;
         uniform float uLightRes;
         uniform float uLightSteps;
         uniform float uLightWobble;
         uniform float uFlowTime;
         uniform vec3 uRampCore;
         uniform vec3 uRampMid;
         uniform vec3 uRampRim;
         ${FIRE_WOBBLE_GLSL}
         ${SHADOW_MASK_GLSL}
         varying vec2 vGlowPos;
         // A hot core that drops away fast, then a long soft skirt out to the rim. TIGHTER
         // since 2026-11-11: the old plateau (0.95 → 0.60 over the first fifth, still 0.25 at
         // half the radius) added a near-white disc on top of the real firelight, and the grass
         // around a campfire washed to pale yellow — a spotlight, not a fire. The real light
         // already lights the ground; the pool is the haze over it.
         float glowCurve(float r) {
           if (r >= 1.0) return 0.0;
           if (r < 0.12) return mix(0.80, 0.45, r / 0.12);
           if (r < 0.38) return mix(0.45, 0.15, (r - 0.12) / 0.26);
           if (r < 0.70) return mix(0.15, 0.035, (r - 0.38) / 0.32);
           return mix(0.035, 0.0, (r - 0.70) / 0.30);
         }
         void main() {`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         vec2 glowTexel = floor(vGlowPos * uLightRes);
         vec2 glowPos = uLightRes > 0.0
           ? (glowTexel + 0.5) / uLightRes
           : vGlowPos;
         // Imperfect firelight: dent the rings with the shared wobble field (the same
         // one warping the direct light, so all the contours lobe together). The dents
         // grow from the core to the rim — up close a flame's pool is roundish; its far
         // skirt is what breaks up.
         float rBase = distance(glowPos, uGlowCenter) / max(0.0001, uGlowRadius);
         glowPos += vec2(
           fireWobble(glowPos, uFlowTime),
           fireWobble(glowPos.yx + 31.7, uFlowTime)
         ) * (uLightWobble * (0.35 + 0.65 * min(rBase, 1.0)));
         float glowA = glowCurve(distance(glowPos, uGlowCenter) / max(0.0001, uGlowRadius));
         // Retro banding: the pool falls off in FLAT TIERS (the stepped pixel-art lantern)
         // rather than a silky HD ramp. Quantised straight — no dither: the tier edges are
         // already stair-stepped by the art-pixel snap above, which is exactly how a pixel
         // artist draws a circle of light (a Bayer dither here read as dirty stipple).
         if (uLightSteps >= 1.0) {
           glowA = floor(glowA * uLightSteps + 0.5) / uLightSteps;
         }
         // The A Short Hike lighting ramp: each band wears its own AUTHORED colour —
         // ember-red rim, golden-orange mid, pale-gold heart — the way a pixel artist
         // paints a pool of firelight, instead of one colour fading by alpha alone.
         // With uLightSteps bands the stops land exactly on rim/mid/core.
         float rampT = uLightSteps >= 2.0
           ? clamp((glowA * uLightSteps - 1.0) / (uLightSteps - 1.0), 0.0, 1.0)
           : glowA;
         diffuseColor.rgb *= rampT < 0.5
           ? mix(uRampRim, uRampMid, rampT * 2.0)
           : mix(uRampMid, uRampCore, rampT * 2.0 - 1.0);
         diffuseColor.a *= glowA * (1.0 - zhShadowMask(vGlowPos, vec2(0.0)));`,
      );
  };
  return mat;
};

/**
 * A NÉVOA NEGRA que cobre a floresta de fora do mapa.
 *
 * O fora do mundo deixou de ser mar e virou floresta (ver `WorldData.buildVoidChunk`), e uma
 * floresta iluminada como qualquer outra não diz "aqui acaba o mundo" — diz "tem mais mapa ali".
 * Quem diz é a névoa: ela nasce em ZERO na fronteira autorada e fecha em preto alguns tiles
 * adiante, então a mata desaparece dentro dela em vez de terminar numa régua.
 *
 * Três decisões que a fazem ler como névoa e não como uma tampa preta:
 *
 *   · **A alfa vem da distância ao RETÂNGULO do mundo**, medida no fragmento (`uMistRect`), e não
 *     de uma máscara por vértice. É a fronteira do mundo, que é uma caixa — e uma conta de caixa
 *     em quatro linhas dá a rampa exata em qualquer formato de mapa, sem re-assar nada.
 *   · **A borda é ROÍDA por ruído** no mesmo campo de valor que o fogo usa (`fireWobble`), com o
 *     tempo escorrendo devagar. Sem isso a rampa é um degradê de photoshop, e degradê nenhum é
 *     névoa.
 *   · **Ela é quantizada no grid da ARTE** (`uLightRes`), como todo desenho de luz deste jogo. Uma
 *     rampa lisa num mundo de pixel art é o único objeto da tela com resolução infinita.
 *
 * Preto com mistura normal, e não `AdditiveBlending`: aditivo só clareia — o preto aditivo é
 * literalmente nada. Aqui a névoa TAPA, então ela é alfa por cima.
 */
export type MistUniforms = { rect: THREE.IUniform<THREE.Vector4>; depth: THREE.IUniform<number> };

export const makeVoidMistMaterial = (): THREE.MeshBasicMaterial => {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    depthWrite: false,
    fog: false, // ela JÁ é a distância; um fog por cima a lavaria na cor do céu
    opacity: 1,
  });
  const mist: MistUniforms = {
    rect: { value: new THREE.Vector4(0, 0, 0, 0) },
    depth: { value: 6 },
  };
  mat.userData.mist = mist;
  mat.customProgramCacheKey = () => 'voidMist';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMistRect = mist.rect;
    shader.uniforms.uMistDepth = mist.depth;
    shader.uniforms.uLightRes = fireGlowResUniform;
    shader.uniforms.uFlowTime = flowTimeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vMistPos;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vMistPos = (modelMatrix * vec4(transformed, 1.0)).xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform vec4 uMistRect;
         uniform float uMistDepth;
         uniform float uLightRes;
         uniform float uFlowTime;
         ${FIRE_WOBBLE_GLSL}
         varying vec2 vMistPos;
         void main() {`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         // Snap no grid da arte: a névoa engrossa em blocos de pixel, como a poça da fogueira.
         vec2 mistTexel = floor(vMistPos * uLightRes);
         vec2 mistPos = uLightRes > 0.0 ? (mistTexel + 0.5) / uLightRes : vMistPos;
         // Distância ao retângulo do mundo: 0 lá dentro, crescendo para fora (a conta de caixa).
         vec2 outside = max(uMistRect.xy - mistPos, mistPos - uMistRect.zw);
         float d = length(max(outside, vec2(0.0)));
         // A frente da névoa não é reta: o mesmo ruído das chamas, andando devagar, come a borda.
         d += fireWobble(mistPos * 0.35, uFlowTime * 0.25) * uMistDepth * 0.5;
         diffuseColor.a *= smoothstep(0.0, max(0.5, uMistDepth), d);`,
      );
  };
  return mat;
};

/**
 * A CORTINA da névoa: um quad EM PÉ por tile, no mesmo plano em que as árvores são desenhadas.
 *
 * A primeira versão era uma TAMPA — quads deitados acima da copa — e a geometria a derrubou: com
 * a câmera a 48°, um plano horizontal sobre o tile (x,z) projeta ACIMA do lugar onde a árvore
 * daquele mesmo tile desenha. Ou seja, a tampa velava o tile de TRÁS e deixava a árvore da frente
 * exposta; o que aparecia na tela era um degradê deslocado, nunca a mata sumindo dentro da névoa.
 * Em pé, no mesmo z e um pouco mais alta que a copa, ela cobre exatamente o que está atrás dela.
 *
 * Sem uv, sem atlas e sem normal: a cortina é uma cor só, e quem a desenha é o shader a partir da
 * posição de mundo (ver makeVoidMistMaterial).
 */
export const buildMistCurtainGeometry = (
  tiles: ReadonlyArray<{ x: number; z: number }>, heightAt: (x: number, z: number) => number,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const idx: number[] = [];
  tiles.forEach(({ x, z }, i) => {
    const height = heightAt(x, z);
    // MEIO TILE À FRENTE (+z é a câmera). No próprio z a cortina fica na MESMA profundidade da
    // árvore daquele tile, e o teste de profundidade padrão (`less`) reprova o empate: a névoa
    // era descartada exatamente em cima do que ela existe para velar. Na borda da frente do
    // tile ela fica meio tile à frente da sua árvore e meio atrás da próxima — sem empate nenhum.
    const zf = z + 0.5;
    pos.push(x - 0.5, height, zf, x + 0.5, height, zf, x + 0.5, 0, zf, x - 0.5, 0, zf);
    const b = i * 4;
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
};

/** Place a fire's pool: the disc's rim sits at half the quad, centred on the dancing flame. */
export const setFireGlow = (
  mesh: THREE.Mesh, x: number, z: number, size: number, opacity: number,
): void => {
  const mat = mesh.material as THREE.MeshBasicMaterial;
  const glow = mat.userData.glow as GlowUniforms;
  mat.opacity = opacity;
  glow.center.value.set(x, z);
  glow.radius.value = size / 2;
  mesh.scale.set(size, 1, size);
  mesh.position.set(x, 0.07, z);
};
