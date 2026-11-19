import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

import {
  FIRE_WOBBLE_GLSL,
  flowTimeUniform,
  groundLightMapOnUniform,
  groundLightMapUniform,
  groundLightReachUniform,
  groundLightRectUniform,
  groundLightSizeUniform,
  groundLightTexelYUniform,
  lightResUniform,
  lightWobbleUniform,
} from './pixelArtLight';

/**
 * A LUZ DO CHÃO, CALCULADA UMA VEZ POR CÉLULA E NÃO UMA VEZ POR PIXEL.
 *
 * O chão (e a grama rasteira em cima dele) era o maior custo da cena: 1,8ms de GPU em Full HD,
 * quase metade do RenderPass. Cada pixel rodava o laço inteiro das luzes pontuais — onze, com
 * ruído de tremor e atenuação — e o resultado era jogado fora pela própria regra do jogo: a luz
 * deste mundo é desenhada em BLOCOS (`lightResUniform`, 16 células por tile), e todo pixel de uma
 * célula recebe exatamente a mesma luz, porque o shader calcula na posição da célula, não na dele.
 * Em Full HD uma célula cobre ~22 pixels: 22 vezes a mesma conta.
 *
 * Aqui a conta é feita uma vez por célula, numa textura do tamanho da área visível do chão (uma
 * célula = um texel), e o shader do chão lê o texel da sua célula no lugar do laço. A matemática é
 * a do three, linha a linha (`getPointLightInfo`, `getDistanceAttenuation`, `RE_Direct_Lambert`),
 * na mesma posição de célula com o mesmo tremor — só em espaço de mundo em vez de espaço de câmera,
 * o que dá a mesma distância e o mesmo cosseno. O que é do pixel continua no pixel: a máscara de
 * sombra (multiplica a soma, que é linear), a lua, o ambiente, as faixas e o teto de luz.
 *
 * Só vale onde a conta da célula é a mesma para qualquer pixel dela: normal para CIMA e na camada
 * de células do chão (y = 0). O resto — árvores, paredes, chão afundado, a borda fora da área — cai
 * no laço original sem saber que este existe.
 *
 * Textura em ponto flutuante de 32 bits: a soma passa pelas faixas (`floor`) do `uLightSteps`, e um
 * meio-float arredondaria células na beira de uma faixa para a faixa vizinha. Sem
 * `EXT_color_buffer_float` o mapa se desliga e o chão volta ao laço — mais lento, nunca errado.
 */

/** A camada de células do chão: y em [0, 1/16) com lightRes 16 (o chão é y=0, a grama 0,02). */
const GROUND_Y = 0;
/** Folga em volta da área visível, em tiles: o tremor empurra a célula até ~0,6 tile. */
const PAD_TILES = 2;
/** Teto da textura por lado. Acima disto (uma câmera muito aberta) a sobra cai no laço. */
const MAX_TEXELS = 2048;
/**
 * Quantas luzes o shader do mapa comporta. A cena tem uma contagem FIXA (FIRE_LIGHT_SLOTS + 3),
 * mas a tocha e a luz do herói nascem quando são usadas pela primeira vez — então o mapa lê a
 * lista viva a cada quadro e o laço para no `uCount`.
 */
const MAX_LIGHTS = 16;

const VERTEX = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragment = (lights: number): string => /* glsl */ `
  uniform int uCount;
  uniform vec2 uOrigin;
  uniform float uRes;
  uniform float uTexelY;
  uniform float uFlowTime;
  uniform float uLightWobble;
  uniform vec3 uPos[${lights}];
  uniform vec3 uCol[${lights}];
  uniform float uDist[${lights}];
  uniform float uDecay[${lights}];
  ${FIRE_WOBBLE_GLSL}
  void main() {
    // O texel (x, y) desta textura é a célula (origem + x, origem + y) do chão.
    vec2 cell = floor(gl_FragCoord.xy) + uOrigin;
    vec3 t = (vec3(cell.x, uTexelY, cell.y) + 0.5) / uRes;
    t.xz += vec2(fireWobble(t.xz, uFlowTime), fireWobble(t.zx + 31.7, uFlowTime)) * uLightWobble;
    vec3 sum = vec3(0.0);
    for (int i = 0; i < ${lights}; i++) {
      if (i >= uCount) break;
      vec3 c = uCol[i];
      if (c.r + c.g + c.b > 0.0) {
        vec3 l = uPos[i] - t;
        float d = length(l);
        float att = 1.0 / max(pow(d, uDecay[i]), 0.01);
        if (uDist[i] > 0.0) {
          float q = d / uDist[i];
          float q2 = q * q;
          float r = clamp(1.0 - q2 * q2, 0.0, 1.0);
          att *= r * r;
        }
        // Normal para cima: dot(N, L) é o y da direção.
        sum += clamp(normalize(l).y, 0.0, 1.0) * c * att;
      }
    }
    gl_FragColor = vec4(sum, 1.0);
  }
`;

