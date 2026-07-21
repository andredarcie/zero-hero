import type Phaser from 'phaser';

import { ASSET_KEYS } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { TallGrassObject } from './TallGrassObject';
import type { WorldProp } from './WorldProp';

// O canteiro: um pequeno buraco cavado no chao onde uma SEMENTE (o produto da foice) pode ser
// plantada. O ciclo completo, todo operado andando (o jogo nao tem botao de usar item):
//
//   buraco  — anda-se por cima; PISAR nele segurando sementes planta (handleTileEntered).
//   semeado — a semente esta na terra, mas o monte so SE ERGUE quando o heroi sai do tile
//             (a mesma regra do item dropado que arma ao sair de cima): um domo nunca pode
//             nascer bloqueando por baixo dos pes de ninguem.
//   monte   — a semente coberta: um domo de terra que BLOQUEIA e espera agua. BUMP com o balde
//             cheio rega (a linguagem do douse da fogueira); a terra escurece, molhada.
//   regado  — germinando. Depois de GROW_MS (e com o tile livre), o MATO brota de verdade:
//             um TallGrassObject real entra no mundo com a animacao de sproutIn — e dai em
//             diante e mato como qualquer outro: bloqueia, conduz fogo, cai a foice.
//   grown   — o mato consumido (cortado → novas sementes; queimado → nada) vira toco, e o
//             canteiro REABRE o buraco depois de um respiro: o ciclo e renovavel de proposito,
//             porque a semente e a unica fonte renovavel de combustivel posicionavel do jogo.
//
// O spot possui so o buraco e o monte; o mato crescido pertence a GameScene.tallGrasses (fogo,
// foice e colisao ja o encontram la). GameScene guarda o par spot↔mato e chama reopen().

type SpotState = 'hole' | 'sown' | 'mound' | 'watered' | 'grown';

const HOLE_SIZE = 0.9;
const MOUND_SIZE = 0.72; // domo baixo, dentro do tile (nada vaza do tile)
const WET_TINT = 0x9a8fae; // terra molhada: mais escura e fria — multiplicado sobre a arte
const POP_MS = 240; // o monte se ergue quando a semente e plantada

export class PlantSpotObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  /** O mato que este canteiro fez brotar — GameScene o registra e o colhe de volta. */
  public grownGrass?: TallGrassObject;
  /** GameScene marcou a reabertura (evita agendar duas vezes no loop de update). */
  public reopenPending = false;

  private readonly scene: Phaser.Scene;
  private readonly hole: Billboard3D;
  private mound?: Billboard3D;
  private state: SpotState = 'hole';

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    // O buraco deita no chao como o toco de grama (flat) — e um recorte no terreno, nao um cartaz.
    this.hole = world3d()
      .addBillboard(ASSET_KEYS.plantHole, 0, { flat: true, flatY: 0.018 })
      .setPosition(worldX, worldY)
      .setDisplaySize(HOLE_SIZE, HOLE_SIZE);
  }

  public get isHole(): boolean {
    return this.state === 'hole';
  }

  public get isSown(): boolean {
    return this.state === 'sown';
  }

  public get isMound(): boolean {
    return this.state === 'mound';
  }

  public get isWatered(): boolean {
    return this.state === 'watered';
  }

  /** O monte (seco ou regado) e um corpo no caminho — e o alvo do bump do balde. */
  public get blocking(): boolean {
    return this.state === 'mound' || this.state === 'watered';
  }

  /**
   * Semente semeada no passo. O monte NAO nasce ainda — o heroi esta em cima do tile; a
   * GameScene chama raiseMound() no frame em que ele sai (um domo nunca bloqueia por baixo
   * dos pes). Ate la o buraco segue visivel: a semente esta dentro dele.
   */
  public plant(): boolean {
    if (this.state !== 'hole') return false;
    this.state = 'sown';
    getSoundManager().playGrassCut(); // terra revirada — o farfalhar seco serve
    return true;
  }

  /** O heroi saiu de cima: o buraco se fecha sob o monte de terra fresca que se ergue. */
  public raiseMound(): void {
    if (this.state !== 'sown') return;
    this.state = 'mound';
    this.hole.setVisible(false);
    this.mound = world3d()
      .addBillboard(ASSET_KEYS.plantMound, 0, { groundShadow: true })
      .setPosition(this.worldX, this.worldY)
      .setDisplaySize(MOUND_SIZE * 0.3, MOUND_SIZE * 0.3);
    this.scene.tweens.add({
      targets: this.mound,
      displayWidth: MOUND_SIZE,
      displayHeight: MOUND_SIZE,
      duration: POP_MS,
      ease: 'Back.easeOut',
    });
  }

  /**
   * Balde d'agua no monte: a terra escurece, molhada, e a germinacao comeca. `onGrown` dispara
   * apos `growMs` — a GameScene decide o instante real do brotar (espera o tile estar livre).
   */
  public water(growMs: number, onGrown: () => void): boolean {
    if (this.state !== 'mound' || !this.mound) return false;
    this.state = 'watered';
    this.mound.setTint(WET_TINT);
    // Um suspiro da terra bebendo: o monte assenta um fio e volta.
    this.scene.tweens.add({
      targets: this.mound,
      displayHeight: MOUND_SIZE * 0.92,
      duration: 180,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
    this.scene.time.delayedCall(growMs, onGrown);
    return true;
  }

  /** O mato brotou (GameScene o criou e registrou): o monte ja fez seu papel e some sob ele. */
  public setGrown(grass: TallGrassObject): void {
    this.state = 'grown';
    this.grownGrass = grass;
    this.mound?.destroy();
    this.mound = undefined;
  }

  /** O mato deste canteiro foi consumido e decaiu: o buraco reabre — plante de novo. */
  public reopen(): void {
    this.state = 'hole';
    this.grownGrass = undefined;
    this.reopenPending = false;
    this.hole.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.hole, alpha: 1, duration: 300, ease: 'Sine.easeOut' });
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.hole);
    if (this.mound) this.scene.tweens.killTweensOf(this.mound);
    this.hole.destroy();
    this.mound?.destroy();
    this.mound = undefined;
  }
}
