// A CÂMERA DO MUNDO 3D: seguir o alvo, o balanço de mão, o tremor, e o encaixe no pixel (a câmera de pixel suave).

import { isReducedMotion } from '@/game/runtime/accessibility';
import { getCameraZoom } from '@/game/runtime/graphicsSettings';
import * as THREE from 'three';
import { platform } from '@/game/platform/platform';
import type { World3D } from '../World3D';

/**
 * O BAQUE DIRECIONAL (ver `shake`): quanto do impacto é uma INCLINAÇÃO na direção do golpe e
 * quanto continua sendo o chacoalho aleatório.
 *
 * A inclinação é a menor das duas de propósito. O que um impacto tem a dizer sobre si é sobretudo
 * "aconteceu", e só depois "veio dali" — uma câmera que salta forte para um lado a cada golpe
 * cansa em trinta segundos, e o combate deste jogo acerta muitas vezes por briga. Com 0,55 contra
 * 0,7, a direção aparece como um viés que se lê sem se notar.
 *
 * Um tremor SEM direção não passa por nenhuma das duas: ele mantém o chacoalho cheio (fator 1) e
 * sai idêntico ao que sempre foi — a bomba, a pedra quebrando e o portão não mudaram um pixel.
 */
const SHAKE_LEAN = 0.55;
const SHAKE_RATTLE = 0.7;

/** O que CameraRig usa de World3D. */
export type CameraRigHost = Pick<World3D,
  'camTarget' | 'camera' | 'canvas' | 'elapsed' | 'params' | 'projection' | 'renderer' | 'screen'
>;