export class GroundLightMap {
  /**
   * DUAS texturas, alternadas a cada quadro. Escrever na mesma textura que o quadro anterior ainda
   * pode estar lendo na GPU obriga o driver (D3D11, via ANGLE) a esperar a GPU terminar: no
   * celular simulado isso aparecia como 2,8% do quadro num update que, medido sozinho, custa 6µs.
   */
  private readonly targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private flip = 0;
  private readonly quad: FullScreenQuad;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly supported: boolean;
  private readonly ray = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly hit = new THREE.Vector3();
  private readonly lightPos = new THREE.Vector3();
  /** O alcance das luzes acesas neste quadro (ver measureReach; reaproveitado: nada aloca por quadro). */
  private readonly reach = { x0: 0, z0: 0, x1: 0, z1: 0 };
  /**
   * O retângulo do chão que a câmera enxergou no último quadro, em tiles e já com a folga — o que
   * está fora dele não aparece na tela. Quem anima coisas pelo mundo pergunta aqui antes de
   * gastar o quadro com o que ninguém vê (ver World3D.isNearView).
   */
  public readonly view = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };

  public constructor(
    renderer: THREE.WebGLRenderer,
    /** As luzes pontuais da cena agora — as mesmas que o three passa aos materiais. */
    private readonly lights: () => readonly THREE.PointLight[],
  ) {
    this.supported = renderer.extensions.has('EXT_color_buffer_float');
    const make = (): THREE.WebGLRenderTarget => new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
    this.targets = [make(), make()];
    const n = MAX_LIGHTS;
    this.uniforms = {
      uCount: { value: 0 },
      uOrigin: { value: new THREE.Vector2() },
      uRes: { value: 16 },
      uTexelY: { value: GROUND_Y },
      uFlowTime: flowTimeUniform,
      uLightWobble: lightWobbleUniform,
      // Float32Array e não Vector3[]: o three manda um array tipado direto ao uniform, sem achatar
      // dezesseis vetores num buffer novo a cada quadro.
      uPos: { value: new Float32Array(n * 3) },
      uCol: { value: new Float32Array(n * 3) },
      uDist: { value: new Float32Array(n) },
      uDecay: { value: new Float32Array(n).fill(1) },
    };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: fragment(n),
      depthTest: false,
      depthWrite: false,
    }));
    groundLightMapUniform.value = this.targets[0].texture;
    groundLightTexelYUniform.value = GROUND_Y;
    groundLightMapOnUniform.value = 0;
  }

  /**
   * Recalcula o mapa para o quadro que a câmera vai desenhar agora. Chamado depois de as luzes e
   * a câmera terem andado (World3D.render), antes do compositor.
   */
  public update(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    const res = lightResUniform.value as number;

    // A área do chão que a câmera enxerga: os quatro cantos da tela projetados no plano do chão.
    const planeY = res > 0 ? (GROUND_Y + 0.5) / res : 0;
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (let i = 0; i < 4; i++) {
      const nx = i & 1 ? 1 : -1;
      const ny = i & 2 ? 1 : -1;
      this.origin.set(nx, ny, -1).unproject(camera);
      this.ray.set(nx, ny, 1).unproject(camera).sub(this.origin);
      // Raio que não desce até o chão (acima do horizonte): corta no plano distante.
      const s = this.ray.y < -1e-6 ? Math.min(1, (planeY - this.origin.y) / this.ray.y) : 1;
      this.hit.copy(this.origin).addScaledVector(this.ray, Math.max(0, s));
      minX = Math.min(minX, this.hit.x); maxX = Math.max(maxX, this.hit.x);
      minZ = Math.min(minZ, this.hit.z); maxZ = Math.max(maxZ, this.hit.z);
    }
    const v = this.view;
    v.minX = minX - PAD_TILES; v.maxX = maxX + PAD_TILES;
    v.minZ = minZ - PAD_TILES; v.maxZ = maxZ + PAD_TILES;

    // O ALCANCE das luzes acesas (groundLightReachUniform): a caixa das esferas de corte, com a folga do tremor.
    const lights = this.lights();
    const count = Math.min(MAX_LIGHTS, lights.length);
    const reach = this.measureReach(lights, count);
    if (!this.supported || !(res > 0)) {
      groundLightMapOnUniform.value = 0;
      return;
    }
    // Sem nenhuma luz acesa o mapa seria todo zero, e o laço que ele substitui é pulado inteiro: nem desenha.
    if (reach.x0 > reach.x1) {
      groundLightMapOnUniform.value = 0;
      return;
    }

    // O mapa cobre o chão visível DENTRO do alcance: fora dele a luz é zero e o shader nem pergunta. Com a câmera do
    // guarda-sol olhando o horizonte, a área visível é o mar até o fim do mundo, e o mapa chegava ao teto (2048²
    // células, mais que os pixels da tela) para guardar zeros.
    const ax0 = Math.max(minX - PAD_TILES, reach.x0);
    const az0 = Math.max(minZ - PAD_TILES, reach.z0);
    const ax1 = Math.min(maxX + PAD_TILES, reach.x1);
    const az1 = Math.min(maxZ + PAD_TILES, reach.z1);
    const x0 = Math.floor(ax0 * res);
    const z0 = Math.floor(az0 * res);
    const w = Math.min(MAX_TEXELS, Math.ceil(ax1 * res) - x0);
    const h = Math.min(MAX_TEXELS, Math.ceil(az1 * res) - z0);
    if (!(w > 0 && h > 0)) {
      groundLightMapOnUniform.value = 0;
      return;
    }
    // A textura só CRESCE (em degraus de 64): realocar todo quadro que a câmera anda custaria uma
    // alocação de GPU por quadro. O que sobra fica sem uso, fora da viewport.
    this.flip ^= 1;
    const target = this.targets[this.flip];
    const cw = Math.max(target.width, Math.ceil(w / 64) * 64);
    const ch = Math.max(target.height, Math.ceil(h / 64) * 64);
    if (cw !== target.width || ch !== target.height) target.setSize(cw, ch);

    const u = this.uniforms;
    (u.uOrigin.value as THREE.Vector2).set(x0, z0);
    u.uRes.value = res;
    // As luzes como o three as entrega ao shader: cor × intensidade, e só as visíveis.
    const pos = u.uPos.value as Float32Array;
    const col = u.uCol.value as Float32Array;
    const dist = u.uDist.value as Float32Array;
    const decay = u.uDecay.value as Float32Array;
    u.uCount.value = count;
    for (let i = 0; i < count; i++) {
      const l = lights[i];
      // As luzes são filhas diretas da cena: a posição local É a de mundo.
      const p = (l.parent as THREE.Scene | null)?.isScene ? l.position : l.getWorldPosition(this.lightPos);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      const k = l.visible ? l.intensity : 0;
      col[i * 3] = l.color.r * k; col[i * 3 + 1] = l.color.g * k; col[i * 3 + 2] = l.color.b * k;
      dist[i] = l.distance;
      decay[i] = l.decay;
    }

    const prev = renderer.getRenderTarget();
    target.viewport.set(0, 0, w, h);
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
    renderer.setRenderTarget(prev);

    (groundLightRectUniform.value as THREE.Vector4).set(x0, z0, w, h);
    (groundLightSizeUniform.value as THREE.Vector2).set(cw, ch);
    groundLightMapUniform.value = target.texture;
    groundLightMapOnUniform.value = 1;
  }

  /**
   * A caixa (em tiles de mundo) fora da qual toda luz pontual acesa vale exatamente zero, escrita no uniform que os
   * materiais leem. Uma luz conta se a cor × intensidade não é preta (as apagadas o shader já pula); a esfera dela é o
   * `distance` (0 = sem corte: o mundo inteiro). A folga cobre o tremor da célula (até ~0,85 tile com o padrão) e o
   * meio texel do encaixe na grade. Nenhuma luz acesa: a caixa sai vazia (x0 > x1), e todo fragmento é "longe".
   */
  private measureReach(lights: readonly THREE.PointLight[], count: number): { x0: number; z0: number; x1: number; z1: number } {
    const r = this.reach;
    r.x0 = Infinity; r.z0 = Infinity; r.x1 = -Infinity; r.z1 = -Infinity;
    for (let i = 0; i < count; i++) {
      const l = lights[i];
      if (!l.visible || !(l.intensity > 0) || l.color.r + l.color.g + l.color.b <= 0) continue;
      const p = (l.parent as THREE.Scene | null)?.isScene ? l.position : l.getWorldPosition(this.lightPos);
      const d = l.distance > 0 ? l.distance : Infinity;
      r.x0 = Math.min(r.x0, p.x - d); r.x1 = Math.max(r.x1, p.x + d);
      r.z0 = Math.min(r.z0, p.z - d); r.z1 = Math.max(r.z1, p.z + d);
    }
    const slack = Math.abs(lightWobbleUniform.value as number) * 0.75 + 0.25;
    r.x0 -= slack; r.z0 -= slack; r.x1 += slack; r.z1 += slack;
    // (vazia: o uniform fica com a caixa do avesso, e o teste "fora" do shader vale para todo ponto)
    const u = groundLightReachUniform.value;
    if (r.x0 > r.x1) u.set(1e9, 1e9, -1e9, -1e9);
    else u.set(Math.max(-1e9, r.x0), Math.max(-1e9, r.z0), Math.min(1e9, r.x1), Math.min(1e9, r.z1));
    return r;
  }

  public dispose(): void {
    for (const t of this.targets) t.dispose();
    this.quad.material.dispose();
    this.quad.dispose();
    groundLightMapOnUniform.value = 0;
    groundLightMapUniform.value = null;
    groundLightReachUniform.value.set(-1e9, -1e9, 1e9, 1e9);
  }
}
