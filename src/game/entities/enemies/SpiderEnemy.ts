import type Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { ASSET_KEYS } from '@/game/constants';
import { world3d } from '@/game/render3d/World3D';
import type { EnemyKind } from '@/game/world/ScreenContent';
import { WalkerEnemy, type StepContext } from './WalkerEnemy';

/**
 * A ARANHA — espreita, e da o BOTE.
 *
 * A caveira anda sempre no mesmo relogio: uma vez que voce sabe o intervalo dela, a distancia e
 * uma conta. A aranha existe pra quebrar essa conta. Ela tem dois andamentos:
 *
 *   RASTEJO   passo lento (700ms) — ela chega perto sem nunca fechar a distancia;
 *   AGACHADA  400ms parada, recuada e comprimida — o AVISO, e o unico momento em que ela e facil;
 *   BOTE      tres passos em 120ms — atravessa metade da sala e cola no heroi.
 *
 * O bote e o proprio telegrafo do perigo: quando ela chega, ela ja avisou. Por isso o golpe dela
 * depois de colar e o mesmo aviso curto de sempre e nao um segundo susto.
 *
 * O que a mantem justa e o RASTEJO: fora do bote ela e o bicho mais lento do jogo com pernas, e
 * andar de lado ate ela cansar de te ver e uma resposta legitima. Perto de uma quina, nao.
 */

const MAX_HEALTH = 2;
const CRAWL_INTERVAL = 500;
const POUNCE_INTERVAL = 120;
const ATTACK_INTERVAL = 1000;
const WINDUP_MS = 320;
const DETECTION_RANGE = 12;
/** De quao longe ela se atreve. Mais que isso e um bote que acaba longe e parece um bug. */
const POUNCE_RANGE = 5;
const CROUCH_MS = 400;
const POUNCE_STEPS = 3;
/** Descanso entre botes: sem ele, ela pula sem parar e vira um teleporte. */
const POUNCE_COOLDOWN_MS = 2400;

export class SpiderEnemy extends WalkerEnemy {
  private crouchMs = 0;
  private pounceStepsLeft = 0;
  private cooldownMs = POUNCE_COOLDOWN_MS * 0.5; // nao pula no primeiro frame de vida

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    const sprite = world3d()
      .addBillboard(ASSET_KEYS.spider, 0, { groundShadow: { rx: 0.34, rz: 0.3, alpha: 0.34 } })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.85, 0.85);
    super(scene, worldX, worldY, MAX_HEALTH, sprite, 0.85);
  }

  public override get kind(): EnemyKind {
    return 'spider';
  }

  protected override get normalTexture(): string {
    return ASSET_KEYS.spider;
  }

  /** O ritmo E o estado: no bote ela anda seis vezes mais rapido que rastejando. */
  protected override get moveIntervalMs(): number {
    return this.pounceStepsLeft > 0 ? POUNCE_INTERVAL : CRAWL_INTERVAL;
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

  /** Debug/playtest: ela esta no meio de um bote agora? (o cenario `fauna` mede o salto por aqui) */
  public get isPouncing(): boolean {
    return this.pounceStepsLeft > 0;
  }

  protected override think(delta: number, ctx: StepContext): void {
    if (this.cooldownMs > 0) this.cooldownMs = Math.max(0, this.cooldownMs - delta);

    // Agachada: comprometida com o susto, imovel. Ela nao decide mais nada ate o bote sair.
    if (this.crouchMs > 0) {
      this.crouchMs -= delta;
      if (this.crouchMs <= 0) {
        this.crouchMs = 0;
        this.pounceStepsLeft = POUNCE_STEPS;
        getSoundManager().playSpiderPounce();
      }
      return;
    }

    if (this.pounceStepsLeft > 0) return;

    // A decisao de pular: ela ve o heroi, esta na distancia certa, ja descansou — e ele nao esta
    // com chama na mao (o bote e um gesto de coragem, e ela tem medo de fogo como todo bicho).
    const wants = !ctx.playerHasTorch
      && ctx.dist > 1
      && ctx.dist <= POUNCE_RANGE
      && this.cooldownMs === 0;
    if (!wants) return;
    this.crouchMs = CROUCH_MS;
    this.cooldownMs = POUNCE_COOLDOWN_MS + CROUCH_MS + POUNCE_STEPS * POUNCE_INTERVAL;
    // O agachamento e a mesma pose recuada do golpe telegrafado, so mais longa: um corpo que se
    // comprime e o vocabulario que o jogo ja usa pra "vem coisa".
    this.poseWindup(
      Math.sign(this.worldX - ctx.playerWorldX),
      Math.sign(this.worldY - ctx.playerWorldY),
      CROUCH_MS * 0.9,
    );
  }

  protected override takeStep(ctx: StepContext): void {
    // Agachada nao anda: o corpo esta preso na mola.
    if (this.crouchMs > 0) return;

    if (this.pounceStepsLeft > 0) {
      this.pounceStepsLeft -= 1;
      // O bote vai pro heroi mesmo que ele tenha se movido — ela corrige, e o que ela nao faz e
      // parar no meio. Colada nele (dist 1), o resto do salto e gasto no lugar: chegou.
      if (ctx.dist > 1) this.moveToward(ctx.playerWorldX, ctx.playerWorldY, ctx.isBlocked);
      return;
    }

    super.takeStep(ctx);
  }
}
