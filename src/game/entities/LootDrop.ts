import Phaser from 'phaser';

import { SCENE_DEPTHS } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, FX_RING_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

/** Tiles. O tamanho aparente de um drop que salta de uma pedra e fica esperando no chão. */
const DROP_SIZE = 0.5;

/**
 * A CARA de um drop que se pega ANDANDO — o único caminho que ainda usa esta física é o bloco
 * de minério que o veio cospe (ver GameScene.spawnOreLoot). Quem chama passa a própria arte; o
 * corpo, o arco, o pouso, o ímã e o voo de absorção são os mesmos, porque a física do "pegar de
 * passagem" é UMA só.
 *
 * Houve aqui uma MOEDA, e ela era a dona desta classe: o dinheiro do jogo caía de todo corpo que
 * morria, espalhava pelos tiles vizinhos e voava para um contador. A moeda inteira foi REMOVIDA
 * (não há carteira, não há preço, não há balcão) e o que sobrou é a mecânica de saltar-e-pousar,
 * que nunca teve nada a ver com dinheiro. Junto com ela saiu o GIRO de quatro poses: era a fita
 * da moeda mostrando o fio, e nenhum drop de hoje tem verso.
 */
export type LootLook = { key: string; frame?: number; size?: number };

/**
 * O ÍMÃ: de onde o drop começa a correr para o herói, em tiles.
 *
 * É a diferença entre "pisar num item" e "receber". O drop ACELERA até a mão, e quem chega perto
 * de um punhado vê o punhado inteiro vir junto.
 */
const MAGNET_TILES = 2.1;
/** Onde o ímã entrega: perto o bastante para o voo de absorção começar colado no herói. */
const MAGNET_CATCH = 0.3;
const MAGNET_ACCEL = 26; // tiles/s² — sai devagar e chega rápido, que é o que lê como atração

export class LootDrop {
  private readonly sprite: Billboard3D;
  private readonly pos: { x: number; y: number; angle: number };
  private readonly look: Required<LootLook>;
  private collectable = false;
  private collected = false;
  /** Velocidade atual da corrida até o herói (0 = pousado, esperando). */
  private lureSpeed = 0;
  // Last projected screen spot — anchors the 2D absorb flight on collect.
  private lastScreen = { x: 0, y: 0 };
  private lastTileSize = 48;

  public constructor(
    private readonly scene: Phaser.Scene,
    startWorldX: number,
    startWorldY: number,
    targetWorldX: number,
    targetWorldY: number,
    spawnDelay: number,
    look: LootLook,
  ) {
    this.pos = { x: startWorldX, y: startWorldY, angle: 0 };
    this.look = { key: look.key, frame: look.frame ?? 0, size: look.size ?? DROP_SIZE };

    // Full-bright: a drop must read even in the dark. GROUND layer: it exists to be walked
    // over — it is the tile the hero is heading for — so without a declared layer the two quads
    // go coplanar and it strobes through his boots (see DEPTH_LAYER).
    this.sprite = world3d()
      .addBillboard(this.look.key, this.look.frame, { emissive: true, depthLayer: 'ground' })
      .setPosition(startWorldX, startWorldY)
      .setDisplaySize(0, 0)
      .setAlpha(0);

    this.scene.tweens.add({
      targets: this.sprite,
      displayWidth: this.look.size,
      displayHeight: this.look.size,
      alpha: 1,
      duration: 120,
      delay: spawnDelay,
      ease: 'Back.easeOut',
      onComplete: () => this.startScatter(targetWorldX, targetWorldY, spawnDelay),
    });
  }

  public get tileX(): number { return Math.round(this.pos.x); }
  public get tileY(): number { return Math.round(this.pos.y); }
  public get isCollectable(): boolean { return this.collectable; }
  public get isCollected(): boolean { return this.collected; }

  public collect(absorbTarget: { x: number; y: number }, onComplete: () => void): void {
    this.collected = true;
    this.collectable = false;

    this.scene.tweens.killTweensOf(this.pos);
    this.scene.tweens.killTweensOf(this.sprite);

    this.burst();
    // The world drop pops in place (3D), then a 2D twin carries the flight to the absorb
    // anchor — the hero, because what gets stashed flies to the body.
    this.scene.tweens.add({
      targets: this.sprite,
      displayWidth: this.look.size * 1.6,
      displayHeight: this.look.size * 1.6,
      duration: 80,
      ease: 'Power2.easeOut',
      yoyo: true,
      onComplete: () => {
        this.sprite.setVisible(false);
        const size = Math.max(8, Math.floor(this.lastTileSize * this.look.size));
        const fly = this.scene.add
          .image(this.lastScreen.x, this.lastScreen.y, this.look.key, this.look.frame)
          .setOrigin(0.5)
          .setDepth(SCENE_DEPTHS.uiOverlay)
          .setDisplaySize(size, size);
        this.scene.tweens.add({
          targets: fly,
          x: absorbTarget.x,
          y: absorbTarget.y,
          displayWidth: size * 0.4,
          displayHeight: size * 0.4,
          alpha: 0.8,
          duration: 280,
          ease: 'Power3.easeIn',
          onComplete: () => {
            fly.destroy();
            onComplete();
          },
        });
      },
    });
  }

