import type Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { ASSET_KEYS, SLIME_FRAMES } from '@/game/constants';
import { world3d } from '@/game/render3d/World3D';
import type { EnemyKind } from '@/game/world/ScreenContent';
import { WalkerEnemy, type StepContext } from './WalkerEnemy';

/**
 * A GOSMA — e o unico bicho do jogo que a tocha nao convence.
 *
 * Ela e lenta (o corpo mais lento com movimento proprio), aguenta pancada e vem sempre. O que ela
 * DIZ, e o motivo de existir, esta em `fearsTorch = false`: a chama na mao do heroi afasta o
 * morto-vivo e assusta bicho, e o jogador aprendeu a tratar a tocha como escudo. Um saco de limo
 * sem olhos nem medo e a correcao dessa leitura — a luz protege do MORTO, nao de tudo. Nada disso
 * e dito em texto: ele levanta a tocha, e ela continua vindo.
 *
 * (A luz de FOGUEIRA continua sendo parede pra ela, como pra todo monstro: aquilo nao e medo, e a
 * regra do mundo sobre onde monstro pode existir.)
 *
 * O SLIME GRANDE e a mesma criatura no corpo dobrado, com uma frase extra: ele RACHA. Matar um
 * vira matar tres — e como ele tem 6 de vida, sao tres espadadas para GANHAR mais dois corpos. E
 * a unica peca do bestiario que responde ao golpe que matou com mais trabalho, e nao com silencio.
 */

type SlimeVariant = 'slime' | 'bigslime';

const SLIME_STATS = {
  slime: {
    maxHealth: 4,
    moveIntervalMs: 950,
    scale: 0.72,
    texture: ASSET_KEYS.slime,
    pool: ASSET_KEYS.slimePool,
  },
  bigslime: {
    maxHealth: 6,
    moveIntervalMs: 1150,
    // 1.0 e o teto: nenhum sprite vaza do seu tile. O contraste com o filhote (0,72) e o que
    // faz "grande" ser legivel sem quebrar a lei.
    scale: 1.0,
    texture: ASSET_KEYS.bigSlime,
    pool: ASSET_KEYS.bigSlimePool,
  },
} as const;

const ATTACK_INTERVAL = 1400;
// Aviso longo: ela e lenta em tudo, inclusive em bater. Quem toma um golpe de slime teve tempo.
const WINDUP_MS = 620;
const DETECTION_RANGE = 10;
/** Quantos filhotes um grande deixa ao estourar, e onde eles podem cair (vizinhos livres). */
const SPLIT_COUNT = 2;
/** A poca que fica no chao, em tiles, e quanto tempo ela leva pra secar. */
const POOL_FADE_MS = 5200;

export class SlimeEnemy extends WalkerEnemy {
  private readonly variant: SlimeVariant;
  /**
   * Como o grande faz os filhotes. A gosma nao sabe criar inimigo — o EnemyManager sabe —, entao
   * ele entrega este cabo na hora de construir. Sem ele, o `bigslime` viraria um slime comum com
   * uma poca maior, em silencio.
   *
   * Devolve `false` quando aquele tile nao aceitou corpo (solido, ocupado, na luz): quem sabe se um
   * tile serve e o GameScene, e a gosma so precisa saber se nasceu ou nao — e tentar o vizinho.
   */
  private readonly splitter?: (worldX: number, worldY: number) => boolean;
  private hopFrame = false;

