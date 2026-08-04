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

/**
 * A TEIA QUE ELA DEIXA AO ANDAR — e ela e a unica coisa que esta especie escrevia no mundo.
 *
 * Todo corpo do bestiario deixa marca: a caveira racha o chao e deixa ossada, a gosma deixa a poca
 * que seca, o zora abre esteira na agua. A aranha — que e o corpo mais MOVEL do jogo, cujo bote
 * atravessa cinco tiles em 360ms — passava sem deixar nada, entao nao havia como saber que aquele
 * corredor tem aranha antes de uma pular nele. A teia e esse aviso, e ela nao trava nada: nao
 * bloqueia, nao prende, nao fere. A informacao esta em QUANTAS ha e quao juntas — uma solta e uma
 * que cruzou; um punhado no mesmo corredor e uma que MORA ali.
 *
 * NAO sai no bote de proposito: no salto ela esta no ar, e um rastro contínuo apagaria a diferenca
 * entre o rastejo (que se pode contornar) e o bote (que nao se contorna). A teia marca a ronda.
 */
const WEB_DROP_CHANCE = 0.22;
/**
 * Quanto a teia dura. Longa o bastante para acumular num corredor patrulhado, curta o bastante
 * para se apagar sozinha — cada uma e um billboard, e billboard e draw call: sem o sumico, uma
 * aranha de vida longa penduraria uma fila delas atras de si para sempre (a mesma conta que poe
 * teto nas ossadas, so que resolvida pelo tempo em vez de por uma lista).
 */
const WEB_FADE_MS = 9000;
const WEB_SIZE = 0.72;

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

  /**
   * Andou: as vezes fica seda no tile que ela deixou (ver WEB_DROP_CHANCE).
   *
   * A teia e desenhada aqui e nao guardada em lista nenhuma, pelo mesmo caminho da poca da gosma:
   * o tween que a apaga e o dono dela. E por isso que ela SOBREVIVE a aranha — matar o corpo nao
   * toca no billboard, e o rastro continua contando onde ela andou depois de ela nao existir mais.
   */
  protected override onStepped(): void {
    if (this.isPouncing || Math.random() >= WEB_DROP_CHANCE) return;
    const web = world3d()
      // Quad DEITADO no formato que o `prewarmShaders` ja segura (`flat` + alphaTest baixo, o
      // mesmo da poca e da ossada): combinacao nova de opcoes seria um shader compilado no meio
      // de uma perseguicao, que e o pior engasgo que este renderer tem.
      .addBillboard(ASSET_KEYS.spiderWeb, 0, { flat: true, flatY: 0.02, alphaTest: 0.02 })
      .setPosition(this.worldX, this.worldY)
      // Espelhada pela paridade do tile, e nao por sorteio: duas teias vizinhas nao podem ser a
      // mesma foto, e a mesma passagem tem de deixar sempre a mesma marca.
      .setFlipX((this.worldX + this.worldY) % 2 === 0)
      .setDisplaySize(WEB_SIZE, WEB_SIZE)
      .setAlpha(0);
    this.scene.tweens.add({
      targets: web,
      alpha: 0.75,
      duration: 220,
      ease: 'Sine.easeOut',
      // Assenta depressa e some devagar: seda pousa num instante e leva muito tempo para sumir.
      onComplete: () => {
        this.scene.tweens.add({
          targets: web,
          alpha: 0,
          duration: WEB_FADE_MS,
          ease: 'Sine.easeIn',
          onComplete: () => web.destroy(),
        });
      },
    });
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
