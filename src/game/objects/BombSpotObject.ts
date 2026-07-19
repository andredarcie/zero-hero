import type Phaser from 'phaser';

import { BOMB_FRAMES } from '@/game/constants';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// O "local de bomba": a marca visivel onde uma bomba pode ser plantada. O jogo inteiro se opera
// ANDANDO — nao existe botao de usar item — entao plantar a bomba tambem e um passo: o heroi
// pisa na marca segurando a bomba e ela se arma sozinha ali (GameScene.handleTileEntered).
//
// A marca e uma BOMBA-FANTASMA respirando — a mesma linguagem do ghost da ponte no bridgeSpot
// ("da pra construir aqui" = a estrutura translucida no lugar). Quando o heroi chega com a bomba,
// o fantasma vira a bomba real no mesmo tile e no mesmo tamanho: a leitura e "o desenho se
// materializou".
//
// O fantasma e uma SILHUETA ROXA (tintFill), nao a arte crua: a bomba e preta, e um sprite preto
// translucido sobre chao escuro simplesmente nao existe na tela. O roxo e o mesmo indigo do
// contorno dos pickups (ItemPickup.OUTLINE_COLOR) — a cor que este jogo ja ensinou a significar
// "isto aqui espera por voce" — e emissivo, porque um affordance precisa ler ate no escuro.
//
// A marca NUNCA bloqueia (e um alvo de passo, como um item no chao) e e gasta de uma vez: usada
// a bomba, o fantasma some — o lugar ja cumpriu o papel.

const GHOST_SIZE = 0.62; // exatamente o tamanho da bomba plantada (GameScene.placeBombAt)
const GHOST_COLOR = 0x9d7bff; // o indigo dos pickups — a cor de "vem ate aqui"
const BREATHE_MS = 1100;
const GHOST_ALPHA_LO = 0.3;
const GHOST_ALPHA_HI = 0.68;

export class BombSpotObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly ghost: Billboard3D;
  private spent = false;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    // Ground layer: pisar na marca E o mecanismo, entao o heroi divide este tile o tempo todo
    // (ver DEPTH_LAYER — sem isso os dois quads sao coplanares e o fantasma pisca atraves dele).
    this.ghost = world3d()
      .addBillboard('bomb-item', BOMB_FRAMES.item, { emissive: true, depthLayer: 'ground' })
      .setTintFill(GHOST_COLOR)
      .setPosition(worldX, worldY)
      .setDisplaySize(GHOST_SIZE, GHOST_SIZE)
      .setAlpha(GHOST_ALPHA_LO);
    scene.tweens.add({
      targets: this.ghost,
      alpha: GHOST_ALPHA_HI,
      duration: BREATHE_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  public get isSpent(): boolean {
    return this.spent;
  }

  /** A bomba real chegou: o fantasma se materializou — a marca esta gasta e some. */
  public use(): boolean {
    if (this.spent) return false;
    this.spent = true;
    this.scene.tweens.killTweensOf(this.ghost);
    this.ghost.setVisible(false);
    return true;
  }

  public render(_tileSize: number, _camera: WorldCamera): void {
    // Static in world space — the 3D camera does the moving now.
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.ghost);
    this.ghost.destroy();
  }
}
