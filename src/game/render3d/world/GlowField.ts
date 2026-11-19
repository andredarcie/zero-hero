// O CAMPO DAS POÇAS DE LUZ: todas as poças quentes no chão (as fogueiras, a lava, as janelas acesas) num desenho só.

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import {
  fireGlowResUniform, fireRampCoreUniform, fireRampMidUniform, fireRampRimUniform,
} from '../glowMaterials';
import {
  FIRE_WOBBLE_GLSL, flowTimeUniform, lightStepsUniform, lightWobbleUniform, SHADOW_MASK_GLSL, shadowMaskOnUniform,
  shadowMaskRectUniform, shadowMaskUniform,
} from '../pixelArtLight';
import type { CullView } from '../sceneCull';

/**
 * POR QUE UM CAMPO (pedido do autor, 2026-11-19: "faça uma melhoria geral na performance", e depois "melhore a
 * performance na praia e no lago termal").
 *
 * Cada fogo tinha a sua poça: um quadro aditivo de 15 × 15 tiles deitado no chão, com o ruído que entorta os anéis
 * avaliado duas vezes por pixel. No lago de lava são 50 fogos — 50 quadros que cobrem a tela inteira, uns sobre os
 * outros, cada um pagando o ruído de novo. Perto da lava e na fonte termal, que fica logo atrás dela, era o maior custo
 * de GPU do quadro.
 *
 * Duas contas mudaram, e nenhuma muda o desenho:
 *
 *   · A SOMA. A poça é aditiva: N passadas somando `cor · alfa` dão o que uma passada dá somando as N parcelas. E o
 *     ruído que entorta os anéis só depende do lugar (não do fogo), então ele é avaliado uma vez e serve a todas.
 *   · A CÉLULA. A poça é pintada na grade dela (`fireGlowResUniform`: 8 células por tile) — todo pixel de uma célula
 *     recebe exatamente a mesma luz. Então a soma é feita UMA VEZ POR CÉLULA, numa textura do tamanho da união das
 *     poças à vista (o mesmo truque do GroundLightMap), e o quadro deitado no chão só lê a célula dele. Numa tela de
 *     1440 × 900 a lava inteira cabe em ~40 mil células; a tela tem 1,3 milhão de pixels.
 *
 * O que é do pixel continua no pixel: a máscara de sombra multiplica a leitura (a soma é linear). O recorte de cada
 * poça no quadrado que era o seu quadro passa a ser feito na célula (na beira do quadrado a poça já vale ~0).
 *
 * Sem textura de ponto flutuante (EXT_color_buffer_float) o campo soma por pixel, com a mesma conta: mais lento, nunca
 * errado.
 *
 * As poças continuam sendo das malhas de `WorldLights` (o lugar, o tamanho, a força e se está à vista: `setFireGlow`);
 * elas só não desenham mais — quem desenha é este campo, lendo delas a cada quadro.
 */

/** Quantas poças o campo soma por quadro (as mais perto do meio da tela; o lago de lava inteiro cabe). */
export const GLOW_FIELD_MAX = 64;
/** A altura do quadro: a mesma das poças soltas (setFireGlow). */
const GLOW_Y = 0.07;
/** O quanto o ruído pode empurrar um ponto, em unidades de `uLightWobble`: os dois eixos a ±0,5 (√0,5 ≈ 0,71). */
const WOBBLE_REACH = 0.75;
/** Teto da textura por lado, em células (128 tiles com 8 por tile): a união das poças à vista cabe com folga. */
const MAX_CELLS = 1024;

type GlowUniforms = { center: THREE.IUniform<THREE.Vector2>; radius: THREE.IUniform<number> };

/** A curva da poça: a MESMA de glowMaterials.makeFireGlowMaterial (o miolo quente que cai depressa, a saia). */
const GLOW_CURVE_GLSL = /* glsl */ `
  float glowCurve(float r) {
    if (r >= 1.0) return 0.0;
    if (r < 0.12) return mix(0.80, 0.45, r / 0.12);
    if (r < 0.38) return mix(0.45, 0.15, (r - 0.12) / 0.26);
    if (r < 0.70) return mix(0.15, 0.035, (r - 0.38) / 0.32);
    return mix(0.035, 0.0, (r - 0.70) / 0.30);
  }
`;

