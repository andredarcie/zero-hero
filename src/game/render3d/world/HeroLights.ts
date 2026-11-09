// A LUZ QUE ANDA COM O HERÓI: a tocha na mão (a luz, o halo, o tremor da chama) e a vista dele, o disco que acende o
// chão em volta quando a noite fecha.

import * as THREE from 'three';
import { platform } from '@/game/platform/platform';
import { makeFireGlowMaterial, setFireGlow } from '../glowMaterials';
import type { World3D } from '../World3D';
import { FIRE_COLOR, FIRE_COOL, FIRE_HOT } from './worldDefs';

/**
 * A rampa da VISTA DO HERÓI — a mesma pintura de bandas, na cor OPOSTA à do fogo.
 *
 * Fogo é ouro; a vista é o cinza-lunar da própria noite (a família do `moonColor`), e ela tem de
 * ser assim por duas razões: uma poça quente em volta do herói leria como tocha acesa — ele
 * pareceria carregar fogo que não tem — e roubaria da fogueira a única cor quente do mundo, que é
 * o contraste em que este jogo inteiro se apoia. Fria, ela lê como o escuro CEDENDO, não como
 * chama. Cravada no arquivo porque ela só existe de noite (`heroSightGlow` = 0 no DAY_SKY).
 */
const SIGHT_RAMP_CORE: THREE.IUniform<THREE.Color> = { value: new THREE.Color('#cdd6e6') };
const SIGHT_RAMP_MID: THREE.IUniform<THREE.Color> = { value: new THREE.Color('#8f9cba') };
const SIGHT_RAMP_RIM: THREE.IUniform<THREE.Color> = { value: new THREE.Color('#4a5a7d') };
/**
 * A vista NÃO TREME. O `uLightWobble` é o campo de ruído que amassa os anéis de uma poça de fogo —
 * é chama imperfeita, e é a assinatura do fogo. Emprestá-lo para a vista faria o herói parecer
 * carregar uma tocha invisível; ela é firme porque é o olho dele, não uma chama.
 */
const zeroWobbleUniform: THREE.IUniform = { value: 0 };

/** O que HeroLights usa de World3D. */
export type HeroLightsHost = Pick<World3D, 'cam' | 'params' | 'projection' | 'scene' | 'screen'>;

export class HeroLights {
  private torchGlow?: THREE.Mesh; // the carried flame's visible warm pool (like a fire's)
  // A VISTA do herói: onde ele está, para onde olha, e quanto dela existe agora (a cut-scene a
  // apaga). Escrita por setHeroSight; projetada na tela e entregue ao post em updateHeroSight —
  // pela mesma razão do torch, a câmera deste frame só está pronta dentro do render.
  private readonly sight = { x: 0, y: 0, fx: 0, fy: 1, strength: 0 };
  /** O disco visível da vista: a poça fria no chão. Nasce no construtor, com as luzes. */
  private sightGlow?: THREE.Mesh;

  public heroLight?: THREE.PointLight;
  public torchLight?: THREE.PointLight;
  // The carried torch is a MOBILE campfire: same reach, flicker and warm glow, riding
  // the hero. State set each frame by setTorchLight; driven (flicker) in updateTorch.
  public readonly torch = {
    x: 0, y: 0, strength: 0, level: 1,
    seed: Math.random() * Math.PI * 2, noise: 0, flare: 0, flareTarget: 0, flareTimer: 0,
  };

  public constructor(private readonly host: HeroLightsHost) {}

  /**
   * The hero's carried flame. It's the SAME light a campfire casts — same reach,
   * decay, warm colour, flicker and visible glow pool — just riding the hero and
   * scaled by fuel (strength01). Only the state is stored here; updateTorch() (in
   * render) drives the flicker so the torchlight dances exactly like a fire.
   */
  public setTorchLight(worldX: number, worldY: number, strength01: number): void {
    this.torch.x = worldX;
    this.torch.y = worldY;
    this.torch.strength = Math.max(0, strength01);
  }