  /**
   * O ÍMÃ, um quadro de cada vez: dentro do alcance o drop ACELERA na direção do herói, e ele
   * nunca desacelera depois de partir (um item que hesita lê como bug de física, não como ímã).
   * Devolve `true` quando chegou perto o bastante para ser apanhado.
   *
   * Ele mexe em `pos`, o mesmo objeto que o tween de espalhamento anima — e por isso o tween é
   * morto no primeiro puxão: dois donos da mesma posição fazem o drop tremer entre dois destinos.
   */
  public lureToward(playerX: number, playerY: number, deltaMs: number): boolean {
    if (!this.collectable || this.collected) return false;
    const dx = playerX - this.pos.x;
    const dy = playerY - this.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > MAGNET_TILES) return false;
    if (dist <= MAGNET_CATCH) return true;
    if (this.lureSpeed === 0) this.scene.tweens.killTweensOf(this.pos);
    const dt = Math.min(0.05, deltaMs / 1000);
    this.lureSpeed += MAGNET_ACCEL * dt;
    const step = Math.min(dist, this.lureSpeed * dt);
    this.pos.x += (dx / dist) * step;
    this.pos.y += (dy / dist) * step;
    return dist - step <= MAGNET_CATCH;
  }

  public render(tileSize: number, camera: WorldCamera): void {
    if (this.collected) return;

    const bob = this.collectable
      ? (Math.sin(this.scene.time.now * 0.005) + 1) * 0.5 * 0.08
      : 0;
    this.sprite
      .setPosition(this.pos.x, this.pos.y)
      .setAngle(this.pos.angle);
    if (this.collectable) this.sprite.setElevation(bob);

    this.lastScreen = camera.tileToScreen(this.pos.x, this.pos.y, tileSize);
    this.lastTileSize = tileSize;
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.pos);
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }

  /**
   * O ESTALO da coleta: um anel que abre no chão e seis fagulhas saindo do tile.
   *
   * O drop já pulava e voava para o herói, mas o INSTANTE em que ele vira mochila não tinha pixel
   * nenhum — e é esse instante que o jogador está tentando repetir. É a mesma gramática de todo
   * impacto do jogo (anel + fagulhas aditivas, ver spawnChargeMote).
   */
  private burst(): void {
    const w3 = world3d();
    const fx = { centered: true, fog: false, depthWrite: false, additive: true } as const;
    const ring = w3
      .addBillboard(FX_RING_TEXTURE, 0, { ...fx, depthLayer: 'ground' })
      .setTint(0xffe9a8)
      .setPosition(this.pos.x, this.pos.y)
      .setElevation(0.03)
      .setDisplaySize(0.3, 0.3)
      .setAlpha(0.85);
    this.scene.tweens.add({
      targets: ring,
      displayWidth: 1.25,
      displayHeight: 1.25,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const reach = 0.28 + Math.random() * 0.22;
      const spark = w3
        .addBillboard(FX_DOT_TEXTURE, 0, { ...fx, emissiveBoost: 2 })
        .setTint(i % 2 === 0 ? 0xf8e394 : 0xf1cc36)
        .setPosition(this.pos.x, this.pos.y)
        .setElevation(0.22)
        .setDisplaySize(0.11, 0.11)
        .setAlpha(0.95);
      this.scene.tweens.add({
        targets: spark,
        x: this.pos.x + Math.cos(angle) * reach,
        y: this.pos.y + Math.sin(angle) * reach * 0.6,
        elevation: 0.5 + Math.random() * 0.3,
        alpha: 0,
        displayWidth: 0.03,
        displayHeight: 0.03,
        duration: 240 + Math.random() * 140,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private startScatter(targetWorldX: number, targetWorldY: number, delay: number): void {
    const spinDir = Math.random() > 0.5 ? 1 : -1;

    // Ground travel and the arc are separate axes in 3D: the drop slides to its tile
    // while its elevation hops up and bounces back down onto the ground.
    this.scene.tweens.add({
      targets: this.pos,
      x: targetWorldX,
      y: targetWorldY,
      angle: spinDir * 360,
      duration: 400,
      delay,
      ease: 'Power2.easeOut',
      onComplete: () => {
        this.pos.angle = 0;
        this.sprite.setAngle(0);
        this.collectable = true;
        this.scene.tweens.add({
          targets: this.sprite,
          displayWidth: this.look.size * 1.3,
          displayHeight: this.look.size * 1.3,
          duration: 100,
          yoyo: true,
          ease: 'Power2.easeOut',
        });
      },
    });
    this.scene.tweens.add({
      targets: this.sprite,
      elevation: 0.85,
      duration: 180,
      delay,
      ease: 'Power2.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.sprite,
          elevation: 0,
          duration: 220,
          ease: 'Bounce.easeOut',
        });
      },
    });
  }
}
