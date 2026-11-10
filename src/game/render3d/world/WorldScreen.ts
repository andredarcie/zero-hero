// A TELA DO MUNDO 3D: o tamanho do buffer em pixel de aparelho (o bloco inteiro do pixel art), o FOV da tela em pé,
// a margem da câmera de pixel suave, e a cadeia de pós (bloom e acabamento) no mesmo tamanho.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { FusedBloomPass } from '../FusedBloomPass';
import { getDofIntensity } from '@/game/runtime/graphicsSettings';
import { platform } from '@/game/platform/platform';
import { makeFinishShader } from '../finishShader';
import type { World3D } from '../World3D';

// O PISO DA LARGURA da vista (ver effectiveFov): a tangente do meio-ângulo horizontal. 0,34 são
// ~5,5 tiles de largura na profundidade do herói (o desktop 16:10 vê ~9); e o teto do FOV vertical
// que a tela em pé pode pedir para alcançá-lo.
// 0,34 ÷ 1,285 (2026-11-10): a câmera recuou pelo dolly zoom (worldParams.camHeight), e a mesma tangente veria 7 tiles.
const PORTRAIT_MIN_HALF_TAN_X = 0.2646;
const PORTRAIT_FOV_CAP = 74;
// Ambient particle counts (additive Points — brasas rising off the fire, dust in the air,
// fireflies drifting in lit clearings, low mist wisps veiling the dark ground).
/**
 * O maior tamanho que um pixel desenhado pode ter, em pixels de aparelho, antes de o renderizador
 * dobrar a divisão (ver `renderScale`).
 *
 * Ele não é um teto de `devicePixelRatio`: é o limite de QUALIDADE que decide o divisor inteiro.
 * Num telefone de 3× ele manda desenhar a 1,5× a tela CSS — cada pixel vira um bloco de 2×2 no
 * painel, uniforme. Baixá-lo para 1 pediria a resolução nativa do aparelho (2,25× o preenchimento);
 * subi-lo para 3 devolveria blocos de 3×3, que já é o mundo quadriculado de antes.
 */
const MAX_DEVICE_PIXEL_RATIO = 2;

/**
 * O passo do AR dentro da cadeia: depois da cena (ele lê a profundidade DESTE quadro, que só existe quando a cena
 * acabou de ser desenhada) e antes do acabamento, que o soma. Não escreve no quadro: `needsSwap` fica falso.
 */
class AirPass extends Pass {
  public constructor(private readonly draw: (depth: THREE.Texture | null) => void) {
    super();
    this.needsSwap = false;
  }

  public override render(_renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    this.draw(read.depthTexture);
  }
}

/** O que WorldScreen usa de World3D. */
export type WorldScreenHost = Pick<World3D, 'air' | 'camera' | 'canvas' | 'mirror' | 'params' | 'renderer' | 'scene'>;

export class WorldScreen {
  private bloomPass!: FusedBloomPass;
  /** A escala com que o buffer foi assado — o `uBlur` se mede nela (ver syncFinishUniforms). */
  private appliedRenderScale = 1;

  // ── HD-2D post chain ──
  public composer!: EffectComposer;
  /** A passada da cena (ver o `clear` dela em render). */
  public scenePass!: RenderPass;
  public finishPass!: ShaderPass;
  public appliedPixelScale = 0;
  /** Quantos pixels de APARELHO um pixel desenhado ocupa (1 no desktop; 2 no econômico e no celular). */
  public appliedBlocks = 1;
  /**
   * A margem do canvas, em px CSS: um pixel do buffer de cada lado quando `appliedBlocks` > 1, para
   * o deslocamento fracionário da câmera de pixel suave nunca descobrir a borda da tela.
   */
  public snapMarginCss = 0;

  public constructor(private readonly host: WorldScreenHost) {}