/**
 * A soma das poças num ponto `gp0` (já na grade das células): as declarações e o corpo. `pos` é onde o recorte do
 * quadrado de cada poça é medido — o pixel, no caminho por pixel; a própria célula, no da textura.
 */
const SUM_PARS_GLSL = /* glsl */ `
  uniform vec4 uGlows[${GLOW_FIELD_MAX}];
  uniform int uGlowCount;
  uniform float uLightRes;
  uniform float uLightSteps;
  uniform float uLightWobble;
  uniform float uFlowTime;
  uniform vec3 uRampCore;
  uniform vec3 uRampMid;
  uniform vec3 uRampRim;
  ${FIRE_WOBBLE_GLSL}
  ${GLOW_CURVE_GLSL}
  vec3 zhGlowSum(vec2 gp0, vec2 pos) {
    // o ruído só depende do lugar: uma vez, para todas as poças
    vec2 wob = vec2(fireWobble(gp0, uFlowTime), fireWobble(gp0.yx + 31.7, uFlowTime));
    float reach = uLightWobble * ${WOBBLE_REACH.toFixed(2)};
    vec3 sum = vec3(0.0);
    for (int i = 0; i < ${GLOW_FIELD_MAX}; i++) {
      if (i >= uGlowCount) break;
      vec4 g = uGlows[i];
      // o quadro de cada poça solta era um quadrado de lado 2·raio: fora dele ela não desenhava
      vec2 dq = abs(pos - g.xy);
      if (max(dq.x, dq.y) > g.z) continue;
      float d0 = distance(gp0, g.xy);
      if (d0 > g.z + reach) continue; // nem o maior entortamento a traz até aqui
      float rBase = d0 / max(0.0001, g.z);
      vec2 gp = gp0 + wob * (uLightWobble * (0.35 + 0.65 * min(rBase, 1.0)));
      float glowA = glowCurve(distance(gp, g.xy) / max(0.0001, g.z));
      if (uLightSteps >= 1.0) glowA = floor(glowA * uLightSteps + 0.5) / uLightSteps;
      float rampT = uLightSteps >= 2.0 ? clamp((glowA * uLightSteps - 1.0) / (uLightSteps - 1.0), 0.0, 1.0) : glowA;
      vec3 ramp = rampT < 0.5 ? mix(uRampRim, uRampMid, rampT * 2.0) : mix(uRampMid, uRampCore, rampT * 2.0 - 1.0);
      // a poça aditiva soma cor × alfa (o alfa é a curva × a força da poça)
      sum += ramp * glowA * g.w;
    }
    return sum;
  }
`;

const sumUniforms = (glows: THREE.IUniform<THREE.Vector4[]>, count: THREE.IUniform<number>): Record<string, THREE.IUniform> => ({
  uGlows: glows,
  uGlowCount: count,
  uLightRes: fireGlowResUniform,
  uLightSteps: lightStepsUniform,
  uLightWobble: lightWobbleUniform,
  uFlowTime: flowTimeUniform,
  uRampCore: fireRampCoreUniform,
  uRampMid: fireRampMidUniform,
  uRampRim: fireRampRimUniform,
});

/** O quadro deitado no chão: lê a célula dele (ou soma ali mesmo, sem textura) e passa pela máscara de sombra. */
const makeGroundMaterial = (
  sum: Record<string, THREE.IUniform>, map: Record<string, THREE.IUniform> | null,
): THREE.MeshBasicMaterial => {
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  mat.customProgramCacheKey = () => (map ? 'fireGlowFieldMap' : 'fireGlowField');
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, map ?? sum);
    if (map) shader.uniforms.uLightRes = fireGlowResUniform;
    shader.uniforms.uShadowMask = shadowMaskUniform;
    shader.uniforms.uMaskRect = shadowMaskRectUniform;
    shader.uniforms.uMaskOn = shadowMaskOnUniform;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vGlowPos;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vGlowPos = (modelMatrix * vec4(transformed, 1.0)).xz;');
    const pars = map
      ? `uniform sampler2D uGlowMap;
         uniform vec4 uGlowRect;
         uniform vec2 uGlowSize;
         uniform float uLightRes;`
      : SUM_PARS_GLSL;
    const body = map
      ? `vec2 zhCell = floor(vGlowPos * uLightRes) - uGlowRect.xy;
         if (zhCell.x < 0.0 || zhCell.y < 0.0 || zhCell.x >= uGlowRect.z || zhCell.y >= uGlowRect.w) discard;
         vec3 glowSum = texture2D(uGlowMap, (zhCell + 0.5) / uGlowSize).rgb;`
      : `vec2 gp0 = uLightRes > 0.0 ? (floor(vGlowPos * uLightRes) + 0.5) / uLightRes : vGlowPos;
         vec3 glowSum = zhGlowSum(gp0, vGlowPos);`;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${pars}\n${SHADOW_MASK_GLSL}\nvarying vec2 vGlowPos;\nvoid main() {`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         ${body}
         diffuseColor.rgb *= glowSum * (1.0 - zhShadowMask(vGlowPos, vec2(0.0)));
         diffuseColor.a = 1.0;`,
      );
  };
  return mat;
};

