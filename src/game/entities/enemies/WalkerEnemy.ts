import Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { EnemyBase } from '@/game/entities/EnemyBase';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_PUFF_TEXTURE, world3d } from '@/game/render3d/World3D';

/**
 * O QUE TODO BICHO QUE ANDA TEM EM COMUM — e o que ele NAO tem.
 *
 * A caveira (UndeadEnemy) e o inimigo mais antigo do jogo e continua sozinha no arquivo dela: ela
 * carrega tres coisas que sao SO dela (a fissura de 3s pra sair do chao, o laco da placa de
 * pressao e o desmanche quando o heroi alcanca uma fogueira), e reescrever aquilo pra caber num
 * molde comum seria trocar um sistema guardado por playtest por um sistema novo, de graca.
 *
 * O que esta classe guarda e o resto — as leis que qualquer corpo que caminha tem de respeitar,
 * porque foram elas que ensinaram o jogador a jogar:
 *
 * - **Chegar e um EVENTO, nunca um pop.** Um corpo que aparece do nada ao lado do heroi e injusto.
 *   A caveira racha o chao por 3s; um bicho que nao vem de baixo faz o gesto curto equivalente —
 *   poeira, silhueta crescendo e som — e fica INVULNERAVEL e inerte enquanto isso.
 * - **O golpe e TELEGRAFADO, e ele trava um tile.** Estourado o relogio de ataque, o bicho nao
 *   fere: ele mira o tile em que o heroi esta AGORA, avisa (piscada + pose recuada) e bate
 *   `windupMs` depois, naquele tile. Sair de la e uma esquiva de verdade, e um golpe do heroi no
 *   meio do movimento CANCELA o ataque. Essa e a promessa que a caveira fez primeiro; um bicho
 *   novo que batesse sem aviso a desmentiria.
 * - **A luz de fogueira e parede** (isso mora no `isBlocked` que o GameScene passa) e **a tocha
 *   afasta quem a teme** (`fearsTorch`, em EnemyBase) — os dois unicos poderes que o jogador tem
 *   sobre um bicho sem chegar perto.
 *
 * O que cada especie diz de proprio esta no arquivo dela: o `think` (estados) e o `takeStep`
 * (como escolhe o proximo tile).
 */

/** O mundo, do ponto de vista de um bicho no instante em que ele decide o que fazer. */
export type StepContext = {
  playerWorldX: number;
  playerWorldY: number;
  /** Distancia de Manhattan ate o heroi — a mesma metrica em que ele anda. */
  dist: number;
  /** O heroi carrega chama acesa (ver fearsTorch: nem todo bicho se importa). */
  playerHasTorch: boolean;
  isBlocked: (wx: number, wy: number) => boolean;
};

/** Quanto dura a chegada, e como ela cresce. */
const ARRIVE_MS = 900;
const ARRIVE_START_SCALE = 0.3;
/** A piscada de aviso do golpe: o mesmo vermelho quente da caveira — um aviso, uma cor. */
const WINDUP_FLASH = 0xff4a3d;

export abstract class WalkerEnemy extends EnemyBase {
  /** Escala-base do corpo, em tiles. Nunca > 1: nenhum sprite vaza do seu tile. */
  protected readonly baseScale: number;

  private moveTimer = 0;
  private attackTimer = 0;
  // A chegada (ver o cabecalho): invulneravel, inerte, crescendo no lugar.
  private arriveMs = ARRIVE_MS;
  private arriveScale = ARRIVE_START_SCALE;
  private dustTimer = 0;
  // Golpe comprometido: > 0 = mirado em (windupTargetX/Y), contando pra bater.
  private windupLeftMs = 0;
  private windupTargetX = 0;
  private windupTargetY = 0;

  protected constructor(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    maxHealth: number,
    sprite: Billboard3D,
    baseScale: number,
  ) {
    super(scene, worldX, worldY, maxHealth, sprite);
    this.baseScale = baseScale;
    this.healthBarVisible = false;
    this.sprite.setAlpha(0.55);
    getSoundManager().playCreatureArrive();
  }

