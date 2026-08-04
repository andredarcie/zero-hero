import type Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { ASSET_KEYS } from '@/game/constants';
import type { EnemyProjectileManager } from '@/game/entities/EnemyProjectile';
import { world3d } from '@/game/render3d/World3D';
import type { EnemyKind } from '@/game/world/ScreenContent';
import { WalkerEnemy, type StepContext } from './WalkerEnemy';

/**
 * O MAGO — o inimigo que se RECUSA a ficar ao alcance da espada.
 *
 * Todo corpo do jogo, antes dele, resolvia a briga de perto: a espada mata de um golpe, e o unico
 * problema era chegar. O mago inverte o problema. Ele mantem uma distancia (KEEP_DISTANCE), e
 * quando o heroi avanca, ele ANDA PARA TRAS — rodeando, sem nunca virar as costas. A espada
 * continua matando de um golpe; o que ele nega e o golpe.
 *
 * A resposta que o jogo ja tem pra isso e o mapa: encurrale-o numa quina, ou ponha uma parede
 * entre voce e ele (a bola morre na pedra, ver EnemyProjectile). Ele tambem e o corpo mais frouxo
 * do bestiario depois do morcego — dois socos —, porque quem e dificil de alcancar nao pode ser
 * dificil de matar tambem.
 *
 * **A arte e emprestada, e isso teve de ser resolvido.** `mage__1.png` e o sprite do NPC "wizard",
 * o velho que conta a historia do jogo. Um inimigo com o corpo de um amigo e uma mentira visual
 * que nenhuma legenda conserta, entao o mago inimigo nasce com um TOM FRIO permanente
 * (COLD_TINT) — um espectro do feiticeiro, nao ele — e o tint volta depois de toda piscada (ver
 * restoreTint). Na CONJURACAO o tom sai: a arte de casting (`mage_magic`, que ja tem o proprio
 * clarao vermelho) aparece na cor cheia, e o contraste frio→quente e o telegrafo.
 */

const MAX_HEALTH = 2;
const MOVE_INTERVAL = 520;
const DETECTION_RANGE = 12;
/** A distancia que ele quer: fora do alcance de um golpe, dentro do alcance do feitico. */
const KEEP_DISTANCE = 5;
/** Tolerancia em volta dela — sem isto ele oscila um passo pra frente e um pra tras pra sempre. */
const KEEP_SLACK = 1;
const CAST_INTERVAL_MS = 2800;
const CAST_TELEGRAPH_MS = 420;
const CAST_RANGE = 8;
const SHOT_SPEED = 4.4;
/** O frio que o separa do NPC mago (ver o cabecalho). */
const COLD_TINT = 0x9fd8ff;

export class MageEnemy extends WalkerEnemy {
  protected override hurtTexture = ASSET_KEYS.mageHurt;

  private castTimer = 0;
  private castMs = 0;
  /** Pra que lado ele rodeia. Sorteado no nascimento: dois magos nao circulam em coro. */
  private readonly strafeSign = Math.random() < 0.5 ? 1 : -1;

