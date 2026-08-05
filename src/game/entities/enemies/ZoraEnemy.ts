import Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { ASSET_KEYS, ZORA_FRAMES } from '@/game/constants';
import { EnemyBase } from '@/game/entities/EnemyBase';
import type { EnemyProjectileManager } from '@/game/entities/EnemyProjectile';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { enemyMaxHealth, type EnemyKind } from '@/game/world/ScreenContent';

/**
 * O ZORA — o que mora no rio. A mecanica e a do Zola do Zelda 1, sem adaptacao:
 *
 *   submerso → emerge num tile de agua → CUSPE mirado → some de novo, e volta em outro lugar.
 *
 * No Zelda 1 ele e o unico inimigo cuja resposta correta nao e lutar: ele ataca de dentro d'agua,
 * que e o unico terreno onde o heroi nao pode estar, e enquanto esta submerso nao existe alvo
 * nenhum. Isso e mantido AQUI inteiro, porque e a peca:
 *
 * - **Ele nao anda: MERGULHA.** Some, e reaparece em OUTRO tile de agua da mesma vizinhanca. Nao ha
 *   perseguicao, nao ha caminho a bloquear — o rio inteiro e a casa dele.
 * - **A janela e a peca.** Submerso e emergindo ele e intocavel (`isSpawning`); erguido e cuspindo,
 *   nao. Como no original, quem quer mata-lo tem de estar pronto ANTES de ele aparecer.
 * - **O tiro e mirado e avisado**: 400ms de boca aberta com o cuspe brilhando dentro, e so entao a
 *   bola sai na direcao em que o heroi estava. Sair da linha e a esquiva; a parede tambem serve (a
 *   bala morre na pedra, ver EnemyProjectile).
 *
 * ── A UNICA COISA QUE O ZERO ACRESCENTA, E ELA NAO E ARBITRARIA ──
 *
 * No Zelda 1 nao ha resposta pro Zola: voce anda pra longe da margem e pronto. Aqui ha, e ela ja
 * existia no jogo antes dele: **ele precisa de AGUA ABERTA** (`WaterObject.blocking`), e o rio
 * deste jogo pode deixar de ser rio de tres maneiras que o jogador conhece — a ponte de madeira, o
 * vau de pedra e a comporta que drena o canal. Tampe a agua dele e o bicho fica sem lugar; drene o
 * canal e ele nao volta mais. Nenhuma linha de codigo nova: a contra-jogada e a soma de duas pecas
 * que ja estavam na mesa, que e exatamente como este jogo prefere responder.
 *
 * E o efeito colateral que importa mais que o inimigo: ate hoje o rio era so uma PAREDE que se
 * atravessa. Agora ele e um lugar de onde sai coisa — e atravessar deixa de ser a unica pergunta
 * que a agua faz.
 */

// Seis golpes (ver ENEMY_BLOWS). Eram 2, herdados do Zola do original — mas la a espada de madeira
// matava soldado em dois, e AQUI a caveira ja custa tres: o mesmo numero que significava "duro" no
// original significava "o mais facil do jogo" aqui. O que o zora cobra nao e so vida: ele nao se
// arremessa e escolhe a propria janela, entao os seis golpes se pagam em MERGULHOS, nao em tempo
// parado batendo nele.
const MAX_HEALTH = enemyMaxHealth('zora');

// O ciclo, em ms. Os numeros vem da leitura do original: o Zola fica escondido bem mais tempo do
// que aparece, e e essa proporcao (~3:1) que faz a janela ser tensa em vez de trivial.
const SUBMERGED_MS = 2400;
const RISING_MS = 420;
/** Quanto tempo ele fica erguido ANTES de abrir a boca — a metade limpa da janela. */
const AIM_MS = 520;
/** A boca aberta com o cuspe brilhando dentro: o telegrafo. */
const TELEGRAPH_MS = 400;
/** O que sobra da janela depois do tiro: a chance de troco, e o tempo de ler que ele vai sumir. */
const LINGER_MS = 520;

