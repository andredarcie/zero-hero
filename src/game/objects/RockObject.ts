import Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

// A rock blocks its tile until the hero breaks it with the pickaxe: the first blow cracks it
// (swaps to the cracked sprite), the second shatters it and the tile opens. Both blows shove the
// rock off the strike and squash it — a struck stone that only stands there reads as a painted
// backdrop, and the pick as a wand.
//
// The debris the blows throw is NOT here: it belongs to GameScene.spawnRockDebris, because the
// chips are real objects in the 3D world (they arc, they land, they lie there), not a decoration
// hanging off the rock's own sprite.
//
// ── A PEDRA DE FERRO e a mesma classe, mas NAO e uma pedra: e um VEIO ────────────────────────
// `ore` deixou de ser so arte. A rocha comum e uma FECHADURA (duas picaretadas e o tile abre);
// a de minerio e um POCO — ela nunca quebra, nunca abre o tile, e a cada TRES picaretadas
// cospe um bloco de ferro e volta ao comeco. E a primeira fonte RENOVAVEL de materia do jogo,
// e e por isso que o astronauta paga por ferro: minerar e uma atividade, nao um destino.
// O progresso do ciclo e a PROPRIA arte (a lei do estado que muda um pixel): 1a pancada racha,
// 2a so recua (a rachadura segura o placar), 3a produz — e a pedra INTEIRA de novo e o desenho
// de "recarregado". Quem solta o item e o GameScene (dropOreYield), nunca esta classe.
//
// E uma classe so, e nao uma subclasse: a diferenca cabe num booleano, enquanto duas classes
// significariam duas copias do recuo, do colapso e do contrato de colisao — que e exatamente a
// maneira confiavel de as duas discordarem daqui a um mes.

type RockState = 'intact' | 'cracked' | 'broken';

/**
 * O que uma pancada de picareta fez: 'none' = nao havia pedra de pe; 'struck' = acertou e a
 * pedra segue no lugar; 'shattered' = a pedra comum abriu o tile; 'yielded' = o veio de ferro
 * completou o ciclo e PRODUZIU (a pedra continua de pe e bloqueando).
 */
export type RockSmashResult = 'none' | 'struck' | 'shattered' | 'yielded';

/** Quantas picaretadas o veio pede por bloco de ferro. Mais que as duas da pedra comum de
 *  proposito: a fonte infinita paga em tempo o que nunca paga em esgotamento. */
const ORE_BLOWS_PER_YIELD = 3;

/** As duas artes de cada tipo de pedra. A comum guarda o par em dois PNGs (e mais velha que o
 *  sprite factory); o minerio guarda os dois estados como frames 0 e 1 de um sheet so. */
const LOOK = {
  plain: { intact: ['rock', 0], cracked: ['rock-cracked', 0] },
  ore: { intact: ['iron-rock', 0], cracked: ['iron-rock', 1] },
} as const;

/** The rock's resting size in tiles — every squash and every collapse springs back to this. */
const SIZE = 0.88;

export class RockObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D;
  private state: RockState = 'intact';
  /** O placar do veio: pancadas dadas dentro do ciclo atual (so a pedra de minerio conta). */
  private oreBlows = 0;

  /** Minerio: a rocha que nunca quebra — a cada 3 picaretadas ela PRODUZ um bloco de ferro. */
  public readonly ore: boolean;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number, ore = false) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.ore = ore;
    const look = LOOK[ore ? 'ore' : 'plain'];
    this.sprite = world3d()
      .addBillboard(look.intact[0], look.intact[1], { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(SIZE, SIZE)
      // The rock art is near-white, and a white sprite under the night ambient blows out
      // to a glaring bloom halo (the "neon marble" at the north shrine). A NEUTRAL light
      // grey keeps the hue white — the rock still reads white against the dark — while
      // pulling the peak just under the bloom threshold so it stops glowing. (User: the
      // white must STAY white; only the glow goes.)
      .setTint(0xc9c9c9);
  }

  public get blocking(): boolean {
    return this.state !== 'broken';
  }

  /**
   * One pickaxe blow, landing from direction (dirX, dirY) — the unit vector pointing from the
   * hero INTO the rock. The result says what the blow DID (see RockSmashResult); dropping the
   * spoil of 'shattered'/'yielded' is the caller's job.
   */
  public smash(dirX: number, dirY: number): RockSmashResult {
    if (!this.blocking) return 'none';

    // O VEIO: um ciclo de 3 pancadas que nunca destroi a pedra. 1a racha (o placar visivel),
    // 2a so recua, 3a produz e REARMA — a arte volta a inteira, que e o desenho de "cheio".
    if (this.ore) {
      this.oreBlows += 1;
      if (this.oreBlows >= ORE_BLOWS_PER_YIELD) {
        this.oreBlows = 0;
        this.sprite.setTexture(LOOK.ore.intact[0], LOOK.ore.intact[1]);
        this.yieldPulse();
        return 'yielded';
      }
      if (this.oreBlows === 1) this.sprite.setTexture(LOOK.ore.cracked[0], LOOK.ore.cracked[1]);
      this.recoil(dirX, dirY);
      return 'struck';
    }

    if (this.state === 'intact') {
      this.state = 'cracked';
      const cracked = LOOK.plain.cracked;
      this.sprite.setTexture(cracked[0], cracked[1]);
      this.recoil(dirX, dirY);
      return 'struck';
    }

    this.state = 'broken';
    this.collapse();
    return 'shattered';
  }

  /** Brief shake for a bump without the pickaxe, so it reads as solid. */
  public shake(): void {
    if (!this.blocking) return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAngle(0);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -3, to: 3 },
      duration: 50,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  /** The blow lands: the rock is driven back into itself, squats under the pick, and springs out. */
  private recoil(dirX: number, dirY: number): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAngle(0);
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.worldX + dirX * 0.06,
      y: this.worldY + dirY * 0.06,
      scaleX: SIZE * 1.10, // squashed ALONG the blow: it spreads as it takes the weight
      scaleY: SIZE * 0.86,
      duration: 55,
      ease: 'Quad.easeOut',
      hold: 25, // the beat where the pick is still buried in it
      yoyo: true,
      onComplete: () => {
        this.sprite.setPosition(this.worldX, this.worldY).setDisplaySize(SIZE, SIZE);
      },
    });
  }

  /** A 3a pancada do veio: o mesmo inchaco do colapso, mas ele VOLTA — a pedra pariu, nao morreu. */
  private yieldPulse(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setPosition(this.worldX, this.worldY).setAngle(0);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: SIZE * 1.14,
      scaleY: SIZE * 1.14,
      duration: 45,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => this.sprite.setDisplaySize(SIZE, SIZE),
    });
  }

  /** The last blow: the rock swells once and bursts, leaving the tile (and its shadow) empty. */
  private collapse(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setPosition(this.worldX, this.worldY).setAngle(0);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: SIZE * 1.14,
      scaleY: SIZE * 1.14,
      duration: 40,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.sprite,
          scaleX: 0.04,
          scaleY: 0.04,
          duration: 90,
          ease: 'Back.easeIn',
          onComplete: () => this.sprite.setVisible(false),
        });
      },
    });
    // It must not block for those 130ms of theatre: `state` is already 'broken', and collision
    // reads the state, never the sprite.
  }

  // No render(): the rock is a 3D billboard placed in world space at construction, and its debris
  // now lives in the world too — so, unlike the props that still paint 2D FX on the canvas, it has
  // nothing to re-project when the camera shifts. (The old render() only cached a screen position
  // for the 2D shards, and reprojectStatic is the only thing that ever called it.)

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