  /**
   * The carried torch's light + ground pool. Built eagerly (from sealLights) rather
   * than on the first lit torch: creating a PointLight mid-run recompiles every lit
   * material in the scene, so the player used to eat a hitch the moment the flame took.
   */
  public ensureTorchLight(): { light: THREE.PointLight; glow: THREE.Mesh } {
    if (!this.torchLight) {
      this.torchLight = new THREE.PointLight(FIRE_COLOR, 0, this.host.params.fireDist, this.host.params.fireDecay);
      this.host.scene.add(this.torchLight);
    }
    if (!this.torchGlow) {
      const glowGeo = new THREE.PlaneGeometry(1, 1);
      glowGeo.rotateX(-Math.PI / 2);
      this.torchGlow = new THREE.Mesh(glowGeo, makeFireGlowMaterial());
      this.torchGlow.renderOrder = 2;
      this.host.scene.add(this.torchGlow);
    }
    return { light: this.torchLight, glow: this.torchGlow };
  }

  /** Drive the carried torch as a mobile campfire (same dance as addFireLight's fires). */
  public updateTorch(dt: number, t: number): void {
    const s = this.torch;
    const { light, glow } = this.ensureTorchLight();
    if (s.strength <= 0) {
      light.intensity = 0;
      (glow.material as THREE.MeshBasicMaterial).opacity = 0;
      return;
    }
    // The exact firelight dance (slow swell + flicker + shimmer + jitter + log-pop flare).
    s.noise += (Math.random() - 0.5) * 0.6;
    s.noise *= 0.85;
    const nz = Math.max(-1, Math.min(1, s.noise));
    s.flareTimer -= dt;
    if (s.flareTimer <= 0) {
      s.flareTarget = Math.random() < 0.35 ? Math.random() * 0.6 - 0.15 : 0;
      s.flareTimer = 0.25 + Math.random() * 1.6;
    }
    s.flare += (s.flareTarget - s.flare) * Math.min(1, dt * 7);
    const dance =
      0.12 * Math.sin(t * 1.9 + s.seed) +
      0.09 * Math.sin(t * 5.7 + s.seed * 2.1) +
      0.05 * Math.sin(t * 12.3 + s.seed * 3.7) +
      0.11 * nz + s.flare;
    const level = Math.max(0.4, 1 + dance);
    s.level = level;
    // A handheld flame reads a touch smaller than a full campfire, but same light model.
    const TORCH_SCALE = 0.85;
    light.distance = this.host.params.fireDist;
    light.decay = this.host.params.fireDecay;
    light.intensity = this.host.params.fireIntensity * TORCH_SCALE * s.strength * level;
    light.position.set(
      s.x + 0.05 * Math.sin(t * 4.6 + s.seed) + nz * 0.04,
      1.0,
      s.y + 0.04 * Math.cos(t * 3.9 + s.seed * 1.5) + nz * 0.03,
    );
    const warm = Math.max(0, Math.min(1, (level - 0.75) / 0.7));
    light.color.copy(FIRE_COOL).lerp(FIRE_HOT, warm);
    // The visible warm pool on the ground — what makes the torch read as a light source.
    const gSize = this.host.params.fireGlowSize * TORCH_SCALE * (0.95 + 0.08 * (level - 1));
    setFireGlow(
      glow, light.position.x, light.position.z, gSize,
      s.strength * this.host.params.fireGlowStrength * TORCH_SCALE * (0.8 + 0.2 * level),
    );
  }