/**
 * Quanto tempo antes de emergir a ESTEIRA aparece no tile escolhido. Ela nao e enfeite: e o unico
 * aviso que o jogador tem, e sem ela o bicho sobe do nada num rio que tem vinte tiles iguais. Com
 * ela, a agua diz "aqui" e quem estava atento ja saiu da linha — a mesma gramatica do chao rachando
 * antes da caveira. (Uma esteira que ficasse parada no tile em que ele MERGULHOU seria pior que
 * nada: prometeria um lugar e entregaria outro.)
 */
const WAKE_TELEGRAPH_MS = 900;
/** A troca do par de frames parados: o bicho respira em vez de virar estatua. */
const BREATH_MS = 420;
const SHOT_SPEED = 4.6;
/** So emerge se o heroi estiver a esta distancia: um zora atirando sozinho do outro lado do mapa
 *  e som e bala pra ninguem — e no original ele so aparece perto do Link. */
const SURFACE_RANGE = 8;
/** Ate onde ele muda de tile entre um mergulho e outro. E o "por perto" dele: uma cova autorada
 *  continua sendo aquele trecho de rio, e nao o rio inteiro do mapa. */
const ROAM_RADIUS = 4;

/** O que o bicho precisa saber do mundo: onde ha agua ABERTA (sem ponte, sem vau, sem dreno). */
export type WaterQuery = {
  isOpenWater: (worldX: number, worldY: number) => boolean;
  /** Todo tile de agua aberta a `radius` de (cx,cy) — a vizinhanca em que ele reaparece. */
  openWaterNear: (cx: number, cy: number, radius: number) => Array<{ worldX: number; worldY: number }>;
};

type Phase = 'submerged' | 'rising' | 'up' | 'spitting' | 'lingering';

export class ZoraEnemy extends EnemyBase {
  /** O trecho de rio que ele chama de casa: o tile que o autor pintou no editor. */
  private readonly homeX: number;
  private readonly homeY: number;

  private phase: Phase = 'submerged';
  private phaseMs = 0;
  /**
   * A esteira: um quad DEITADO na agua, e nao um frame do corpo. Ela existe separada porque marca
   * na agua e CHAO — num billboard em pe (como o corpo) ela boiava meio tile no ar. E o mesmo
   * caminho da fissura fria da caveira, que tambem e chao e tambem e o aviso de que vem coisa.
   */
  private wake?: Billboard3D;
  /** Onde ele decidiu emergir. Escolhido cedo, para a esteira poder avisar antes. */
  private surfaceSpot?: { worldX: number; worldY: number };
  private breathMs = 0;
  private breathFrame = false;

  public constructor(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    private readonly shots: EnemyProjectileManager,
    private readonly water: WaterQuery,
  ) {
    const sprite = world3d()
      // Sem sombra de contato: ele nao esta EM CIMA de nada, esta DENTRO da agua — o que o ancora
      // e a espuma que a propria arte carrega na base (ver spritefactory/sprites/zora.mjs).
      .addBillboard(ASSET_KEYS.zora, ZORA_FRAMES.up)
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1);
    super(scene, worldX, worldY, MAX_HEALTH, sprite);
    this.homeX = worldX;
    this.homeY = worldY;
    this.sprite.setVisible(false); // ele comeca embaixo d'agua: quem aparece e a esteira
    this.wake = world3d()
      // ADITIVO, como a fissura fria da caveira: os dois sao telegrafo de CHAO, e telegrafo que a
      // noite apaga nao e telegrafo. Um quad deitado `lit` fica preto no escuro — foi assim que a
      // primeira versao desta esteira chegou ao jogo, invisivel exatamente quando importa.
      .addBillboard(ASSET_KEYS.zora, ZORA_FRAMES.submerged, {
        flat: true, flatY: 0.04, additive: true, fog: false, depthWrite: false,
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1)
      .setVisible(false);
    // Fase inicial sorteada: dois zoras autorados lado a lado nao podem respirar em coro.
    this.phaseMs = Phaser.Math.Between(0, SUBMERGED_MS);
  }