  public constructor(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    variant: SlimeVariant,
    splitter?: (worldX: number, worldY: number) => boolean,
  ) {
    const stats = SLIME_STATS[variant];
    const sprite = world3d()
      .addBillboard(stats.texture, SLIME_FRAMES.rest, {
        groundShadow: { rx: stats.scale * 0.42, rz: stats.scale * 0.34, alpha: 0.36 },
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(stats.scale, stats.scale);
    super(scene, worldX, worldY, stats.maxHealth, sprite, stats.scale);
    this.variant = variant;
    this.splitter = splitter;
  }

  public override get kind(): EnemyKind {
    return this.variant;
  }

  protected override get normalTexture(): string {
    return SLIME_STATS[this.variant].texture;
  }

  /** A gosma nao teme fogo na mao de ninguem. E a frase inteira desta criatura. */
  public override get fearsTorch(): boolean {
    return false;
  }

  /** Uma bolha nao tem frente para guardar (ver WalkerEnemy.guardsWhileWindingUp). */
  protected override get guardsWhileWindingUp(): boolean {
    return false;
  }

  protected override get moveIntervalMs(): number {
    return SLIME_STATS[this.variant].moveIntervalMs;
  }

  protected override get attackIntervalMs(): number {
    return ATTACK_INTERVAL;
  }

  protected override get windupDurationMs(): number {
    return WINDUP_MS;
  }

  protected override get detectionRange(): number {
    return DETECTION_RANGE;
  }

  protected override get arrivalDustTint(): number {
    return 0xc9e06a; // a poeira dela e verde: gosma chegando, nao terra
  }

  /**
   * Ela nao anda: SALTA. O frame esticado entra no passo e volta ao pousado um instante depois —
   * a troca acontece no gesto, nunca num relogio de animacao, senao uma gosma parada fica
   * pulsando no lugar como se estivesse indo a algum lugar.
   */
  protected override onStepped(): void {
    this.hopFrame = true;
    this.sprite.setTexture(this.normalTexture, SLIME_FRAMES.hop);
    getSoundManager().playSlimeHop();
    this.scene.time.delayedCall(180, () => {
      if (!this.isAlive || !this.sprite.active || !this.hopFrame) return;
      this.hopFrame = false;
      this.sprite.setTexture(this.normalTexture, SLIME_FRAMES.rest);
    });
  }

  protected override takeStep(ctx: StepContext): void {
    // O `super` recua da tocha quando o bicho a teme; esta nao teme, e cair no ramo de fuga por
    // engano seria justamente perder a frase dela. Persegue, ou vagueia.
    if (ctx.dist > 1 && ctx.dist <= this.detectionRange) {
      this.moveToward(ctx.playerWorldX, ctx.playerWorldY, ctx.isBlocked);
      return;
    }
    if (ctx.dist > this.detectionRange) this.wander(ctx.isBlocked);
  }

  /** A poça já É a marca desta espécie — ver CorpseDecals, que por isso nunca a enterra. */
  protected override get leavesCorpseMark(): boolean {
    return false;
  }

  /** Morrer deixa marca: a poca no chao, secando. E o grande ainda racha em dois. */
  protected override onDeath(): void {
    this.spawnPool();
    if (this.variant !== 'bigslime' || !this.splitter) return;
    // Os filhotes nascem nos vizinhos LIVRES, nunca por cima do que estava ali: se nao houver
    // vizinho livre, o grande simplesmente morre — um filhote dentro de uma pedra seria pior.
    const spots: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let born = 0;
    for (const [ox, oy] of spots) {
      if (born >= SPLIT_COUNT) break;
      if (this.splitter(this.worldX + ox, this.worldY + oy)) born += 1;
    }
  }

  /**
   * A poca: um quad DEITADO (isento da lei de profundidade) que seca sozinho.
   *
   * `fog` fica LIGADO — que e o default — e isso nao e detalhe: `USE_FOG` entra na chave de cache do
   * programa, entao um quad deitado sem fog seria um shader novo compilado no primeiro slime que
   * morre, no meio do jogo (o pior stall que este renderer tem). Esta forma — deitado, com corte de
   * alpha baixo — e uma das que o prewarmShaders ja segura.
   */
  private spawnPool(): void {
    const stats = SLIME_STATS[this.variant];
    const pool = world3d()
      .addBillboard(stats.pool, 0, { flat: true, flatY: 0.02, alphaTest: 0.02 })
      .setPosition(this.worldX, this.worldY)
      .setDisplaySize(stats.scale, stats.scale)
      .setAlpha(0.9);
    this.scene.tweens.add({
      targets: pool,
      alpha: 0,
      duration: POOL_FADE_MS,
      ease: 'Sine.easeIn',
      onComplete: () => pool.destroy(),
    });
  }
}