  /**
   * A LUZ PRÓPRIA DO HERÓI — a vista dele, e por que ela é uma CURVA e não uma lâmpada.
   *
   * A lâmpada existe (`heroLight`, neutra e fraca, logo abaixo) e à noite ela não pode mostrar
   * nada. A conta é esta, e vale para QUALQUER luz nova que alguém queira pendurar no herói:
   * `lightCap` (1.55) limita a soma da luz DIRETA a `albedo × cap − ambiente`, a ambiente de 8.5
   * já gasta ~1.24 e a lua gasta o resto — sobra ~2% de vermelho no chão aberto. Uma PointLight a
   * mais entrega irradiância de sobra e o teto joga tudo fora: o chão à volta do herói continua
   * exatamente com a mesma cor. (É por isso que a fogueira precisa do disco aditivo para ler como
   * luz: a PointLight dela também bate no teto.)
   *
   * Então a vista é o que skyPreset.ts já ensina: **quem levanta um quadro é a CURVA**. O post
   * aplica um `pow` LOCAL, centrado nos pés dele e pendendo para onde ele olha — os graves em
   * volta abrem, o 1 continua 1, e o longe fica no escuro em que estava. Três consequências que
   * fazem dela uma VISÃO e não uma auréola:
   *
   *   · **Ninguém mais a vê.** Ela não é matéria na cena: não acende bicho, não derrete o escuro
   *     de uma cova, não conta como fogo para `nearestLitFireInto` — não projeta sombra nenhuma.
   *   · **Ela cede à luz de verdade.** O `pow` abre o grave e não mexe no alto, então dentro da
   *     poça de uma fogueira ela não soma quase nada. A economia de acender o mundo fica de pé:
   *     a vista mostra o tile em que ele pisa, a fogueira é que abre a região.
   *   · **Ela não é banda.** Todo desenho de luz deste jogo é escadinha de pixel art (o disco da
   *     fogueira, o `lightSteps`); esta não, porque não é luz caindo no chão — é o olho.
   *
   * `strength01` é a mesma da lâmpada: a cut-scene da primeira fogueira a apaga e a devolve.
   */
  public setHeroSight(
    worldX: number, worldY: number, faceX: number, faceY: number, strength01: number,
  ): void {
    const s = Math.max(0, strength01);
    this.sight.x = worldX;
    this.sight.y = worldY;
    // Normalizado aqui, uma vez: o `facing` do controlador é um passo de tile (±1, 0), mas um
    // diagonal futuro entraria como (1,1) e esticaria o pêndulo em √2 sem ninguém pedir.
    const len = Math.hypot(faceX, faceY) || 1;
    this.sight.fx = faceX / len;
    this.sight.fy = faceY / len;
    this.sight.strength = s;

    // A lâmpada segue a MESMA frente da vista (uma coisa só olhando para um lado só), ainda que o
    // teto acima quase não a deixe aparecer — com o teto solto, ou fora do chão aberto, ela existe.
    // Metade do pêndulo: ela mora no CORPO (y = 1.2) e a vista mora no chão à frente dos pés, então
    // pendê-la o mesmo tanto tiraria a luz de dentro do herói que ela existe para banhar.
    const lean = this.host.params.heroSightLean;
    const light = this.ensureHeroLight();
    light.position.set(worldX + this.sight.fx * lean * 0.5, 1.2, worldY + this.sight.fy * lean * 0.5);
    light.intensity = this.host.params.heroLight * s;
  }

  public ensureHeroLight(): THREE.PointLight {
    if (!this.heroLight) {
      this.heroLight = new THREE.PointLight('#e8e9ec', 0, 8, 1.6);
      this.host.scene.add(this.heroLight);
    }
    return this.heroLight;
  }

  /**
   * O disco da vista: o MESMO quad de poça que a fogueira e a tocha usam (mesmo programa, mesma
   * escadinha de banda no grid da arte), com a rampa fria e sem tremor.
   *
   * Ele existe porque a curva sozinha não tem SILHUETA. Um `pow` local clareia uma região e nada
   * mais — sem borda, sem centro, sem forma —, e a olho isso lê como "a tela está mais clara", não
   * como "o herói tem luz". Neste renderizador quem dá forma a uma luz é sempre o disco aditivo;
   * está escrito no doc do `acquireGlow` desde a primeira fogueira. A curva revela, o disco é o
   * desenho — e as duas juntas são a vista.
   */
  public ensureSightGlow(): THREE.Mesh {
    if (!this.sightGlow) {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.rotateX(-Math.PI / 2);
      this.sightGlow = new THREE.Mesh(geo, makeFireGlowMaterial({
        ramp: { core: SIGHT_RAMP_CORE, mid: SIGHT_RAMP_MID, rim: SIGHT_RAMP_RIM },
        wobble: zeroWobbleUniform,
      }));
      this.sightGlow.renderOrder = 2;
      this.host.scene.add(this.sightGlow);
    }
    return this.sightGlow;
  }