  public override get kind(): EnemyKind {
    return 'zora';
  }

  protected override get normalTexture(): string {
    return ASSET_KEYS.zora;
  }

  /**
   * INTOCAVEL enquanto esta embaixo d'agua ou saindo dela — e a peca inteira. `isSpawning` e o
   * canal que o jogo ja usa pra "existe mas nao aceita golpe" (o corpo saindo do chao, a maquina se
   * levantando): a espada bate, a piscada pale-blue responde e nada acontece.
   */
  public override get isSpawning(): boolean {
    return this.phase === 'submerged' || this.phase === 'rising';
  }

  /** Debug/playtest: em que ponto do ciclo ele esta. */
  public get zoraPhase(): Phase {
    return this.phase;
  }

  /** A tocha nao muda nada pra ele: quem vive na agua nao teme uma chama de mao. */
  public override get fearsTorch(): boolean {
    return false;
  }

  /**
   * Nao ha como arremessar quem escolhe sozinho onde a agua o devolve: o ciclo dele escreve
   * `worldX/worldY` na hora de subir, e um empurrao deixaria a esteira, a cova e a cabeca em
   * tres tiles diferentes. Ele leva o recuo visual e nada mais.
   */
  public override get canBeShoved(): boolean {
    return false;
  }

  public override takeDamage(amount = 1): boolean {
    if (this.isSpawning) return false;
    return super.takeDamage(amount);
  }