  /** Intervalo do passo, em ms. E um getter porque uma especie muda de ritmo (o bote da aranha). */
  protected abstract get moveIntervalMs(): number;

  protected get attackIntervalMs(): number {
    return 1200;
  }

  /** Quanto tempo entre o aviso e o golpe. Curto = mais rapido de ler, mais dificil de esquivar. */
  protected get windupDurationMs(): number {
    return 500;
  }

  /** Ate onde ele enxerga o heroi (Manhattan). Fora disso, ele vagueia. */
  protected get detectionRange(): number {
    return 12;
  }

  /** A cor da poeira que a chegada levanta — terra seca por padrao. */
  protected get arrivalDustTint(): number {
    return 0x9a9284;
  }

  protected override get spriteScale(): number {
    return this.baseScale * this.arriveScale;
  }

  public override get isSpawning(): boolean {
    return this.arriveMs > 0;
  }

  /** Estados proprios da especie, rodados todo frame antes do passo (bote, conjuracao, pulo). */
  protected think(_delta: number, _ctx: StepContext): void {
    // no-op
  }

  /** Arte do passo: a especie que muda de frame ou faz som ao andar (a gosma salta). */
  protected onStepped(): void {
    // no-op
  }

  /**
   * Como esta especie escolhe o proximo tile. O padrao e o unico comportamento que TODOS
   * compartilham: recua da tocha se a teme, caca o heroi se o ve, vagueia se nao ve.
   */
  protected takeStep(ctx: StepContext): void {
    if (ctx.playerHasTorch && this.fearsTorch) {
      if (ctx.dist <= this.detectionRange) this.moveAway(ctx.playerWorldX, ctx.playerWorldY, ctx.isBlocked);
      else this.wander(ctx.isBlocked);
      return;
    }
    if (ctx.dist > 1 && ctx.dist <= this.detectionRange) {
      this.moveToward(ctx.playerWorldX, ctx.playerWorldY, ctx.isBlocked);
      return;
    }
    if (ctx.dist > this.detectionRange) this.wander(ctx.isBlocked);
  }

  /** Pode bater no heroi agora? A tocha protege de quem a teme (ver fearsTorch). */
  protected canStrike(ctx: StepContext): boolean {
    if (ctx.dist !== 1) return false;
    return !(ctx.playerHasTorch && this.fearsTorch);
  }

  // Invulneravel enquanto chega, e um golpe recebido no meio do movimento o CANCELA (a mesma
  // recompensa que a caveira da por bater dentro do telegrafo).
  public override takeDamage(amount = 1): boolean {
    if (this.isSpawning) return false;
    if (this.windupLeftMs > 0) {
      this.windupLeftMs = 0;
      this.attackTimer = 0;
    }
    return super.takeDamage(amount);
  }