  public constructor(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    private readonly shots: EnemyProjectileManager,
  ) {
    const sprite = world3d()
      .addBillboard(ASSET_KEYS.mage, 0, { groundShadow: { rx: 0.32, rz: 0.3, alpha: 0.32 } })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.95, 0.95);
    super(scene, worldX, worldY, MAX_HEALTH, sprite, 0.95);
    this.sprite.setTint(COLD_TINT);
  }

  public override get kind(): EnemyKind {
    return 'mage';
  }

  protected override get normalTexture(): string {
    return ASSET_KEYS.mage;
  }

  /**
   * Ele nao recua da tocha: quem ja mantem cinco tiles de distancia nao tem o que temer de uma
   * chama de mao, e faze-lo fugir dela o empurraria pra fora do proprio alcance — a peca sumiria
   * do jogo em vez de ficar mais facil.
   */
  public override get fearsTorch(): boolean {
    return false;
  }

  protected override get moveIntervalMs(): number {
    return MOVE_INTERVAL;
  }

  protected override get detectionRange(): number {
    return DETECTION_RANGE;
  }

  protected override get arrivalDustTint(): number {
    return COLD_TINT;
  }

  /** Debug/playtest: ele esta no meio de uma conjuracao? */
  public get isCasting(): boolean {
    return this.castMs > 0;
  }

  // O golpe de CORPO (herdado do WalkerEnemy) fica: encurralado numa quina, com o heroi colado, ele
  // bate — telegrafado como todo mundo. Um mago que so soubesse conjurar seria um saco de pancada no
  // instante em que o jogador resolvesse o problema que ele propoe, e a peca nao tem nada a dizer
  // depois disso.

  /** O tom frio e a cor de BASE dele: toda piscada volta pra ela, nunca pro branco do NPC. */
  protected override restoreTint(): void {
    this.sprite.setTint(COLD_TINT);
  }

  protected override think(delta: number, ctx: StepContext): void {
    // Conjuracao em curso: comprometido, imovel, na arte de casting. Bater nele aqui interrompe
    // (ver takeDamage) — a mesma recompensa por ler um telegrafo que a caveira ensinou.
    if (this.castMs > 0) {
      this.castMs -= delta;
      if (this.castMs <= 0) {
        this.castMs = 0;
        this.releaseSpell(ctx);
      }
      return;
    }

    if (ctx.dist > CAST_RANGE) {
      this.castTimer = 0; // longe demais: ele nem comeca a puxar o feitico
      return;
    }

    this.castTimer += delta;
    if (this.castTimer < CAST_INTERVAL_MS) return;
    this.castTimer = 0;
    this.castMs = CAST_TELEGRAPH_MS;
    // O tom frio SAI aqui: a arte de conjuracao tem clarao proprio, e e ele que avisa.
    this.sprite.clearTint();
    this.sprite.setTexture(ASSET_KEYS.mageCast);
    getSoundManager().playSpellWindup();
  }

  public override takeDamage(amount = 1): boolean {
    // Um golpe no meio da conjuracao a APAGA — e ele volta pra fila do relogio.
    if (!this.isSpawning && this.castMs > 0) {
      this.castMs = 0;
      this.castTimer = 0;
      this.endCastPose();
    }
    return super.takeDamage(amount);
  }

  /**
   * O kiter. Perto demais: recua. Longe demais: aproxima. Na faixa boa: RODEIA — um passo
   * perpendicular ao heroi, sempre pro mesmo lado. E o rodeio que o faz ler como intencao em vez de
   * indecisao; sem ele, um mago na distancia certa fica plantado como um poste.
   */
  protected override takeStep(ctx: StepContext): void {
    if (this.castMs > 0) return; // conjurando nao anda

    if (ctx.dist > this.detectionRange) {
      this.wander(ctx.isBlocked);
      return;
    }
    if (ctx.dist < KEEP_DISTANCE - KEEP_SLACK) {
      this.moveAway(ctx.playerWorldX, ctx.playerWorldY, ctx.isBlocked);
      return;
    }
    if (ctx.dist > KEEP_DISTANCE + KEEP_SLACK) {
      this.moveToward(ctx.playerWorldX, ctx.playerWorldY, ctx.isBlocked);
      return;
    }
    this.strafe(ctx);
  }

  /** Um passo perpendicular a linha do heroi; barrado, ele tenta o outro lado antes de desistir. */
  private strafe(ctx: StepContext): void {
    const dx = ctx.playerWorldX - this.worldX;
    const dy = ctx.playerWorldY - this.worldY;
    // Perpendicular ao eixo DOMINANTE: se ele esta mais a leste que ao norte, rodear e andar em y.
    const along: [number, number] = Math.abs(dx) >= Math.abs(dy) ? [0, 1] : [1, 0];
    for (const sign of [this.strafeSign, -this.strafeSign]) {
      const ox = along[0] * sign;
      const oy = along[1] * sign;
      if (!ctx.isBlocked(this.worldX + ox, this.worldY + oy)) {
        this.stepTo(ox, oy);
        return;
      }
    }
  }

  /** Solta a bola na direcao do heroi AGORA (o telegrafo ja deu o tempo de sair da linha). */
  private releaseSpell(ctx: StepContext): void {
    this.endCastPose();
    this.shots.fire(
      'magic',
      this.worldX,
      this.worldY,
      ctx.playerWorldX - this.worldX,
      ctx.playerWorldY - this.worldY,
      SHOT_SPEED,
    );
    getSoundManager().playEnemyShot();
  }

  private endCastPose(): void {
    if (!this.sprite.active) return;
    this.sprite.setTexture(this.normalTexture);
    this.restoreTint();
  }
}