  /**
   * O TAMANHO DO BUFFER, e a conta que estava errada no celular.
   *
   * Ela media a tela em pixels CSS (`innerWidth`) com `setPixelRatio(1)`, ou seja: fingia que um
   * pixel CSS é um pixel de aparelho. Num monitor comum é — e por isso o desktop sempre saiu
   * nítido. Num telefone um pixel CSS são TRÊS pixels de aparelho, então o quadro já saía esticado
   * 3× antes de qualquer `pixelScale`; com o `pixelScale: 2` que o celular usava por cima disso, o
   * jogo era desenhado a 1/6 da resolução da tela e ampliado de volta. É o serrilhado que o autor
   * viu, e ele não era o pixel art: era um segundo reescalonamento, invisível no código.
   *
   * Agora `renderScale` é medido em PIXEL DE APARELHO — `pixelScale` finalmente quer dizer o que o
   * nome diz (quantos pixels de tela um pixel desenhado ocupa) e a mesma imagem sai do mesmo jeito
   * no monitor e no telefone.
   *
   * O TETO de 2 no `devicePixelRatio` é a mesma prudência do antigo protótipo 3D (`src/prototype3d`, já removido)
   * e dos exemplos do three: acima de 2 a diferença é invisível a olho e a conta de preenchimento
   * dobra de novo — e preenchimento é justamente o que falta numa GPU de telefone.
   */
  private renderScale(): number {
    const ps = Math.max(1, Math.round(this.host.params.pixelScale));
    const dpr = Math.max(1, platform().display.pixelRatio);
    // `blocks` = quantos PIXELS DE APARELHO um pixel desenhado ocupa, e ele é INTEIRO. Essa é a
    // outra metade do conserto, e ela é de graça: com um fator quebrado (1,5, que é o que um teto
    // de 2 dá num telefone de 3×) o navegador amplia uns pixels para 1 e outros para 2, e o que se
    // vê é uma grade de blocos de tamanhos diferentes — serrilhado irregular, justamente o que
    // `image-rendering: pixelated` deveria evitar. Em fator inteiro todo bloco é igual.
    //
    // No telefone de 3× ele também sai MAIS BARATO que o teto de 2 (buffer 1,5× a tela CSS contra
    // 2×), então a versão certa é a mais rápida das duas.
    // O `- 1e-6` não é superstição: o navegador devolve `devicePixelRatio` = 2.0000000298 numa
    // tela 2×, e um `ceil` cru sobre isso dá 2 em vez de 1 — a retina passava a desenhar na
    // METADE por causa do último bit de um float.
    const blocks = Math.max(1, Math.ceil(dpr / MAX_DEVICE_PIXEL_RATIO - 1e-6)) * ps;
    return dpr / blocks;
  }

  private renderSize(): { w: number; h: number } {
    const scale = this.renderScale();
    const pad = this.snapPadPx();
    return {
      w: Math.max(1, Math.round(platform().display.width * scale)) + 2 * pad,
      h: Math.max(1, Math.round(platform().display.height * scale)) + 2 * pad,
    };
  }

  /**
   * O FOV VERTICAL de verdade, para esta proporção de tela. O autorado (`params.fov`) é vertical, e
   * numa tela em pé ele corta os LADOS: um telefone em retrato via ~3 tiles de largura — o herói
   * ocupava um terço da tela e um vizinho a dois passos já ficava fora dela. Então a largura tem um
   * piso (PORTRAIT_MIN_HALF_TAN_X, a tangente do meio-ângulo horizontal) e, abaixo dele, o FOV
   * vertical sobe até cobri-lo, com teto (PORTRAIT_FOV_CAP) para a perspectiva não virar olho de
   * peixe. Numa tela deitada o piso já está atendido e nada muda.
   */
  public effectiveFov(aspect: number): number {
    const need = THREE.MathUtils.radToDeg(2 * Math.atan(PORTRAIT_MIN_HALF_TAN_X / Math.max(0.1, aspect)));
    return Math.min(Math.max(this.host.params.fov, PORTRAIT_FOV_CAP), Math.max(this.host.params.fov, need));
  }

  /**
   * A margem da câmera de pixel suave, em pixels do BUFFER, de cada lado: 1 quando um pixel
   * desenhado ocupa mais de um pixel do aparelho, 0 no desktop (onde não há sobra a esconder).
   */
  private snapPadPx(): number {
    const blocks = Math.round((platform().display.pixelRatio) / this.renderScale());
    return blocks > 1 ? 1 : 0;
  }