export class CameraRig {
  private shakeDurMs = 1;
  private shakeAmp = 0;
  /** Para onde o baque inclina, normalizado em espaco de tile. (0,0) = tremor sem direcao. */
  private shakeDirX = 0;
  private shakeDirY = 0;
  private readonly snapScratch = {
    a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), size: new THREE.Vector2(),
  };
  /** A escala da grade da câmera de pixel suave, medida em repouso (ver snapGridScale). */
  private readonly snapScale = { key: '', ppx: 0, ppz: 0, ppy: 0 };
  private readonly snapCamera = new THREE.PerspectiveCamera();
  /** O zoom em uso, e o relógio da última leitura: ele persegue o do jogador para deslizar (ver easeZoom). */
  private zoom = getCameraZoom();
  private zoomAt = 0;

  // Impact kick on the camera (see shake()): amplitude in tiles, decaying to zero.
  public shakeMs = 0;
  /** O deslocamento CSS que o canvas carrega neste quadro (a sobra da câmera de pixel suave). */
  public snapShiftX = 0;
  public snapShiftY = 0;

  public constructor(private readonly host: CameraRigHost) {}

  /**
   * Track the CameraRig's tile position (its camX/camY under screen centre).
   * Snaps every frame: camX/camY already animate smoothly (the movement tween),
   * and the hero must stay pinned at screen centre exactly like the 2D game.
   */
  /**
   * `elevation` e a altura do chao sob o heroi (a serra): a camera sobe e desce com ele, entao no
   * planalto o quadro e o mesmo de embaixo, so que um nivel acima.
   */
  public follow(camX: number, camY: number, _snap = false, elevation = 0): void {
    this.host.camTarget.set(camX + this.host.projection.viewOffsetX, elevation, camY + this.host.projection.viewOffsetY);
    // An impact kick: the camera TRANSLATES (target shifts with it), so the whole diorama
    // jolts as one instead of swinging on a pivot. Decays in render().
    const k = this.shakeMs > 0 ? this.shakeAmp * (this.shakeMs / this.shakeDurMs) : 0;
    // …and under it, always, a slow handheld drift — a camera operator breathing. Tiny (a few
    // hundredths of a tile) and on two out-of-phase periods, so it never reads as a pattern; it
    // just keeps a standing frame from looking frozen.
    const sway = this.host.params.camSway;
    const swayX = Math.sin(this.host.elapsed * 0.23) * sway;
    const swayY = Math.sin(this.host.elapsed * 0.31 + 1.7) * sway * 0.6;
    // A DIRECAO DO BAQUE (ver shake). Sem direcao, `lean` e zero e `rattle` vale 1 — o tremor sai
    // identico ao de sempre, sem uma conta a mais no caminho quente.
    //
    // O eixo `y` do tile vira o eixo VERTICAL da tela e nao a profundidade, de proposito: o que se
    // quer aqui e a tela pular na direcao do golpe, e mexer na profundidade so mudaria a escala do
    // mundo por um instante (um zoom, nao um baque).
    const dirX = this.shakeDirX;
    const dirY = this.shakeDirY;
    const aimed = dirX !== 0 || dirY !== 0;
    const rattle = aimed ? SHAKE_RATTLE : 1;
    const lean = aimed ? SHAKE_LEAN : 0;
    const ox = swayX + (k > 0 ? k * (dirX * lean + (Math.random() * 2 - 1) * rattle) : 0);
    const oy = swayY + (k > 0 ? k * (dirY * lean + (Math.random() * 2 - 1) * rattle) : 0);
    const dist = 1 / this.easeZoom();
    this.host.camera.position.set(
      this.host.camTarget.x + ox,
      this.host.camTarget.y + this.host.params.camHeight * dist + oy,
      this.host.camTarget.z + this.host.params.camBack * dist,
    );
    this.host.camera.lookAt(this.host.camTarget.x + ox, this.host.camTarget.y + 0.4 + oy, this.host.camTarget.z);
    this.host.camera.updateMatrixWorld();
    this.snapCameraToPixel();
  }

  /**
   * O ZOOM DO JOGADOR (graphicsSettings, a régua da HUD): um fator sobre a distância, nos DOIS eixos — o ângulo
   * da câmera não muda (ver worldParams). Ele se soma ao dolly das cenas, que mexe em `camHeight`/`camBack`.
   * A câmera desliza até o valor pedido em ~0,3 s; com "reduzir movimento", ela pula.
   */
  /** O zoom em uso agora (o que desliza até o pedido): a interface o desconta para não mudar de tamanho. */
  public get zoomFactor(): number {
    return this.zoom;
  }

  /** Pula direto para o zoom pedido: o ajuste com o jogo parado redesenha sem o relógio andar (ver ZoomSetup). */
  public snapZoom(): void {
    this.zoom = getCameraZoom();
  }

  private easeZoom(): number {
    const wanted = getCameraZoom();
    const dt = Math.max(0, this.host.elapsed - this.zoomAt);
    this.zoomAt = this.host.elapsed;
    if (isReducedMotion() || Math.abs(wanted - this.zoom) < 1e-4) this.zoom = wanted;
    else this.zoom += (wanted - this.zoom) * (1 - Math.exp(-dt * 12));
    return this.zoom;
  }

  /**
   * A CÂMERA DE PIXEL SUAVE — o mundo parado no grão do buffer, o movimento liso no do aparelho.
   *
   * Quando um pixel desenhado ocupa mais de um pixel do aparelho (modo econômico, celular), uma
   * câmera contínua para a cada quadro num ponto FRACIONÁRIO do buffer: o chão é rasterizado de
   * novo em outra fase e a textura "ferve" (cada texel muda de cor conforme a câmera anda), e a
   * rolagem anda em degraus de pixel inteiro do buffer — 2, 2, 3, 2… — com erro de até meio pixel
   * do buffer, que no celular são dois pixels de tela.
   *
   * A saída é a das câmeras de pixel art em 2D, adaptada à perspectiva: a câmera ANDA em pixels
   * inteiros do buffer (medidos no chão sob o herói, onde está a atenção) e a sobra fracionária vai
   * para um deslocamento CSS do canvas, arredondado ao pixel do APARELHO. O chão perto do foco é
   * rasterizado sempre na mesma fase (para de ferver), e a rolagem que se vê é contínua na
   * resolução da tela. O herói continua contínuo no mundo e, somado ao deslocamento, fica parado no
   * centro da tela. No desktop (um pixel desenhado = um pixel de tela) não há sobra a esconder e
   * nada disto roda.
   *
   * A perspectiva cobra uma margem: a câmera anda em pixel inteiro só na profundidade do foco;
   * linhas muito mais perto ou mais longe ainda recebem uma fração. Por isso o ponto medido é o chão
   * sob o herói, e não o centro da tela.
   */
  private snapCameraToPixel(): void {
    let shiftX = 0;
    let shiftY = 0;
    if (this.host.screen.snapMarginCss > 0 && this.host.params.pixelSnap > 0) {
      const { ppx, ppz, ppy } = this.snapGridScale();
      if (Math.abs(ppx) > 1e-3 && Math.abs(ppz) > 1e-3) {
        // A câmera anda numa grade PRESA AO MUNDO (múltiplos de um pixel do buffer, a partir da
        // origem), nunca presa ao herói: uma âncora no tile dele pularia uma fração de pixel cada
        // vez que ele troca de tile, porque um tile não mede um número inteiro de pixels.
        // Na vertical da tela entram DOIS eixos — o z e a altura, que o balanço de mão sobe e
        // desce —, então a posição vertical em pixels é a soma dos dois, e só o z a corrige.
        const p = this.host.camera.position;
        const h = p.x * ppx;
        const v = p.z * ppz + p.y * ppy;
        const dx = (Math.round(h) - h) / ppx;
        const dz = (Math.round(v) - v) / ppz;
        p.x += dx;
        p.z += dz;
        this.host.camera.updateMatrixWorld();
        // …e o canvas devolve a sobra (a câmera andou dx: o mundo foi -dx na tela), no grão do aparelho.
        const dpr = platform().display.pixelRatio;
        const k = this.host.screen.appliedBlocks;
        shiftX = Math.round(dx * ppx * k) / dpr;
        shiftY = Math.round(dz * ppz * k) / dpr;
      }
    }
    this.setSnapShift(shiftX, shiftY);
  }

  /**
   * A ESCALA DA GRADE da câmera de pixel suave: quantos pixels do buffer um tile de chão anda na
   * tela, nos dois eixos, na profundidade do foco — medida com a câmera EM REPOUSO (altura, recuo e
   * FOV autorados, sem o balanço de mão nem o baque). Constante de propósito: medida na câmera do
   * quadro, ela oscilava ~0,1% com o balanço, e numa grade presa à origem do mundo 0,1% de mil e
   * tantos pixels é mais de um pixel — a grade inteira escorregava e o chão voltava a ferver.
   */
  private snapGridScale(): { ppx: number; ppz: number; ppy: number } {
    const s = this.snapScratch;
    const size = this.host.renderer.getSize(s.size);
    const p = this.host.params;
    // A câmera em repouso inclui o zoom do jogador: é a mesma distância que o quadro usa (ver easeZoom).
    const height = p.camHeight / this.zoom;
    const back = p.camBack / this.zoom;
    const key = `${height}|${back}|${this.host.camera.fov}|${size.x}x${size.y}`;
    if (key !== this.snapScale.key) {
      const cam = this.snapCamera;
      cam.copy(this.host.camera);
      cam.position.set(0, height, back);
      cam.lookAt(0, 0.4, 0);
      cam.updateMatrixWorld();
      const toBuffer = (v: THREE.Vector3): THREE.Vector3 => {
        v.project(cam);
        return v.set((v.x * 0.5 + 0.5) * size.x, (-v.y * 0.5 + 0.5) * size.y, 0);
      };
      const a = toBuffer(s.a.set(0, 0, 0));
      this.snapScale.ppx = toBuffer(s.b.set(1, 0, 0)).x - a.x;
      this.snapScale.ppz = toBuffer(s.c.set(0, 0, 1)).y - a.y;
      // Subir a câmera é o chão descer: o quanto um ponto 1 tile mais ALTO anda na tela (negativo).
      this.snapScale.ppy = toBuffer(s.b.set(0, 1, 0)).y - a.y;
      this.snapScale.key = key;
    }
    return this.snapScale;
  }

  private setSnapShift(shiftX: number, shiftY: number): void {
    if (shiftX !== this.snapShiftX || shiftY !== this.snapShiftY) {
      this.snapShiftX = shiftX;
      this.snapShiftY = shiftY;
      this.host.canvas.style.transform = shiftX || shiftY ? `translate(${shiftX}px, ${shiftY}px)` : '';
    }
  }

  /**
   * Impact kick on the world camera, in TILES (a hit ~0.05, death ~0.3). The 3D world is
   * the diorama now, so a 2D camera shake would only jolt the UI layer above it.
   */
  /**
   * O baque de impacto. `dirX/dirY` sao OPCIONAIS e vem em espaco de TILE (o mesmo par que o golpe
   * usa): com eles a camera ganha um empurrao naquela direcao por cima do chacoalho; sem eles o
   * tremor e exatamente o de antes — aleatorio nos dois eixos, sem uma unica conta a mais.
   *
   * A parte direcional e uma INCLINACAO e nao um solavanco: o chacoalho continua sendo a maior
   * parte do movimento (ver SHAKE_LEAN/SHAKE_RATTLE). Um golpe vindo do oeste e um vindo do leste
   * desenhavam o mesmo tremor, e a direcao e a unica coisa que um impacto tem a dizer sobre si
   * alem de "aconteceu" — mas exagerar isso vira enjoo de camera, que e o defeito oposto e pior.
   */
  public shake(durationMs: number, amplitudeTiles: number, dirX = 0, dirY = 0): void {
    if (isReducedMotion()) return;
    // A landed hit during a fading shake must not cut it short — keep the stronger kick.
    if (this.shakeMs > 0 && amplitudeTiles < this.shakeAmp * (this.shakeMs / this.shakeDurMs)) return;
    this.shakeMs = durationMs;
    this.shakeDurMs = Math.max(1, durationMs);
    this.shakeAmp = amplitudeTiles;
    const len = Math.hypot(dirX, dirY);
    this.shakeDirX = len > 1e-4 ? dirX / len : 0;
    this.shakeDirY = len > 1e-4 ? dirY / len : 0;
  }
}