/** A soma por célula, numa textura: o texel (x, y) é a célula (origem + x, origem + y) da grade das poças. */
const makeBakeMaterial = (sum: Record<string, THREE.IUniform>, origin: THREE.IUniform<THREE.Vector2>): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    uniforms: { ...sum, uOrigin: origin },
    vertexShader: /* glsl */ 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec2 uOrigin;
      ${SUM_PARS_GLSL}
      void main() {
        vec2 gp0 = (floor(gl_FragCoord.xy) + uOrigin + 0.5) / uLightRes;
        gl_FragColor = vec4(zhGlowSum(gp0, gp0), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

export class GlowField {
  public readonly mesh: THREE.Mesh;
  private readonly glows: THREE.IUniform<THREE.Vector4[]> = {
    value: Array.from({ length: GLOW_FIELD_MAX }, () => new THREE.Vector4()),
  };
  private readonly count: THREE.IUniform<number> = { value: 0 };
  /** As poças à vista deste quadro, antes do corte em GLOW_FIELD_MAX (reaproveitada: nada aloca por quadro). */
  private readonly picked: Array<{ mesh: THREE.Mesh; d: number }> = [];
  private readonly byDistance = (a: { d: number }, b: { d: number }): number => a.d - b.d;
  /**
   * O caminho da textura (null sem ponto flutuante). DUAS texturas alternadas, como as do GroundLightMap: escrever na
   * que o quadro anterior ainda pode estar lendo faz o driver esperar a GPU.
   */
  private readonly baked: {
    targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
    quad: FullScreenQuad;
    origin: THREE.IUniform<THREE.Vector2>;
    map: Record<string, THREE.IUniform>;
  } | null;
  private flip = 0;

  public constructor(scene: THREE.Scene, supportsFloatTargets: boolean) {
    const sum = sumUniforms(this.glows, this.count);
    if (supportsFloatTargets) {
      const make = (): THREE.WebGLRenderTarget => new THREE.WebGLRenderTarget(64, 64, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        generateMipmaps: false,
      });
      const origin: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2() };
      const targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] = [make(), make()];
      this.baked = {
        targets,
        quad: new FullScreenQuad(makeBakeMaterial(sum, origin)),
        origin,
        map: {
          uGlowMap: { value: targets[0].texture },
          uGlowRect: { value: new THREE.Vector4(0, 0, 0, 0) },
          uGlowSize: { value: new THREE.Vector2(64, 64) },
        },
      };
    } else {
      this.baked = null;
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, makeGroundMaterial(sum, this.baked?.map ?? null));
    // a mesma ordem das poças soltas: depois do chão, antes das sombras de fogo (4)
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'fire-glow-field';
    scene.add(this.mesh);
  }

  /** Quantas poças entraram neste quadro (a janela dos testes). */
  public get size(): number {
    return this.count.value;
  }

  /**
   * O aquecimento (ShaderPrewarm): a soma por célula é um programa fora da cena, e o primeiro fogo à vista seria o
   * quadro em que ele compila. Desenhado aqui uma vez, num texel, no alvo de verdade.
   */
  public warm(renderer: THREE.WebGLRenderer): void {
    if (!this.baked) return;
    const target = this.baked.targets[0];
    const prev = renderer.getRenderTarget();
    target.viewport.set(0, 0, 1, 1);
    renderer.setRenderTarget(target);
    this.baked.quad.render(renderer);
    renderer.setRenderTarget(prev);
  }

  /**
   * Lê as poças (`setFireGlow` já as pôs no lugar neste quadro), fica com as que estão acesas e à vista, soma-as na
   * textura (uma vez por célula) e deita o quadro sobre a união delas, recortada pela área de chão visível.
   */
  public update(sources: Iterable<THREE.Mesh>, view: CullView, renderer: THREE.WebGLRenderer): void {
    const picked = this.picked;
    let n = 0;
    const cx = (view.minX + view.maxX) / 2;
    const cz = (view.minZ + view.maxZ) / 2;
    for (const mesh of sources) {
      if (!mesh.visible) continue;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (mat.opacity <= 0.0005) continue;
      const g = mat.userData.glow as GlowUniforms;
      const r = g.radius.value;
      const x = g.center.value.x;
      const z = g.center.value.y;
      if (x + r < view.minX || x - r > view.maxX || z + r < view.minZ || z - r > view.maxZ) continue;
      let slot = picked[n];
      if (!slot) { slot = { mesh, d: 0 }; picked[n] = slot; }
      slot.mesh = mesh;
      slot.d = (x - cx) * (x - cx) + (z - cz) * (z - cz);
      n += 1;
    }
    picked.length = n;
    if (n > GLOW_FIELD_MAX) picked.sort(this.byDistance);
    const used = Math.min(n, GLOW_FIELD_MAX);
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < used; i += 1) {
      const mat = picked[i].mesh.material as THREE.MeshBasicMaterial;
      const g = mat.userData.glow as GlowUniforms;
      // o quadrado da poça solta (o recorte é nele): o lado é 2·raio
      const r = g.radius.value;
      const x = g.center.value.x;
      const z = g.center.value.y;
      this.glows.value[i].set(x, z, r, mat.opacity);
      x0 = Math.min(x0, x - r);
      x1 = Math.max(x1, x + r);
      z0 = Math.min(z0, z - r);
      z1 = Math.max(z1, z + r);
    }
    this.count.value = used;
    // a união recortada pelo chão visível (que já vem com folga)
    x0 = Math.max(x0, view.minX);
    x1 = Math.min(x1, view.maxX);
    z0 = Math.max(z0, view.minZ);
    z1 = Math.min(z1, view.maxZ);
    if (used === 0 || !(x1 > x0 && z1 > z0)) {
      this.mesh.visible = false;
      return;
    }
    const res = fireGlowResUniform.value as number;
    if (this.baked && res > 0) {
      // A textura cobre as células da união, inteiras; o quadro no chão, exatamente essas células.
      const c0x = Math.floor(x0 * res);
      const c0z = Math.floor(z0 * res);
      const w = Math.min(MAX_CELLS, Math.ceil(x1 * res) - c0x);
      const h = Math.min(MAX_CELLS, Math.ceil(z1 * res) - c0z);
      this.bake(renderer, c0x, c0z, w, h);
      x0 = c0x / res;
      z0 = c0z / res;
      x1 = (c0x + w) / res;
      z1 = (c0z + h) / res;
    }
    this.mesh.visible = true;
    this.mesh.position.set((x0 + x1) / 2, GLOW_Y, (z0 + z1) / 2);
    this.mesh.scale.set(x1 - x0, 1, z1 - z0);
  }

  /** A soma das poças nas células [c0x, c0x + w) × [c0z, c0z + h), na textura deste quadro. */
  private bake(renderer: THREE.WebGLRenderer, c0x: number, c0z: number, w: number, h: number): void {
    const b = this.baked!;
    this.flip ^= 1;
    const target = b.targets[this.flip];
    // A textura só CRESCE (em degraus de 64), como a do GroundLightMap: realocar a cada passo da câmera custaria uma
    // alocação de GPU por quadro. O que sobra fica fora da viewport.
    const tw = Math.max(target.width, Math.ceil(w / 64) * 64);
    const th = Math.max(target.height, Math.ceil(h / 64) * 64);
    if (tw !== target.width || th !== target.height) target.setSize(tw, th);
    b.origin.value.set(c0x, c0z);
    const prev = renderer.getRenderTarget();
    target.viewport.set(0, 0, w, h);
    renderer.setRenderTarget(target);
    b.quad.render(renderer);
    renderer.setRenderTarget(prev);
    b.map.uGlowMap.value = target.texture;
    (b.map.uGlowRect.value as THREE.Vector4).set(c0x, c0z, w, h);
    (b.map.uGlowSize.value as THREE.Vector2).set(tw, th);
  }
}