  /**
   * Build the post chain (ported from the old 3D prototype, since removed):
   *   scene → bloom (emissive halo) → FinishShader (bloom sum + tilt-shift DoF + vignette + grain).
   * Everything runs at the low render resolution, so the NEAREST upscale still
   * gives the chunky pixel-art frame.
   */
  public initPostProcessing(): void {
    const { w, h } = this.renderSize();
    // O alvo da cena guarda a PROFUNDIDADE numa textura (e não num renderbuffer, que ninguém pode ler): é por ela que
    // o pós volta de um pixel ao ponto do mundo — a sombra das nuvens e a luz no ar dependem disso. O mesmo
    // meio-float que o compositor criaria sozinho.
    const sceneTarget = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(w, h),
    });
    this.composer = new EffectComposer(this.host.renderer, sceneTarget);
    this.scenePass = new RenderPass(this.host.scene, this.host.camera);
    this.composer.addPass(this.scenePass);

    // O ar aceso (AirLight): lê a profundidade que a cena acabou de escrever e entrega ao acabamento.
    this.composer.addPass(new AirPass((depth) => {
      this.host.air.render(depth);
      const u = this.finishPass.uniforms;
      u.tDepth.value = depth;
      u.uAirOn.value = this.host.air.live ? 1 : 0;
      (u.uInvViewProj.value as THREE.Matrix4).multiplyMatrices(this.host.camera.matrixWorld, this.host.camera.projectionMatrixInverse);
    }));

    this.bloomPass = new FusedBloomPass(
      new THREE.Vector2(w, h),
      this.host.params.bloomStrength,
      this.host.params.bloomRadius,
      this.host.params.bloomThreshold,
    );
    this.composer.addPass(this.bloomPass);

    this.finishPass = new ShaderPass(makeFinishShader(w, h));
    // O bloom nao se soma sozinho ao quadro: o acabamento soma (ver FusedBloomPass).
    this.finishPass.uniforms.tBloom.value = this.bloomPass.texture;
    this.host.air.setSize(w, h);
    this.finishPass.uniforms.tAir.value = this.host.air.texture;
    this.composer.addPass(this.finishPass);
    this.syncFinishUniforms();

    this.host.mirror.createTarget(this.composer.renderTarget1, w, h);
  }

  /** Push the live post knobs into the shader/pass uniforms. */
  public syncFinishUniforms(): void {
    this.host.renderer.toneMappingExposure = this.host.params.exposure;
    this.bloomPass.strength = this.host.params.bloomStrength;
    this.bloomPass.radius = this.host.params.bloomRadius;
    this.bloomPass.threshold = this.host.params.bloomThreshold;
    const u = this.finishPass.uniforms;
    u.uFocusY.value = this.host.params.focusY;
    u.uBand.value = this.host.params.focusBand;
    // O borrão é medido em PIXELS DO BUFFER, então ele tem de acompanhar a escala em que o buffer
    // foi assado — senão a mesma cena, desenhada com o dobro da resolução, sai com metade do
    // tilt-shift. O número autorado continua sendo "quantos pixels de TELA", que é como o olho o
    // escolheu. (E a preferência de acessibilidade do jogador segue por cima: 0 = diorama nítido.)
    u.uBlur.value = this.host.params.dofBlur * getDofIntensity() * this.appliedRenderScale;
    u.uNear.value = this.host.params.dofNear;
    u.uVignette.value = this.host.params.vignette;
    u.uLift.value = Math.max(0.05, this.host.params.lift);
    u.uShoulder.value = Math.min(0.98, Math.max(0, this.host.params.shoulder));
    u.uGrain.value = this.host.params.grain;
    u.uHaze.value = Math.max(0, this.host.params.haze);
    u.uGrade.value = this.host.params.grade;
    u.uSaturation.value = this.host.params.saturation;
    u.uShadeSat.value = Math.min(1, Math.max(0, this.host.params.shadeSat));
    u.uContrast.value = this.host.params.contrast;
  }

  /** Resize the backing store to the current window × renderScale (ver renderSize). */
  public applyPixelScale(): void {
    this.appliedPixelScale = Math.max(1, Math.round(this.host.params.pixelScale));
    this.appliedRenderScale = this.renderScale();
    this.appliedBlocks = Math.max(1, Math.round((platform().display.pixelRatio) / this.appliedRenderScale));
    // A MESMA conta do `renderSize`, e não uma segunda cópia dela: enquanto eram duas, mexer numa
    // deixava a outra desenhando com o tamanho antigo até o primeiro resize.
    const { w, h } = this.renderSize();
    this.host.renderer.setSize(w, h, false); // CSS size is set below — the browser does the NEAREST upscale
    // O canvas cobre a tela MAIS a margem da câmera de pixel suave (um pixel do buffer de cada
    // lado, que o `renderSize` já somou ao buffer): a mesma razão buffer/CSS, então os blocos
    // continuam inteiros, e o deslocamento de até meio pixel nunca mostra o fundo na borda.
    const m = this.snapPadPx() / this.appliedRenderScale;
    this.snapMarginCss = m;
    const style = this.host.canvas.style;
    style.left = `${-m}px`;
    style.top = `${-m}px`;
    style.width = `calc(100% + ${2 * m}px)`;
    style.height = `calc(100% + ${2 * m}px)`;
    if (this.host.camera) {
      this.host.camera.aspect = w / h;
      this.host.camera.updateProjectionMatrix();
    }
    // The post chain's offscreen targets must track the render resolution too.
    if (this.composer) {
      this.composer.setSize(w, h);
      this.host.mirror.resize(w, h);
      this.bloomPass.setSize(w, h);
      this.host.air.setSize(w, h);
      (this.finishPass.uniforms.uResolution.value as THREE.Vector2).set(w, h);
    }
  }
}