  public override update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    _playerSafe: boolean,
    playerHasTorch: boolean,
    isBlocked: (wx: number, wy: number) => boolean,
  ): boolean {
    if (!this.isAlive) return false;

    if (this.arriveMs > 0) {
      this.tickArrival(delta);
      return false;
    }

    // ATORDOADO: o golpe que ele acabou de levar ainda e dono deste corpo. Nao anda, nao pensa,
    // nao arma. E a janela em que o jogador cobra o acerto — sem ela, bater num bicho de mais de
    // um ponto de vida e sempre uma TROCA, e trocar dano nunca foi uma decisao.
    if (this.tickHitstun(delta)) return false;

    const ctx: StepContext = {
      playerWorldX,
      playerWorldY,
      dist: Math.abs(playerWorldX - this.worldX) + Math.abs(playerWorldY - this.worldY),
      playerHasTorch,
      isBlocked,
    };

    // Golpe comprometido: nao anda, nao re-arma. Estourado o relogio, o golpe pega SO se o heroi
    // ainda estiver no tile mirado — sair de la e a esquiva, e a mordida vai no ar.
    if (this.windupLeftMs > 0) {
      this.windupLeftMs -= delta;
      if (this.windupLeftMs > 0) return false;
      const struck = playerWorldX === this.windupTargetX
        && playerWorldY === this.windupTargetY
        && !(playerHasTorch && this.fearsTorch);
      if (struck) return true; // o GameScene resolve o dano
      this.whiff();
      return false;
    }

    this.think(delta, ctx);

    this.moveTimer += delta;
    if (this.moveTimer >= this.moveIntervalMs) {
      this.moveTimer = 0;
      const beforeX = this.worldX;
      const beforeY = this.worldY;
      this.takeStep(ctx);
      if (this.worldX !== beforeX || this.worldY !== beforeY) this.onStepped();
    }

    this.attackTimer += delta;
    if (this.attackTimer >= this.attackIntervalMs) {
      this.attackTimer = 0;
      if (this.canStrike(ctx)) this.startWindup(playerWorldX, playerWorldY);
    }

    return false;
  }

  /** A chegada: silhueta crescendo do chao com poeira saindo por baixo dela. */
  private tickArrival(delta: number): void {
    this.arriveMs = Math.max(0, this.arriveMs - delta);
    const t = 1 - this.arriveMs / ARRIVE_MS;
    // `Back.Out` PASSA de 1 no fim (e o overshoot que faz o pop), e um corpo de escala 1 passando de
    // 1 vaza do proprio tile — a lei mais antiga desta casa. O teto corta so o excesso: ele cresce
    // com o mesmo impulso, encosta em 1 e assenta ali.
    this.arriveScale = Math.min(
      1,
      ARRIVE_START_SCALE + (1 - ARRIVE_START_SCALE) * Phaser.Math.Easing.Back.Out(t, 1.4),
    );
    this.sprite.setAlpha(0.55 + 0.45 * t);
    this.dustTimer += delta;
    if (this.dustTimer >= 180) {
      this.dustTimer = 0;
      this.spawnArrivalPuff();
    }
    if (this.arriveMs === 0) {
      this.arriveScale = 1;
      this.sprite.setAlpha(1);
      // Os relogios ganham fase AQUI, e nao no construtor: `moveIntervalMs` e abstrato (a especie
      // e que sabe o ritmo dela, e a aranha muda de ritmo em voo), e o construtor da base roda
      // antes de a subclasse existir. O instante em que o corpo fica ativo e o momento honesto —
      // dois bichos que chegaram no mesmo frame nao saem andando em coro.
      this.moveTimer = Phaser.Math.Between(0, this.moveIntervalMs);
      this.attackTimer = Phaser.Math.Between(0, this.attackIntervalMs);
    }
  }

  private spawnArrivalPuff(): void {
    const puff = world3d()
      .addBillboard(FX_PUFF_TEXTURE, 0, {
        centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02,
      })
      .setTint(this.arrivalDustTint)
      .setPosition(this.worldX + (Math.random() - 0.5) * 0.7, this.worldY + (Math.random() - 0.5) * 0.5)
      .setElevation(0.05)
      .setDisplaySize(0.2, 0.2)
      .setAlpha(0.5);
    this.scene.tweens.add({
      targets: puff,
      elevation: 0.35 + Math.random() * 0.3,
      alpha: 0,
      scaleX: 0.4,
      scaleY: 0.4,
      duration: 380 + Math.random() * 200,
      ease: 'Power2.easeOut',
      onComplete: () => puff.destroy(),
    });
  }

  /** Mira o tile, avisa (piscada + pose recuada) e compromete o golpe. */
  private startWindup(targetX: number, targetY: number): void {
    const windup = this.windupDurationMs;
    this.windupLeftMs = windup;
    this.windupTargetX = targetX;
    this.windupTargetY = targetY;
    getSoundManager().playUndeadWindup();
    this.sprite.setTintFill(WINDUP_FLASH);
    this.scene.time.delayedCall(90, () => {
      if (this.isAlive && this.sprite.active) this.restoreTint();
    });
    this.poseWindup(Math.sign(this.worldX - targetX), Math.sign(this.worldY - targetY), windup * 0.85);
  }

  /** O golpe que encontrou o vazio: ele investe no tile mirado e morde ar. */
  private whiff(): void {
    this.triggerKnockback(
      Math.sign(this.windupTargetX - this.worldX),
      Math.sign(this.windupTargetY - this.worldY),
    );
    getSoundManager().playUndeadWhiff();
  }
}
