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
 * Todo corpo do jogo, antes dele, resolvia a briga de perto: bastava chegar. O mago inverte o
 * problema. Ele mantem uma distancia (KEEP_DISTANCE), e quando o heroi avanca, ele ANDA PARA TRAS
 * — rodeando, sem nunca virar as costas. Nao ha nada de errado com a espada; o que ele nega e a
 * chance de usa-la.
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
 *
 * **A conjuracao e um COMPROMISSO.** Um golpe no meio dela a apagava, e isso caiu junto com o
 * windup cancelavel do andarilho (ver WalkerEnemy.takeDamage): com dano real, trancar um corpo em
 * interrupcao vira a estrategia dominante do jogo — e o mago, que existe justamente para obrigar
 * o jogador a se mover, seria o mais facil de anular parado na frente dele. A resposta e sair da
 * linha.
 */

const MAX_HEALTH = 2;
const MOVE_INTERVAL = 470;
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

  /**
   * UM AVISO DE CADA VEZ. Conjurando, ele NAO arma o golpe de corpo.
   *
   * Os dois gestos telegrafavam ao mesmo tempo: `canStrike` so olhava a distancia, entao um mago
   * encurralado ficava com a arte de conjuracao no corpo (mais o som do feitico carregando) e, por
   * cima, a piscada vermelha, a pose recuada e o anel fechando no chao do golpe de corpo. Dois
   * avisos simultaneos no mesmo bicho nao somam informacao — eles se anulam, porque o jogador nao
   * tem como saber a QUAL dos dois esta respondendo, e a resposta de cada um e diferente (sair da
   * linha do tiro, ou sair do tile mirado).
   *
   * Ele nao perde o golpe: o relogio de ataque continua correndo e a proxima janela pega o soco,
   * ja com a conjuracao resolvida. So nao acumula os dois na mesma respiracao.
   */
  protected override canStrike(ctx: StepContext): boolean {
    if (this.castMs > 0) return false;
    return super.canStrike(ctx);
  }

  /** O tom frio e a cor de BASE dele: toda piscada volta pra ela, nunca pro branco do NPC. */
  protected override restoreTint(): void {
    // O frio dele é a identidade (a arte é dividida com o NPC mago); o escurecimento de ferido
    // MULTIPLICA esse tom em vez de substituí-lo — ver EnemyBase.woundedShade.
    this.sprite.setTint(this.woundedShade(COLD_TINT));
  }

  protected override think(delta: number, ctx: StepContext): void {
    // Conjuracao em curso: comprometido, imovel, na arte de casting — e bater nele NAO a
    // interrompe mais (ver o cabecalho da classe). A resposta e sair da linha.
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