  public override update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    _playerSafe: boolean,
    _playerHasTorch: boolean,
    _isBlocked: (wx: number, wy: number) => boolean,
  ): boolean {
    if (!this.isAlive) return false;

    this.phaseMs += delta;
    const dist = Math.abs(playerWorldX - this.worldX) + Math.abs(playerWorldY - this.worldY);

    switch (this.phase) {
      case 'submerged':
        this.tickSubmerged(playerWorldX, playerWorldY, dist);
        break;

      case 'rising':
        if (this.phaseMs >= RISING_MS) this.enter('up', ZORA_FRAMES.up);
        break;

      case 'up':
        // Erguido ele ENCARA o alvo — a arte olha pra esquerda, entao virar e espelhar.
        this.face(playerWorldX);
        this.breathe(delta);
        if (this.phaseMs >= AIM_MS) {
          this.enter('spitting', ZORA_FRAMES.spitting);
          getSoundManager().playZoraSpit();
        }
        break;

      case 'spitting':
        // A MIRA CONTINUA ATE O TIRO. O telegrafo dura 400ms e o heroi anda dentro deles: se a
        // cara so virasse na fase anterior, quem cruzasse pro outro lado durante a boca aberta
        // levava um cuspe saindo das COSTAS do bicho — a bala ia num sentido e o corpo olhava no
        // outro. Ele vira ate o ultimo frame, e `spit` fixa o lado no instante em que a bola sai.
        this.face(playerWorldX);
        if (this.phaseMs >= TELEGRAPH_MS) {
          this.spit(playerWorldX, playerWorldY);
          this.enter('lingering', ZORA_FRAMES.up);
        }
        break;

      case 'lingering':
        this.breathe(delta);
        if (this.phaseMs >= LINGER_MS) this.dive();
        break;
    }

    // Ele NUNCA devolve `true`: nao ha golpe de corpo num bicho que so aparece dentro da agua. Todo
    // dano dele vem do cuspe, e o acerto e resolvido pelo gerenciador de projetil.
    return false;
  }

  /**
   * Embaixo d'agua: so a esteira, e a espera. Ele so sobe se o heroi estiver por perto — e sobe
   * onde o rio deixar, que nao e necessariamente onde mergulhou (a marca do Zola: some aqui,
   * aparece ali).
   */
  private tickSubmerged(playerWorldX: number, playerWorldY: number, dist: number): void {
    // Fase em duas metades. Na primeira ele nao existe pra ninguem; na segunda a AGUA AVISA: a
    // esteira abre no tile escolhido WAKE_TELEGRAPH_MS antes de ele subir, e quem estava atento sai
    // da linha. E o mesmo contrato do chao rachando antes da caveira.
    if (this.phaseMs < SUBMERGED_MS - WAKE_TELEGRAPH_MS) {
      this.hideWake();
      return;
    }

    if (dist > SURFACE_RANGE) {
      // Longe demais: o relogio para na porta e ele nao aparece — nem a esteira. Sem isto, um zora
      // do outro lado do mapa cospe a cada 4s pra ninguem, e o rio atira sozinho.
      this.phaseMs = SUBMERGED_MS - WAKE_TELEGRAPH_MS;
      this.hideWake();
      this.surfaceSpot = undefined;
      return;
    }

    if (!this.surfaceSpot) {
      const spot = this.pickSurfaceSpot(playerWorldX, playerWorldY);
      // O tile escolhido tem de estar NO QUADRO (tileFramed, nao `framed`: o corpo submerso pode
      // estar longe — o que precisa de plateia e onde a esteira abre). Emergir fora da tela e a
      // versao aquatica do mago conjurando de fora do quadro: esteira, subida e cuspe sem ninguem
      // ver, e o som de agua vindo do nada.
      if (spot && !this.tileFramed(spot.worldX, spot.worldY)) {
        this.phaseMs = 0;
        this.hideWake();
        return;
      }
      if (!spot) {
        // O rio dele acabou — taparam com ponte, encheram de pedra ou drenaram o canal. Ele nao tem
        // onde nascer, e simplesmente nao nasce: e assim que a contra-jogada do jogador aparece na
        // ficcao, sem uma linha de aviso. Tenta de novo no proximo ciclo.
        this.phaseMs = 0;
        this.hideWake();
        return;
      }
      this.surfaceSpot = spot;
      // O CORPO ja se muda pro tile agora (invisivel): assim a esteira, o tile que a cova enxerga e
      // o lugar de onde a cabeca sai sao um so — e nao tres verdades que podem discordar.
      this.worldX = spot.worldX;
      this.worldY = spot.worldY;
      this.showWake();
    }

    if (this.phaseMs < SUBMERGED_MS) return;

    this.face(playerWorldX);
    this.sprite.setVisible(true);
    this.hideWake();
    this.surfaceSpot = undefined;
    this.enter('rising', ZORA_FRAMES.rising);
    getSoundManager().playZoraSurface();
  }

  /** A esteira abre no tile escolhido: um quad deitado que cresce e pulsa ate a cabeca sair. */
  private showWake(): void {
    const wake = this.wake;
    if (!wake?.active) return;
    this.scene.tweens.killTweensOf(wake);
    wake.setPosition(this.worldX, this.worldY).setVisible(true).setAlpha(0.2).setDisplaySize(0.5, 0.5);
    this.scene.tweens.add({
      targets: wake,
      alpha: 0.85,
      scaleX: 1,
      scaleY: 1,
      duration: WAKE_TELEGRAPH_MS * 0.7,
      ease: 'Sine.easeOut',
    });
  }

  private hideWake(): void {
    const wake = this.wake;
    if (!wake?.active || !wake.visible) return;
    this.scene.tweens.killTweensOf(wake);
    wake.setVisible(false);
  }

  /** Parado ele RESPIRA: os dois frames erguidos se alternam devagar (regra 8 do padrao de arte). */
  private breathe(delta: number): void {
    this.breathMs += delta;
    if (this.breathMs < BREATH_MS) return;
    this.breathMs = 0;
    this.breathFrame = !this.breathFrame;
    this.sprite.setTexture(
      ASSET_KEYS.zora,
      this.breathFrame ? ZORA_FRAMES.breathing : ZORA_FRAMES.up,
    );
  }

  /**
   * Onde emergir: um tile de agua aberta SORTEADO entre os que estao ao alcance do heroi, dentro da
   * vizinhanca de casa.
   *
   * O sorteio e a peca, e a primeira versao disto errou feio: ela pegava o tile MAIS PROXIMO do
   * heroi, o que parece mais esperto e na pratica prega o bicho num tile so — com o heroi parado, o
   * mais proximo e sempre o mesmo, e "some aqui, aparece ali" (a assinatura do Zola) virava "sobe
   * e desce no mesmo buraco". Um inimigo que so muda de lugar quando o jogador se mexe nao muda de
   * lugar.
   *
   * O alcance filtra pelo HEROI (a ameaca tem de ser uma ameaca) e a vizinhanca, pela CASA: uma cova
   * autorada e aquele trecho de rio. Um zora que subisse o rio inteiro atras do heroi seria outro
   * inimigo — um perseguidor —, e nao este.
   */
  private pickSurfaceSpot(
    playerWorldX: number,
    playerWorldY: number,
  ): { worldX: number; worldY: number } | undefined {
    // O tile onde o heroi esta em pe (vau, ponte, margem) nunca e agua aberta, entao ele nunca
    // nasce debaixo dos pes dele — o filtro sai de graca da propria definicao de "agua aberta".
    const reachable = this.water
      .openWaterNear(this.homeX, this.homeY, ROAM_RADIUS)
      .filter((tile) => Math.abs(tile.worldX - playerWorldX) + Math.abs(tile.worldY - playerWorldY)
        <= SURFACE_RANGE);
    if (!reachable.length) return undefined;
    return reachable[Math.floor(Math.random() * reachable.length)];
  }

  private spit(playerWorldX: number, playerWorldY: number): void {
    const dx = playerWorldX - this.worldX;
    const dy = playerWorldY - this.worldY;
    // O corpo se acerta com a BALA, e nao com o alvo: e a mesma conta, no mesmo instante, com o
    // mesmo `dx` que a bola leva. Duas leituras separadas do "onde esta o heroi" (uma pra virar,
    // outra pra atirar) podem discordar por um frame, e um frame ja e o suficiente pra ver um
    // bicho cuspir de costas. Alinhado na vertical (`dx === 0`) nao ha lado nenhum a escolher:
    // o cuspe sobe ou desce, e a cara fica como estava em vez de dar um tranco pra esquerda.
    if (dx !== 0) this.face(playerWorldX);
    this.shots.fire('spit', this.worldX, this.worldY, dx, dy, SHOT_SPEED);
    getSoundManager().playEnemyShot();
  }

  /** A arte olha pra ESQUERDA: encarar o que esta a direita e espelhar o billboard. */
  private face(targetWorldX: number): void {
    if (targetWorldX === this.worldX) return;
    this.sprite.setFlipX(targetWorldX > this.worldX);
  }

  /** Volta pra agua. Se o tile em que ele esta deixou de ser rio no meio da janela, ele some ali
   *  mesmo — a agua que sumiu levou o bicho junto, que e a leitura correta. */
  private dive(): void {
    this.enter('submerged', ZORA_FRAMES.submerged);
    this.sprite.setVisible(false); // embaixo d'agua nao ha corpo na tela, so a esteira (e ela vem depois)
    this.hideWake();
    this.surfaceSpot = undefined;
    // O heroi pode ter saido de cena no meio da janela dele; mergulho sem plateia e mudo.
    if (this.framed) getSoundManager().playZoraSurface();
    if (!this.water.isOpenWater(this.worldX, this.worldY)) this.despawn();
  }

  private enter(phase: Phase, frame: number): void {
    this.phase = phase;
    this.phaseMs = 0;
    this.breathMs = 0;
    this.breathFrame = false;
    this.sprite.setTexture(ASSET_KEYS.zora, frame);
  }

  /** A esteira nao pertence ao corpo: ela tem de sumir com ele, morrendo ou se desfazendo. */
  public override despawn(): void {
    this.destroyWake();
    super.despawn();
  }

  protected override onDeath(): void {
    this.destroyWake();
  }

  public override destroy(): void {
    this.destroyWake();
    super.destroy();
  }

  private destroyWake(): void {
    const wake = this.wake;
    if (!wake) return;
    this.wake = undefined;
    if (this.scene.tweens) this.scene.tweens.killTweensOf(wake);
    wake.destroy();
  }
}