  /**
   * Entrega a vista ao post: onde ela cai na TELA e que tamanho tem lá.
   *
   * Ela é medida por PROJEÇÃO, nunca por uma conta de tela. O herói mora ~no centro, então a
   * tentação é cravar (0.5, 0.5) e um raio em pixels — e as duas partes quebram. O centro
   * escorrega numa fala (`setViewOffset` desloca o herói para caber na caixa de diálogo), e o
   * raio não é um círculo: a câmera olha 48° para baixo, então um disco de chão chega à tela como
   * uma ELIPSE, mais larga que alta.
   *
   * **A ARMADILHA, e ela custou uma versão inteira: a medida tem de ser CENTRADA.** A primeira
   * tirava o semi-eixo vertical projetando um ponto o raio inteiro AO SUL — e o sul é a direção da
   * CÂMERA. A perspectiva não é simétrica nesse eixo: 4,5 tiles ao sul caem quase no colo da lente
   * e projetaram 955px numa tela de 800. A elipse saía maior que o quadro, `length(sd)` dava ~0 em
   * todo pixel e a "vista" virava um `lift` GLOBAL — o mundo inteiro clareava por igual, que é
   * exatamente parecer que nada aconteceu.
   *
   * Então mede-se o tamanho de UM tile, com um par simétrico em volta do herói (±1 leste/oeste,
   * ±1 norte/sul) e uma diferença centrada: o erro de primeira ordem da perspectiva se cancela, e
   * o raio vira uma multiplicação. Continua seguindo `fov`, `camHeight` e inclinação de graça.
   */
  public updateHeroSight(): void {
    const u = this.host.screen.finishPass.uniforms;
    const glow = this.ensureSightGlow();
    const glowMat = glow.material as THREE.MeshBasicMaterial;
    const amount = this.host.params.heroSight * this.sight.strength;
    const glowAmount = this.host.params.heroSightGlow * this.sight.strength;
    // Escondido de verdade, não só transparente: de dia os dois knobs são 0, e um quad aditivo de
    // cinco tiles desenhado a cada frame para somar zero é overdraw pago à toa.
    glow.visible = glowAmount > 0.002;
    if (amount <= 0.0005 && glowAmount <= 0.0005) {
      u.uSight.value = 0;
      glowMat.opacity = 0;
      return;
    }
    const r = Math.max(0.5, this.host.params.heroSightTiles);
    const lean = this.host.params.heroSightLean;
    // Os pés, não o peito: a vista é o chão que ele distingue. E ela pende para a frente dele.
    const cx = this.sight.x + this.sight.fx * lean;
    const cy = this.sight.y + this.sight.fy * lean;
    const at = this.host.projection.projectTile(cx, cy, 0);
    // Um tile em pixels, nos dois eixos, por diferença CENTRADA (ver o doc acima).
    const pxPerTileX = Math.abs(
      this.host.projection.projectTile(cx + 1, cy, 0).x - this.host.projection.projectTile(cx - 1, cy, 0).x,
    ) / 2;
    const pxPerTileY = Math.abs(
      this.host.projection.projectTile(cx, cy + 1, 0).y - this.host.projection.projectTile(cx, cy - 1, 0).y,
    ) / 2;
    // Em UV do CANVAS, que pode ter a margem e o deslocamento da câmera de pixel suave.
    const m = this.host.screen.snapMarginCss;
    const w = Math.max(1, platform().display.width + 2 * m);
    const h = Math.max(1, platform().display.height + 2 * m);
    u.uSight.value = amount;
    (u.uSightAt.value as THREE.Vector2).set(
      (at.x + m - this.host.cam.snapShiftX) / w, 1 - (at.y + m - this.host.cam.snapShiftY) / h,
    );
    (u.uSightR.value as THREE.Vector2).set(
      Math.max(0.02, (r * pxPerTileX) / w),
      Math.max(0.02, (r * pxPerTileY) / h),
    );

    // O disco, no MUNDO (o quad é chão de verdade, então aqui não há projeção nenhuma). Ele pende
    // METADE do que a curva pende: a poça tem de continuar contendo os pés dele — uma luz que sai
    // de baixo do corpo deixa de parecer que é dele.
    setFireGlow(
      glow,
      this.sight.x + this.sight.fx * lean * 0.5,
      this.sight.y + this.sight.fy * lean * 0.5,
      r * 2,
      glowAmount,
    );
  }
}
