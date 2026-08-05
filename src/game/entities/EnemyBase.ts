import Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { SCENE_DEPTHS } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import {
  FX_DOT_TEXTURE, FX_PUFF_TEXTURE, FX_RING_TEXTURE, world3d, type FireLight3D,
} from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import { AQUATIC_ENEMY_KINDS, FLYING_ENEMY_KINDS, type EnemyKind } from '@/game/world/ScreenContent';

/** Ver `hurtInvulnMs`. Os ~32 frames do Link to the Past, arredondados para baixo. */
const HURT_INVULN_MS = 450;
/**
 * Meio ciclo da PISCADA de invulnerabilidade, em ms. A janela inteira pisca — a troca de textura
 * de dano dura 150ms e a invulnerabilidade dura 450, e nos 300ms de diferença o corpo parecia
 * exatamente igual a um corpo que aceita dano. O jogador descobria que não aceitava depois de já
 * ter apertado o botão.
 *
 * 80ms dá ~5 lampejos na janela: rápido o bastante para ler como "piscando" e não como "sumindo",
 * que é a diferença entre um aviso e um defeito de render.
 */
const HURT_BLINK_HALF_MS = 80;
/** Quanto o corpo apaga no vale da piscada. Não vai a zero: um bicho invisível não se acerta. */
const HURT_BLINK_ALPHA = 0.35;

// ── O TELEGRAFO ──────────────────────────────────────────────────────────────
//
// O golpe armado, a marca no chão, o brilho da guarda e a geometria dela. Mora AQUI e não no
// `WalkerEnemy` porque a caveira não é um andarilho (ela tem a fissura de 3s, o laço da placa e o
// desmanche, e reescrevê-la para caber num molde comum seria trocar um sistema guardado por
// playtest por um sistema novo) — e mesmo assim ela telegrafa exatamente igual a todo mundo.
//
// Enquanto isto viveu só no andarilho, a caveira — o corpo que o jogador mais encontra, e o que
// ENSINOU o telegrafo — era a única espécie sem marca no chão, sem guarda e com o golpe armado
// ainda cancelável a pancada. Duas rotas para o mesmo fato é como uma delas envelhece errada.

/** A piscada de aviso: o mesmo vermelho quente para todo mundo — um aviso, uma cor. */
const WINDUP_FLASH = 0xff4a3d;
/**
 * A MARCA NO CHÃO do tile mirado, e ela é a metade que faltava do telegrafo.
 *
 * O aviso dizia "vem golpe" de três maneiras (clarão, pose recuada, som) e nenhuma delas dizia
 * ONDE — que é a única informação que importa desde que bater no bicho deixou de cancelar o
 * ataque dele. A resposta ao telegrafo é sair do tile mirado, então o tile mirado tem de estar
 * na tela.
 *
 * É um anel deitado no chão (o mesmo `FX_RING_TEXTURE` da onda de impacto: um choque, uma forma)
 * que FECHA em vez de abrir — ele encolhe do tamanho do tile até o centro no tempo exato do
 * windup, e a leitura é literalmente um relógio: quando fecha, bate. Abrir seria a gramática da
 * coisa que já aconteceu.
 */
const WINDUP_MARK_FROM = 1.15;
const WINDUP_MARK_TO = 0.35;
/**
 * O BRILHO DA GUARDA, e ele existe para a guarda deixar de ser uma armadilha.
 *
 * O bicho fecha a frente enquanto arma (ver `guardsAgainst`), e nada dizia isso: o jogador
 * descobria gastando um golpe e ouvindo o tim. Punir uma coisa que não foi mostrada é a diferença
 * entre "ataquei do lado errado" e "o jogo me trapaceou" — e o telegrafo inteiro deste jogo existe
 * justamente para nunca cair do lado errado dessa linha.
 *
 * É um risco curto na BORDA do corpo, do lado fechado, na mesma paleta quente das faíscas de aparo
 * (`GameScene.spawnGuardSpark`): a mesma coisa dita duas vezes, antes e depois. Só aparece em quem
 * realmente guarda — a gosma e o morcego não desenham nada, porque não fecham nada.
 */
const GUARD_GLINT_TINT = 0xffe6b0;
const GUARD_GLINT_SIZE = 0.34;
/** A que distância do centro do corpo, em tiles: encostado na borda dele, do lado guardado. */
const GUARD_GLINT_REACH = 0.42;

/**
 * O ÚLTIMO EMPURRÃO — quanto o corpo MORTO ainda voa na direção do golpe, em tiles.
 *
 * Meio tile, e ele é curto de propósito: o corpo já está encolhendo e girando enquanto voa, então
 * o que se lê é um tranco, não um deslocamento. Mais que isso e a ossada (que fica no tile LÓGICO)
 * passa a cair longe de onde os pixels pararam. Ver `deathFling`.
 */
const DEATH_FLING_TILES = 0.5;
/** Um pouco mais curto que o desmanche inteiro (70 + 240): ele assenta antes de terminar de sumir. */
const DEATH_FLING_MS = 260;

/**
 * O RECUO DE VALOR — a resposta de corpo de quem NÃO tem arte de dano.
 *
 * `hurtTexture` só existe em três espécies (caveira, morcego, mago); a aranha, a gosma, a torreta e
 * o zora caíam num `restoreTint()` que, com a vida cheia, não muda um pixel — o primeiro golpe nelas
 * não tinha resposta nenhuma no corpo, só faísca e empurrão. A correção não pode ser acender (tint
 * claro em billboard `emissive` é silhueta chapada que o bloom espalha, e o hitstop a congela
 * acesa): é ESCURECER. Um mergulho curto de valor, que funciona em qualquer corpo e não pede arte.
 */
const HURT_DARKEN_TINT = 0x4e4657;
const HURT_DARKEN_MS = 110;

/**
 * A RECUPERAÇÃO — o terceiro tempo do ataque, que existia só como número e nunca como corpo.
 *
 * Todo golpe de bicho tem antecipação (o windup, com clarão, anel e pose) e execução (o bote, o
 * osso descendo) — e recuperação NENHUMA: o golpe resolvia e no frame seguinte o corpo estava
 * andando de novo, neutro, como se nada tivesse saído dele. A janela de punição existia na
 * aritmética (`attackInterval - windup`) e era invisível na tela, então o jogo ensinava "saia do
 * tile" e nunca ensinava a segunda metade do contrato: AGORA É A SUA VEZ.
 *
 * Pouco menos de meio segundo plantado depois de todo golpe (acertando ou errando), com o corpo
 * caído na pose (ver `poseRecover`): tempo de sobra para UM golpe de resposta, curto demais para
 * dois. Corre dentro do próprio compromisso do windup (`tickWindup` devolve 'busy'), então nenhuma
 * espécie precisa saber que ela existe — e a guarda NÃO vale aqui (`guardsAgainst` lê o relógio do
 * windup): o corpo aberto é exatamente o ponto.
 */
const ATTACK_RECOVER_MS = 450;

/**
 * O INSTANTE DE NOTAR — a fronteira entre vagar e caçar era invisível.
 *
 * `takeStep` virava de `wander` para `moveToward` sem um pixel nem um som: o jogador descobria que
 * foi visto quando o corpo já estava em cima. Todo jogo de leitura marca esse instante (a pose de
 * alerta do LttP, o "!" do MGS) porque ele é a informação que separa "explorar" de "lutar" — e
 * aqui ele custa um clarão âmbar de 90ms, duas fagulhas SUBINDO da cabeça (a zona da intenção, a
 * mesma do balão da caveira) e um sopro curto. Âmbar e não vermelho de propósito: vermelho é
 * promessa de golpe (WINDUP_FLASH), e notar ainda não é golpe.
 *
 * O re-arme existe porque a fronteira de visão OSCILA (os dois corpos andam): perder o herói por
 * um passo e reavistá-lo não pode disparar outro susto — só uma perda de verdade re-arma.
 */
const NOTICE_FLASH = 0xffc46e;
const NOTICE_REARM_MS = 2500;

// ── A TOCHA VIVA ─────────────────────────────────────────────────────────────
//
// Fogo que ALCANÇA um corpo o acende — e um monstro em chamas deixa de ser a espécie dele e
// vira uma peça do ÚNICO sistema que o jogador conduz: uma fogueira em pânico, que corre do
// herói acendendo o que toca (mato, ponte, fogueira morta e OUTRO CORPO, tudo pelo mesmo
// buraco de fechadura do espalhamento), que os outros monstros temem como temem a luz — e que
// o fogo termina de comer sozinho. Nada disso é uma regra nova: é a lei "luz de fogueira é
// parede para todo monstro" ganhando pernas, e a resposta à pergunta que a mecânica do
// arremesso deixou aberta — o encontrão contra a parede tem peso próprio, e a melhor parede
// do jogo sempre foi o fogo.

/**
 * Quanto tempo o fogo leva para comer um corpo. Não é dano por tique de propósito: fogo MATA
 * neste jogo (só o graveto ACESO ainda mata de um golpe — a chama é o topo da escada), e uma
 * espécie "meio queimada" sobrevivente ensinaria que fogo é um arranhão. O que a duração compra
 * é a CENA: ~2,5s de corrida em pânico dá 2-3 telas de rastro, e o corpo morre longe de onde
 * acendeu — que é exatamente o que uma tocha viva promete.
 */
const BURN_TOTAL_MS = 2600;
/**
 * A cadência do pânico, mais rápida que o passo de caça (260ms): correr EM CHAMAS tem de ler
 * diferente de perseguir. Cada passo também é o tique do rastro (ver updateBurning).
 */
const BURN_PANIC_STEP_MS = 190;
/** Os mesmos frames da chama da tocha do herói: um fogo, uma arte. */
const BURN_FLAME_KEYS = ['tiny-fire-0', 'tiny-fire-1', 'tiny-fire-2'] as const;
const BURN_FLAME_FRAME_MS = 95;
/**
 * O tom de CARVÃO para onde o corpo escurece enquanto queima (multiplicado sobre woundedShade,
 * nunca substituindo — a mesma lei do dano: corpo responde escurecendo, porque acender um
 * billboard `emissive` é silhueta chapada que o bloom espalha). O brilho do fogo fica nas
 * chamas e na luz emprestada do pool; o corpo embaixo delas vira cinza.
 */
const BURN_CHAR_R = 0x3a;
const BURN_CHAR_G = 0x24;
const BURN_CHAR_B = 0x1d;
/** Reescreve o tom de carvão no corpo a cada tanto — não a cada frame (apply() reescreve o mesh). */
const BURN_CHAR_TINT_MS = 150;

export abstract class EnemyBase {
  public worldX: number;
  public worldY: number;
  public pendingRemoval = false;

  private health: number;
  private readonly maxHealth: number;
  private alive = true;
  // Visual displacement in TILE units, applied at render time on top of the grid position.
  // Shared by the hit-knockback stretch and the per-step slide (a step starts the sprite
  // back at the old tile and eases it into the new one).
  private knockbackOffsetX = 0;
  private knockbackOffsetY = 0;
  private knockbackSquash = 1.0;
  // Footstep feel: alternate a small left/right tilt on every step.
  private stepFlip = false;
  private stepTween?: Phaser.Tweens.Tween;
  /**
   * O ATORDOAMENTO — quanto tempo este corpo ainda pertence ao golpe que levou.
   *
   * Sem ele um golpe nao muda NADA no bicho: ele continua andando no mesmo relogio, continua
   * armando o mesmo ataque, e a unica diferenca entre acertar e errar e um numero invisivel
   * descendo. A janela de recuperacao (o terceiro tempo de todo ataque: antecipacao → golpe →
   * recuperacao) e o que transforma "acertei" numa VANTAGEM de posicao — e ela e do jogador,
   * nao do bicho. Quem conta o relogio e cada especie, no topo do proprio update (tickHitstun).
   */
  private hitstunMs = 0;

  /**
   * OS i-FRAMES DO CORPO — quanto tempo ele recusa o PRÓXIMO dano depois de levar um.
   *
   * O `A Link to the Past` dá ~32 frames (≈530ms) de invulnerabilidade a quase todo bicho, e não
   * é enfeite: sem isso, encostar a lâmina vira uma serra. Aqui doeria ainda mais que lá — o
   * golpe varre SEIS tiles a cada 260ms e a lâmina rodopiante varre oito de uma vez, então um
   * inimigo com vida de verdade morreria sem nunca ter chegado a armar um ataque, que é
   * exatamente o defeito que o dano real veio consertar.
   *
   * Um pouco MENOR que o atordoamento (300ms) de propósito: a janela de vantagem que o acerto
   * compra continua sendo de quem bateu — quando o corpo volta a andar, ele já pode ser ferido de
   * novo. Ao contrário do hitstun, isto NÃO é contado pela espécie: o dano entra por um caminho
   * só (`takeDamage`), então o relógio corre aqui, no update de todo mundo (ver `tickHurtInvuln`).
   */
  private hurtInvulnMs = 0;
  /** Fase atual da piscada (ver tickHurtInvuln) — só para não reescrever o alpha todo frame. */
  private blinkDown = false;
  /** Ver `corpseMark`: ligado por `die()`, lido pelo EnemyManager quando o corpo sai da lista. */
  private corpseMarkPending = false;

  // O TELEGRAFO (ver o bloco de constantes acima). > 0 = mirado em (windupTargetX/Y), contando
  // para bater. A marca e o brilho são guardados porque eles têm de MORRER com o golpe que os
  // criou: são uma promessa, e promessa não pode sobreviver a quem prometeu.
  private windupLeftMs = 0;
  private windupTargetX = 0;
  private windupTargetY = 0;
  private windupMark?: Billboard3D;
  private guardGlint?: Billboard3D;
  // A RECUPERAÇÃO (ver ATTACK_RECOVER_MS): armada por tickWindup no instante em que o golpe sai,
  // descontada por ele mesmo — enquanto corre, o corpo continua 'busy' e não guarda.
  private recoverMs = 0;
  // O relógio de fase do tremor de atordoamento (ver tickStunFx). > 0 também significa "há um
  // ângulo escrito no sprite que precisa ser zerado quando o atordoamento acabar".
  private stunWobbleMs = 0;
  // O INSTANTE DE NOTAR (ver NOTICE_REARM_MS): o que este corpo sabia do herói no último tick.
  private noticeSeen = false;
  private noticeVirgin = true;
  private noticeRearmMs = NOTICE_REARM_MS;

  // A TOCHA VIVA (ver o bloco de constantes): > 0 = o fogo está comendo este corpo. As chamas e
  // a luz emprestada são guardadas porque morrem com o corpo (die/despawn/destroy), nunca soltas.
  private burnLeftMs = 0;
  private burnStepMs = 0;
  private burnTintMs = 0;
  // Quão carbonizado o corpo JÁ ficou (0..1) — separado do relógio de propósito: é história
  // visual, não estado. clearBurn zera o relógio na morte, e sem este campo o desmanche
  // devolveria o corpo queimado à cor limpa da espécie no meio do gesto.
  private burnChar01 = 0;
  private burnFlameFrame = -1;
  private burnFlames: Billboard3D[] = [];
  private burnFire?: FireLight3D;

  /**
   * ONDE O CORPO EM CHAMAS TOCA, O FOGO TENTA PEGAR — instalado pelo GameScene (o dono de
   * igniteFlammableAt), o mesmo desenho do frameGate: um static porque a lei vale para todo
   * corpo, e o rastro não pode depender de cada espécie lembrar de espalhar.
   */
  private static emberTouch: (wx: number, wy: number) => void = () => {};

  public static setEmberTouch(touch: (wx: number, wy: number) => void): void {
    EnemyBase.emberTouch = touch;
  }

  protected readonly scene: Phaser.Scene;
  protected readonly sprite: Billboard3D;
  // Last projected screen position/scale — anchors Phaser-side FX (shadow wisps).
  private lastScreen = { x: 0, y: 0 };
  private lastTileSize = 48;

  /** Override to return the hurt texture key; if defined, flashes on takeDamage */
  protected hurtTexture?: string;

  /** Override to return the normal texture key used to restore after hurt flash */
  protected abstract get normalTexture(): string;

  /** Override to control display scale (default 1.0) */
  protected get spriteScale(): number {
    return 1.0;
  }

  public constructor(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    maxHealth: number,
    sprite: Billboard3D,
  ) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.sprite = sprite;
  }

  public get isAlive(): boolean {
    return this.alive;
  }

  /** True while a spawn animation plays (the enemy is invulnerable); subclasses override. */
  public get isSpawning(): boolean {
    return false;
  }

  /** Que especie e este corpo (o snapshot de debug e a cova autorada leem isto). */
  public abstract get kind(): EnemyKind;

  /**
   * VOA. O morcego cruza rio, lava e buraco — o que o segura e parede (e o mar, que nada no jogo
   * atravessa). Quem responde `true` aqui e consultado com hazardsPassable pelo EnemyManager, e e
   * a unica diferenca entre "onde eu ando" de um bicho e de outro: o resto do mundo e igual pra
   * todos, inclusive a luz de fogueira, que e parede pra qualquer monstro.
   *
   * A resposta vem da ESPECIE (FLYING_ENEMY_KINDS) e nao de um override por classe, porque a cova
   * e o editor precisam da mesma informacao antes de existir corpo nenhum pra perguntar.
   */
  public get flies(): boolean {
    return FLYING_ENEMY_KINDS.has(this.kind);
  }

  /**
   * A tocha ACESA na mao do heroi afasta esta criatura, e o torna intocavel?
   *
   * Vale pro morto-vivo (a chama e o oposto dele) e pro bicho vivo, que teme fogo como todo
   * animal. NAO vale pra gosma (nao ha o que assustar num saco de limo) nem pra maquina (a
   * torreta nao ve chama, ve alvo) — e essa e a frase que essas duas dizem: a tocha protege do
   * MORTO e do BICHO, nao de tudo. Quem ignora a tocha ainda respeita a luz de fogueira como
   * parede; o que muda e o que ele faz com o heroi que carrega uma.
   */
  public get fearsTorch(): boolean {
    return true;
  }

  /**
   * O laco da PLACA DE PRESSAO. So a caveira o atende (ver UndeadEnemy): a placa quer um corpo, e
   * o corpo que o escuro manda vai la sozinho. Bicho vivo, gosma e maquina tem vontade propria —
   * e um bestiario inteiro marchando para placas transformaria toda placa em interruptor de bicho.
   * Os tres membros vivem aqui para o EnemyManager poder distribuir placas sem saber de especies.
   */
  public get seeksPlates(): boolean {
    return false;
  }

  public get plateTarget(): { x: number; y: number } | undefined {
    return undefined;
  }

  /**
   * O corpo pode ser ARREMESSADO um tile por um golpe?
   *
   * Nao e uma questao de peso: e de quem manda na posicao. A torreta e mobilia (um autor a
   * planta num tile e conta com ela ali) e o zora escolhe sozinho onde a agua o devolve — os
   * dois escrevem `worldX/worldY` por conta propria, e um empurrao os deixaria discordando de
   * si mesmos. Quem responde `false` ainda leva o RECUO visual: o golpe sempre responde no
   * corpo, so nao ganha terreno.
   */
  public get canBeShoved(): boolean {
    return true;
  }

  /** True enquanto um golpe recebido ainda segura este corpo (ver hitstunMs). */
  public get isStunned(): boolean {
    return this.hitstunMs > 0;
  }

  /** O fogo está comendo este corpo? (a tocha viva — ver BURN_TOTAL_MS e o EnemyManager) */
  public get isBurning(): boolean {
    return this.alive && this.burnLeftMs > 0;
  }

  /**
   * O CORPO ESTÁ CONGELADO (a bola do zora — ver FreezeManager, que é quem manda no relógio e no
   * desenho do bloco; aqui mora só o flag que o EnemyManager lê para pular o update da espécie).
   * Uma estátua não caça, não arma golpe, não atira — mas continua sólida, empurrável (desliza)
   * e ferível: gelo trava, nunca protege.
   */
  private frozenFlag = false;

  public get isFrozen(): boolean {
    return this.alive && this.frozenFlag;
  }

  /** A posição DESENHADA (lógica + deslize do passo/arremesso) — o gelo cavalga isto. */
  public get visualX(): number {
    return this.worldX + this.knockbackOffsetX;
  }

  public get visualY(): number {
    return this.worldY + this.knockbackOffsetY;
  }

  /** O frio fechou sobre o corpo. Mata o golpe armado como o fogo mata (a mesma não-corrida). */
  public enterFreeze(): void {
    this.frozenFlag = true;
    this.windupLeftMs = 0;
    this.recoverMs = 0;
    this.clearWindup();
    this.stunWobbleMs = 0;
    this.sprite.setAngle(0); // rígido: nenhum tombo de passo pendurado numa estátua
  }

  public exitFreeze(): void {
    this.frozenFlag = false;
  }

  /**
   * A bola de gelo num corpo EM CHAMAS apaga o fogo em vez de congelar (fogo e gelo se anulam —
   * ver FreezeManager). Devolve `true` se havia fogo para apagar. O carvão fica: a história do
   * corpo não se lava com água fria.
   */
  public extinguish(): boolean {
    if (this.burnLeftMs <= 0) return false;
    this.clearBurn();
    return true;
  }

  /**
   * Este corpo PEGA fogo? A resposta vem da espécie-lista, não de um override: quem vive na
   * água (o zora) é o único que o fogo não alcança — todo o resto arde, inclusive a máquina,
   * porque o graveto aceso já matava tudo em um golpe e a chama não escolhe alvo.
   */
  protected get flammable(): boolean {
    return !AQUATIC_ENEMY_KINDS.has(this.kind);
  }

  /** Um golpe landou: este corpo nao anda nem bate pelos proximos `ms`. */
  public applyHitstun(ms: number): void {
    this.hitstunMs = Math.max(this.hitstunMs, ms);
  }

  /**
   * Desconta o atordoamento do frame. Devolve `true` quando ele ainda esta correndo — e a
   * especie que chama isto tem de sair do update NAQUELE instante, sem andar e sem armar nada.
   */
  protected tickHitstun(delta: number): boolean {
    if (this.hitstunMs <= 0) return false;
    this.hitstunMs = Math.max(0, this.hitstunMs - delta);
    return true;
  }

  /** Vida atual e total — leitura de fora (o snapshot de debug), nunca escrita. */
  public get healthNow(): number {
    return this.health;
  }

  public get healthMax(): number {
    return this.maxHealth;
  }

  /**
   * Este corpo deixa MARCA ao ser morto? A gosma diz que não: ela tem arte própria de morte (a
   * poça que seca), e uma mancha genérica por cima seria a segunda marca da mesma morte.
   */
  protected get leavesCorpseMark(): boolean {
    return true;
  }

  /** Foi morto e ainda deve ser enterrado (lido pelo EnemyManager, uma vez, na remoção). */
  public get corpseMark(): boolean {
    return this.corpseMarkPending;
  }

  private set corpseMark(value: boolean) {
    this.corpseMarkPending = value;
  }

  /**
   * O QUADRO DA CÂMERA, e a lei que ele impõe: **o que a tela não mostra não fala nem começa
   * golpe.** O jogador ouvia bicho que não via — a IA acorda a até 15 tiles e o quadro real
   * mostra ~4,5 pros lados e 2,5 pro sul (a perspectiva engole o perto), então metade do
   * bestiário vivia gritando e atirando de fora da tela. O corpo continua EXISTINDO e andando
   * fora do quadro (o cerco persegue, a caveira marcha pra placa); o que ele não faz é iniciar
   * ataque (windup, carga, conjuração, emersão) nem tocar a própria voz.
   *
   * É um static instalado pelo EnemyManager a cada update (fecha sobre a câmera da cena viva;
   * reinstalado a cada frame, um restart de cena nunca deixa um gate velho valendo). O default
   * `true` cobre o vão entre o boot e o primeiro update — na dúvida, o corpo age, que é o
   * comportamento de sempre.
   */
  private static frameGate: (wx: number, wy: number) => boolean = () => true;

  public static setFrameGate(gate: (wx: number, wy: number) => boolean): void {
    EnemyBase.frameGate = gate;
  }

  /** Um tile qualquer aparece no quadro? (o zora pergunta pelo tile em que vai emergir) */
  protected tileFramed(wx: number, wy: number): boolean {
    return EnemyBase.frameGate(wx, wy);
  }

  /** ESTE corpo aparece no quadro agora? */
  protected get framed(): boolean {
    return EnemyBase.frameGate(this.worldX, this.worldY);
  }

  /** Está armando o golpe telegrafado? (a leitura de debug e o playtest da guarda leem isto) */
  public get isWindingUp(): boolean {
    return this.windupLeftMs > 0;
  }

  /** Está piscando de invulnerável agora? (ver hurtInvulnMs) */
  public get isHurtInvulnerable(): boolean {
    return this.hurtInvulnMs > 0;
  }

  /**
   * Esta espécie tem FRENTE? A caveira, a aranha e o mago encaram o que vão bater; a gosma é uma
   * bolha e o morcego é um borrão — guarda neles seria uma regra que o corpo não desenha.
   */
  protected get guardsWhileWindingUp(): boolean {
    return true;
  }

  /**
   * A GUARDA: este corpo apara um golpe que vem desta direção? (`fromDx/fromDy` apontam DELE para
   * quem bateu.) Enquanto arma, o bicho encara o tile que mirou: o que vier de lá bate na guarda,
   * o que vier dos lados ou de trás entra.
   *
   * Mora na base e não só no andarilho porque quem pergunta é o golpe do herói, que não sabe (e
   * não deve saber) de que classe é o corpo à frente dele.
   */
  public guardsAgainst(fromDx: number, fromDy: number): boolean {
    if (this.windupLeftMs <= 0 || !this.guardsWhileWindingUp) return false;
    const gx = Math.sign(this.windupTargetX - this.worldX);
    const gy = Math.sign(this.windupTargetY - this.worldY);
    // Cone frontal de 90°: o eixo dominante do golpe tem de ser o eixo que ele encara.
    return Math.abs(fromDx) >= Math.abs(fromDy)
      ? fromDx !== 0 && fromDx === gx
      : fromDy !== 0 && fromDy === gy;
  }

  /**
   * A PISCADA DE AMEAÇA — o vermelho quente de "vem coisa", 90ms e de volta ao tom ferido.
   *
   * Extraída do startWindup porque ela não é só do golpe armado: a agachada da aranha (um
   * compromisso de movimento, não um ataque) fala a mesma frase. `restoreTint` e não `clearTint`:
   * o corpo escurece conforme perde vida (ver woundedShade), e limpar o tint aqui devolveria um
   * bicho ferido ao tom cheio — apagando, justamente no instante em que ele ameaça, a única
   * leitura de vida que este jogo tem.
   */
  protected flashThreat(): void {
    this.sprite.setTintFill(WINDUP_FLASH);
    this.scene.time.delayedCall(90, () => {
      if (this.alive && this.sprite.active) this.restoreTint();
    });
  }

  /**
   * ARMA O GOLPE: mira o tile, MARCA o chão dele, avisa (piscada + pose recuada) e se compromete.
   *
   * **O GOLPE ARMADO É UM COMPROMISSO — DELE, E AGORA TAMBÉM SEU.** Um acerto do herói CANCELAVA
   * o ataque telegrafado. Parecia justo e era o defeito: com dano real, trancar o bicho em
   * interrupção vira a estratégia dominante do jogo inteiro — bata a cada 260ms e nada nunca chega
   * a bater em você. Então o windup segue seu curso, e a resposta ao telegrafo volta a ser a que
   * ele sempre prometeu: SAIR DO TILE MIRADO.
   */
  protected startWindup(targetX: number, targetY: number, durationMs: number): void {
    // Fora do quadro não se arma golpe (ver frameGate): o telegrafo é uma promessa DESENHADA, e
    // armar onde ninguém vê é cobrar uma promessa que nunca foi feita. O corpo tenta de novo na
    // próxima janela de ataque.
    if (!this.framed) return;
    // A marca do aviso anterior pode sobreviver um frame ao golpe que a criou (o tween dela fecha
    // logo depois de `tickWindup` resolver). Nenhum ritmo de ataque do jogo chega perto disso, mas
    // um aviso órfão pendurado num tile é caro demais para depender de um número de balanceamento.
    this.clearWindup();
    this.windupLeftMs = durationMs;
    this.windupTargetX = targetX;
    this.windupTargetY = targetY;
    getSoundManager().playUndeadWindup(this.kind); // a voz da especie (ver ENEMY_VOICE)
    this.flashThreat();
    this.poseWindup(Math.sign(this.worldX - targetX), Math.sign(this.worldY - targetY), durationMs * 0.85);
    this.markTargetTile(targetX, targetY, durationMs);
    if (this.guardsWhileWindingUp) this.showGuardGlint(targetX, targetY, durationMs);
  }

  /**
   * Conta o golpe armado do frame. A espécie chama isto no topo do próprio update e obedece:
   *
   *   - `'idle'`   nenhum golpe armado — siga pensando, andando e atacando;
   *   - `'busy'`   comprometido: não anda, não re-arma, saia do update AGORA;
   *   - `'strike'` o golpe caiu no herói — devolva `true`, e o GameScene resolve o dano.
   *
   * O acerto pede DUAS coisas, e a segunda existe por causa do arremesso: o herói tem de estar no
   * tile mirado (sair de lá é a esquiva) **e** o tile mirado tem de continuar ao alcance do corpo.
   * Sem a segunda, um bicho atingido no meio do telegrafo é jogado um tile para trás, fica
   * atordoado, e cobra o golpe de DOIS tiles de distância quando volta a si — um golpe que o
   * jogador vê acontecer por cima de um vão, e que o desenho do bicho nunca prometeu.
   */
  protected tickWindup(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    playerHasTorch: boolean,
  ): 'idle' | 'busy' | 'strike' {
    if (this.windupLeftMs <= 0) {
      // A RECUPERAÇÃO (ver ATTACK_RECOVER_MS): o golpe saiu e o corpo ainda pertence a ele —
      // plantado, caído na pose e SEM guarda (guardsAgainst lê o relógio do windup, que já zerou).
      // Corre aqui dentro para que nenhuma espécie precise conhecê-la: quem obedece 'busy' no
      // windup obedece na recuperação de graça.
      if (this.recoverMs > 0) {
        this.recoverMs = Math.max(0, this.recoverMs - delta);
        return 'busy';
      }
      return 'idle';
    }
    this.windupLeftMs -= delta;
    if (this.windupLeftMs > 0) return 'busy';
    this.windupLeftMs = 0;
    this.recoverMs = ATTACK_RECOVER_MS; // o golpe sai AGORA — e cobra o terceiro tempo dele

    // O GOLPE SAI AGORA — acertando ou não. Quem tem arma bate aqui, e é por isso que este aviso
    // vem antes de decidir o resultado: uma arma que só se movesse quando o golpe conecta seria a
    // mesma mentira que o arco do herói não conta (ele sai mesmo no vazio, de propósito).
    this.onWindupRelease(
      Math.sign(this.windupTargetX - this.worldX),
      Math.sign(this.windupTargetY - this.worldY),
    );

    const reach = Math.abs(this.windupTargetX - this.worldX)
      + Math.abs(this.windupTargetY - this.worldY);
    const struck = reach <= 1
      && playerWorldX === this.windupTargetX
      && playerWorldY === this.windupTargetY
      && !(playerHasTorch && this.fearsTorch);
    if (struck) return 'strike';
    this.whiff();
    return 'busy';
  }

  /**
   * O instante em que o golpe armado SAI, na direção em que ele sai. Nada por padrão — quem tem
   * ARMA na mão a balança aqui (ver UndeadEnemy e o osso dela).
   */
  protected onWindupRelease(_dirX: number, _dirY: number): void {
    // no-op by default
  }

  /**
   * O golpe que encontrou o vazio: ele investe no tile mirado e morde ar.
   *
   * E O TILE RESPONDE. O anel do telegrafo fechou sobre um lugar por meio segundo prometendo um
   * golpe ali, e quando ele saía, ali não acontecia NADA — a esquiva só era desenhada no corpo (a
   * investida e o som), e o lugar que o jogador acabou de abandonar ficava mudo. Um punhado de
   * poeira baixa no tile mirado é o que fecha o laço que a marca abriu: o golpe caiu, caiu ALI, e
   * você não estava lá.
   */
  private whiff(): void {
    this.triggerKnockback(
      Math.sign(this.windupTargetX - this.worldX),
      Math.sign(this.windupTargetY - this.worldY),
    );
    getSoundManager().playUndeadWhiff();
    this.spawnWhiffDust(this.windupTargetX, this.windupTargetY);
  }

  /** A poeira do golpe que bateu no chão: baixa, rasteira e curta — ver `whiff`. */
  private spawnWhiffDust(tileX: number, tileY: number): void {
    // Tres, como os cacos do resvalo: um golpe errado nao pode levantar mais pixel que um acerto,
    // e num cerco os erros sao muito mais frequentes que os acertos.
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + Math.random() * 0.9;
      const puff = world3d()
        .addBillboard(FX_PUFF_TEXTURE, 0, {
          centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02,
        })
        .setTint(0x9a9284)
        .setPosition(tileX, tileY)
        .setElevation(0.04)
        .setDisplaySize(0.17, 0.17)
        .setAlpha(0.65);
      this.scene.tweens.add({
        targets: puff,
        // Rasteira de proposito: ela SAI pelo chão em vez de subir, que e o gesto de uma coisa
        // que bateu na terra. Poeira que sobe e o vocabulario da chegada (ver WalkerEnemy).
        x: tileX + Math.cos(ang) * 0.42,
        y: tileY + Math.sin(ang) * 0.26,
        elevation: 0.12,
        alpha: 0,
        scaleX: 0.36,
        scaleY: 0.36,
        duration: 260 + Math.random() * 120,
        ease: 'Cubic.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  /**
   * O anel que fecha sobre o tile mirado (ver WINDUP_MARK_FROM). Ele é deitado e `emissive`: o
   * aviso tem de ser legível no escuro, que é exatamente onde este jogo acontece — e não pode
   * trazer luz nenhuma, a lei mais cara da casa (uma luz THREE nova recompila o mundo inteiro).
   */
  private markTargetTile(targetX: number, targetY: number, windupMs: number): void {
    const mark = world3d()
      .addBillboard(FX_RING_TEXTURE, 0, {
        additive: true,
        flat: true,
        flatY: 0.06,
        fog: false,
        depthWrite: false,
      })
      .setTint(WINDUP_FLASH)
      .setPosition(targetX, targetY)
      .setDisplaySize(WINDUP_MARK_FROM, WINDUP_MARK_FROM)
      .setAlpha(0.55);
    this.scene.tweens.add({
      targets: mark,
      scaleX: WINDUP_MARK_TO,
      scaleY: WINDUP_MARK_TO,
      alpha: 0.95,
      duration: windupMs,
      ease: 'Quad.easeIn', // fecha devagar e acelera no fim: o instante do golpe é o que se lê
      onComplete: () => this.clearWindup(),
    });
    this.windupMark = mark;
  }

  /** O risco de luz no lado fechado do corpo, durante o telegrafo (ver GUARD_GLINT_TINT). */
  private showGuardGlint(targetX: number, targetY: number, windupMs: number): void {
    const gx = Math.sign(targetX - this.worldX);
    const gy = Math.sign(targetY - this.worldY);
    const glint = world3d()
      .addBillboard(FX_PUFF_TEXTURE, 0, {
        centered: true,
        emissive: true,
        additive: true,
        fog: false,
        depthWrite: false,
      })
      .setTint(GUARD_GLINT_TINT)
      .setPosition(this.worldX + gx * GUARD_GLINT_REACH, this.worldY + gy * GUARD_GLINT_REACH)
      .setElevation(0.45)
      .setDisplaySize(GUARD_GLINT_SIZE, GUARD_GLINT_SIZE * 0.5)
      .setAlpha(0);
    this.guardGlint = glint;
    // Acende depressa e RESPIRA até o golpe sair: parado, ele lê como parte da arte do bicho;
    // pulsando, lê como uma coisa que está ligada agora e que vai acabar.
    this.scene.tweens.add({
      targets: glint,
      alpha: 0.85,
      duration: 110,
      ease: 'Sine.easeOut',
      yoyo: true,
      hold: Math.max(0, windupMs - 300),
      onComplete: () => this.clearGuardGlint(),
    });
  }

  /**
   * Apaga o desenho do telegrafo. Ele é uma PROMESSA — "um golpe cai aqui" — e não pode sobreviver
   * a quem prometeu: um corpo que morre no meio do aviso deixava o anel fechando sozinho sobre um
   * tile onde nada mais vai acontecer, ensinando o jogador a desviar de fantasma. Chamado de
   * `die`, `despawn` e `destroy` AQUI, e não em cada espécie, para que nenhuma possa esquecer.
   */
  private clearWindup(): void {
    this.clearGuardGlint();
    const mark = this.windupMark;
    if (!mark) return;
    this.windupMark = undefined;
    if (this.scene.tweens) this.scene.tweens.killTweensOf(mark);
    mark.destroy();
  }

  private clearGuardGlint(): void {
    const glint = this.guardGlint;
    if (!glint) return;
    this.guardGlint = undefined;
    if (this.scene.tweens) this.scene.tweens.killTweensOf(glint);
    glint.destroy();
  }

  /**
   * Volta a se agachar depois de um solavanco, se o golpe ainda estiver armado.
   *
   * O arremesso e o recuo matam os tweens deste objeto (é o mesmo par de campos), e com eles ia a
   * pose recuada do telegrafo: um corpo empurrado no meio do aviso ficava em pé, neutro e relaxado
   * — enquanto o anel no chão continuava fechando. As duas metades do mesmo aviso discordavam.
   */
  private reposeWindup(): void {
    if (!this.alive) return;
    if (this.windupLeftMs > 0) {
      this.poseWindup(
        Math.sign(this.worldX - this.windupTargetX),
        Math.sign(this.worldY - this.windupTargetY),
        Math.max(60, this.windupLeftMs * 0.85),
      );
      return;
    }
    // Sem golpe armado, o solavanco que acabou de assentar pode ser o LANÇAMENTO do próprio golpe
    // (a investida do whiff, o tombo pra cima do herói): se a recuperação ainda corre, o corpo cai
    // na pose dela em vez de voltar ao neutro — a metade visível do tempo que ele está pagando.
    if (this.recoverMs > 0) this.poseRecover(this.recoverMs);
  }

  /**
   * A POSE DA RECUPERAÇÃO: o corpo AFUNDA um pouco e fica lá, soltando perto do fim do relógio.
   *
   * É o contrário da pose do windup (que recua e segura a mola): aqui a mola já foi gasta. Um
   * mergulho curto de escala — nunca esticar (esticar vaza do tile, a lei mais antiga da casa) — e
   * o retorno ao neutro chega junto com o corpo voltar a agir, então o que se vê e o que se pode
   * punir terminam juntos.
   */
  private poseRecover(ms: number): void {
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      knockbackSquash: 0.9,
      duration: Math.min(110, ms * 0.4),
      yoyo: true,
      hold: Math.max(0, ms - 220),
      ease: 'Sine.easeOut',
    });
  }

  /**
   * Conta os i-frames. Chamado pelo EnemyManager para TODO corpo, todo frame — e não pelo update
   * de cada espécie, que tem saída antecipada no hitstun: um bicho atordoado que não descontasse
   * a própria invulnerabilidade sairia dela mais tarde do que devia, e o segundo golpe do jogador
   * cairia no vazio sem que nada na tela explicasse por quê.
   */
  /**
   * O TREMOR DO ATORDOAMENTO — o hitstun era o único estado de combate sem um pixel próprio.
   *
   * `tickHitstun` só devolve `true` e a espécie sai do update: os 300ms que todo golpe compra eram
   * exatamente iguais, na tela, a um corpo parado por vontade própria. O tremor é derivado do
   * relógio (nenhum tween novo por golpe, a mesma economia da piscada dos i-frames) e escrito no
   * ÂNGULO, que é o canal do corpo que o tombo do passo já usa — só que rápido: o passo tomba a
   * 260ms por meio ciclo, o tremor vibra a ~125ms por ciclo inteiro, e a frequência é o que separa
   * "andando" de "zonzo". Decai no fim para o corpo assentar antes de voltar a agir.
   *
   * Chamado pelo EnemyManager para todo corpo, todo frame — pelo mesmo motivo dos i-frames: o
   * update da espécie sai cedo justamente no estado que este método desenha.
   */
  public tickStunFx(delta: number): void {
    if (!this.alive) return;
    // Congelado o corpo é RÍGIDO: o tremor de zonzo num bloco de gelo desmentiria a estátua
    // (quem treme ali é o BLOCO, e só no telegrafo de degelo — ver FreezeManager.renderEntry).
    if (this.frozenFlag) return;
    if (this.hitstunMs > 0 && !this.isSpawning) {
      this.stunWobbleMs += delta;
      const decay = Math.min(1, this.hitstunMs / 200);
      this.sprite.setAngle(Math.sin(this.stunWobbleMs * 0.05) * 7 * decay);
    } else if (this.stunWobbleMs > 0) {
      this.stunWobbleMs = 0;
      this.sprite.setAngle(0);
    }
  }

  public tickHurtInvuln(delta: number): void {
    if (this.hurtInvulnMs <= 0) return;
    this.hurtInvulnMs = Math.max(0, this.hurtInvulnMs - delta);
    // A piscada é DERIVADA do relógio, não tweenada: um tween a mais por golpe seria alocação no
    // meio da briga, e o relógio já existe. Só escreve no alpha na TROCA de fase — `apply()` do
    // billboard reescreve o mesh inteiro a cada set, e mandar o mesmo alpha 60 vezes por segundo é
    // trabalho de graça.
    const on = this.hurtInvulnMs > 0 && Math.floor(this.hurtInvulnMs / HURT_BLINK_HALF_MS) % 2 === 1;
    if (on === this.blinkDown) return;
    this.blinkDown = on;
    this.sprite.setAlpha(on ? HURT_BLINK_ALPHA : 1);
  }

  // ── A TOCHA VIVA (ver o bloco de constantes) ────────────────────────────────

  /**
   * O FOGO ALCANÇOU ESTE CORPO. Devolve `false` quando recusa: morto, já ardendo, nascendo
   * (a invulnerabilidade do spawn vale para chama também) ou da água (ver `flammable`).
   *
   * NÃO passa por `takeDamage` de propósito, e isso importa duas vezes: a ignição não é dano
   * (o corpo morre no fim do relógio, não aqui), e o caminho do dano tem i-frames — que estão
   * SEMPRE correndo no instante do encontrão, porque o arremesso vem de um golpe. Fogo que
   * respeitasse i-frames nunca acenderia ninguém.
   */
  public igniteBody(): boolean {
    // O corpo congelado não pega fogo por esta porta: quem chega antes é o degelo (o
    // igniteFlammableAt derrete o gelo e o fogo se gasta nisso — ver FreezeManager.meltAt).
    // Este guarda é a rede para um caminho novo de fogo que esqueça de perguntar.
    if (this.frozenFlag) return false;
    if (!this.alive || this.burnLeftMs > 0 || this.isSpawning || !this.flammable) return false;
    this.burnLeftMs = BURN_TOTAL_MS;
    this.burnStepMs = 0;
    this.burnTintMs = 0;
    // O golpe armado morre no fogo: um corpo em pânico não cumpre promessa nenhuma. Ao contrário
    // do die(), aqui também não há corrida com o tween da marca — um corpo em chamas nunca mais
    // roda tickWindup (o EnemyManager troca o update da espécie pelo pânico).
    this.windupLeftMs = 0;
    this.recoverMs = 0;
    this.clearWindup();

    // Duas chamas da MESMA arte da tocha do herói, cavalgando o corpo (ver renderBurnFlames):
    // uma larga na base e uma menor na cabeça — a silhueta de coisa-pegando-fogo, não um efeito
    // colado num ponto. `emissive` para arder no escuro, e NENHUMA luz própria: a luz de verdade
    // vem emprestada do pool fixo logo abaixo.
    for (let i = 0; i < 2; i++) {
      this.burnFlames.push(
        world3d()
          .addBillboard(BURN_FLAME_KEYS[i], 0, {
            centered: true, fog: false, depthWrite: false, emissive: true,
            alphaTest: 0.05, emissiveBoost: 3,
          })
          .setPosition(this.worldX, this.worldY)
          .setElevation(i === 0 ? 0.26 : 0.58)
          .setDisplaySize(i === 0 ? 0.46 : 0.3, i === 0 ? 0.46 : 0.3)
          .setAlpha(0.95),
      );
    }
    // A luz É uma fogueira: a mesma entrada do pool fixo que arbusto e lava usam (nenhuma luz
    // THREE nasce aqui — a lei do FIRE_LIGHT_SLOTS), só que andando (ver setPosition no render).
    // É também o que faz os outros monstros abrirem caminho de verdade: a parede que eles
    // respeitam no EnemyManager é a leitura LÓGICA desta mesma luz.
    this.burnFire = world3d().addFireLight(this.worldX, this.worldY, true);
    this.burnFire.setIntensityScale(0.55);
    return true;
  }

  /**
   * O relógio do fogo. Corre no EnemyManager para TODO corpo, todo frame — como os i-frames, e
   * pelo mesmo motivo: o update da espécie não roda enquanto o corpo arde (vira pânico), e o
   * fogo não pode congelar junto com a IA fora do alcance dela. No fim, o corpo cai sozinho:
   * a morte é `die()` de verdade (marca no chão, desmanche) — o fogo matou, ninguém despejou.
   */
  public tickBurn(delta: number): void {
    if (!this.alive || this.burnLeftMs <= 0) return;
    this.burnLeftMs = Math.max(0, this.burnLeftMs - delta);
    this.burnChar01 = Math.max(this.burnChar01, (1 - this.burnLeftMs / BURN_TOTAL_MS) * 0.85);

    // O corpo CARBONIZA no caminho: o tom de carvão avança com o relógio (ver BURN_CHAR_R e
    // burnCharShade — restoreTint passa por lá, então piscada de ameaça e troca de textura de
    // dano devolvem o corpo queimado, nunca o corpo limpo).
    this.burnTintMs += delta;
    if (this.burnTintMs >= BURN_CHAR_TINT_MS) {
      this.burnTintMs = 0;
      this.restoreTint();
    }

    if (this.burnLeftMs <= 0) {
      // A voz da morte com o gate do quadro (a lei: fora da tela o corpo não fala) — o rastro
      // em chamas costuma terminar longe de onde começou.
      if (this.framed) getSoundManager().playEnemyDeath(this.kind);
      this.die();
    }
  }

  /**
   * O PÂNICO — o que roda NO LUGAR do update da espécie enquanto o corpo arde (EnemyManager).
   *
   * Corre DO HERÓI, e isso é uma alavanca e não um detalhe: fogo é o sistema que o jogador
   * conduz, então a tocha viva também se conduz — andar sobre ela a empurra para onde se quer
   * que o fogo vá. Cada passo tenta acender o próprio tile e os 4 vizinhos (emberTouch — o
   * mesmo buraco de fechadura do espalhamento), e é assim que o fogo PULA de corpo em corpo:
   * o vizinho do rastro pode ser mato, ponte, fogueira morta ou outro monstro.
   *
   * O atordoamento vale aqui também (um golpe ainda segura o corpo), e quem escreve a própria
   * posição (torreta, zora — ver canBeShoved) arde PARADO: mover mobília seria o mesmo bug que
   * o arremesso já recusa.
   */
  public updateBurning(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    isBlocked: (wx: number, wy: number) => boolean,
  ): void {
    if (this.tickHitstun(delta)) return;
    this.burnStepMs += delta;
    if (this.burnStepMs < BURN_PANIC_STEP_MS) return;
    this.burnStepMs = 0;
    if (this.canBeShoved) this.moveAway(playerWorldX, playerWorldY, isBlocked);
    EnemyBase.emberTouch(this.worldX, this.worldY);
  }

  /**
   * As chamas e a luz seguem o corpo DESENHADO (posição visual, com o deslize do passo e do
   * arremesso), nunca o tile lógico — a mesma lei do overlay 2D preso ao herói: a lógica pula
   * pro destino quando o passo começa, e fogo parado esperando o corpo chegar lê como erro.
   */
  private renderBurnFlames(): void {
    const t = this.scene.time.now;
    const vx = this.worldX + this.knockbackOffsetX;
    const vy = this.worldY + this.knockbackOffsetY;
    this.burnFire?.setPosition(vx, vy);
    const frame = Math.floor(t / BURN_FLAME_FRAME_MS);
    const swap = frame !== this.burnFlameFrame;
    this.burnFlameFrame = frame;
    for (let i = 0; i < this.burnFlames.length; i++) {
      const flame = this.burnFlames[i];
      const sway = Math.sin(t * 0.011 + i * 2.4) * 0.06;
      flame
        .setPosition(vx + (i === 0 ? -0.08 : 0.1) + sway, vy)
        .setElevation((i === 0 ? 0.26 : 0.58) + Math.sin(t * 0.017 + i * 1.7) * 0.04);
      if (swap) flame.setTexture(BURN_FLAME_KEYS[(frame + i) % BURN_FLAME_KEYS.length]);
    }
  }

  /** O tom atual do carvão: a base (já ferida) puxada para BURN_CHAR_* pelo quanto já queimou.
   * Lê `burnChar01` (história) e não o relógio: um corpo que o fogo matou DESMANCHA queimado. */
  private burnCharShade(base: number): number {
    if (this.burnChar01 <= 0) return base;
    const progress = this.burnChar01;
    const mix = (shift: number, target: number): number => {
      const from = (base >> shift) & 0xff;
      return Math.round(from + (target - from) * progress) << shift;
    };
    return mix(16, BURN_CHAR_R) | mix(8, BURN_CHAR_G) | mix(0, BURN_CHAR_B);
  }

  /** Apaga o desenho do fogo (chamas + luz emprestada). O ESTADO morre com o corpo — quem chama
   * é die/despawn/destroy, e um corpo que sobrevive a isto não existe. */
  private clearBurn(): void {
    this.burnLeftMs = 0;
    for (const flame of this.burnFlames) {
      if (this.scene.tweens) this.scene.tweens.killTweensOf(flame);
      flame.destroy();
    }
    this.burnFlames.length = 0;
    this.burnFire?.destroy();
    this.burnFire = undefined;
  }

  /**
   * O INSTANTE DE NOTAR (ver NOTICE_REARM_MS). A espécie diz, todo tick, se ela VÊ o herói — e
   * este método descobre a fronteira: a primeira transição vagar→caçar dispara o susto
   * (`startleNotice`). A primeira avaliação da vida semeia em silêncio, porque um corpo que nasce
   * já vendo o herói acabou de fazer a própria chegada — o telegrafo mais longo do jogo — e um
   * susto em cima dela seria o mesmo aviso duas vezes.
   */
  protected noteSeesHero(sees: boolean, delta: number): void {
    if (this.noticeVirgin) {
      this.noticeVirgin = false;
      this.noticeSeen = sees;
      return;
    }
    if (sees) {
      if (!this.noticeSeen && this.noticeRearmMs >= NOTICE_REARM_MS) this.startleNotice();
      this.noticeSeen = true;
      this.noticeRearmMs = 0;
    } else {
      this.noticeSeen = false;
      this.noticeRearmMs += delta;
    }
  }

  /** O susto de notar: clarão âmbar no corpo, duas fagulhas subindo da cabeça, um sopro curto. */
  private startleNotice(): void {
    // Fora do quadro o susto inteiro se cala (clarão, fagulhas E sopro): a caveira enxerga a 14
    // tiles, bem além da tela, e o sopro dela era voz de bicho invisível. O estado de "viu"
    // (noticeSeen) segue normal — só a encenação é que precisa de plateia.
    if (!this.alive || this.isSpawning || this.isStunned || this.isWindingUp || !this.framed) return;
    this.sprite.setTintFill(NOTICE_FLASH);
    this.scene.time.delayedCall(90, () => {
      if (this.alive && this.sprite.active) this.restoreTint();
    });
    this.spawnNoticeMotes();
    getSoundManager().playCreatureNotice(this.kind);
  }

  /**
   * Duas fagulhas âmbar saltando de cima da cabeça — a ZONA DA INTENÇÃO, a mesma do balão de
   * placa da caveira: o que o corpo pensa mora acima dele, o que o corpo sofre mora no peito.
   */
  private spawnNoticeMotes(): void {
    for (let i = 0; i < 2; i++) {
      const mote = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, emissive: true, additive: true, fog: false, depthWrite: false,
        })
        .setTint(NOTICE_FLASH)
        .setPosition(this.worldX + (i === 0 ? -0.12 : 0.12), this.worldY)
        .setElevation(0.95)
        .setDisplaySize(0.09, 0.09)
        .setAlpha(0.95);
      this.scene.tweens.add({
        targets: mote,
        elevation: 1.22 + Math.random() * 0.12,
        alpha: 0,
        scaleX: 0.4,
        scaleY: 0.4,
        duration: 200 + i * 60,
        ease: 'Cubic.easeOut',
        onComplete: () => mote.destroy(),
      });
    }
  }

  /**
   * O EMPURRAO DE VERDADE: o golpe move o corpo um tile, e nao so o desenho dele.
   *
   * Era so um deslocamento de render que voltava sozinho, entao bater e nao bater davam o mesmo
   * tabuleiro — e um jogo de grade em que o golpe nao abre espaco nao tem espacamento, que e a
   * unica coisa que uma luta corpo a corpo tem pra ensinar. (No `A Link to the Past` a primeira
   * sala e desenhada com um nicho do tamanho exato do arremesso, so pra ensinar isto.)
   *
   * `canEnter` vem de fora porque quem sabe o que e solido e o GameScene — inclusive a luz de
   * fogueira, que continua sendo parede: arremessar um bicho pra dentro da luz nao pode ser a
   * porta dos fundos da lei que diz que monstro nao existe nela.
   *
   * E o que devolve nao e um booleano, e o QUE ACONTECEU — porque bloquear tem dois sentidos
   * opostos. `'slammed'` e o corpo que bateu numa parede: encurralar e a jogada BOA, e ela era a
   * mais silenciosa do jogo (caia no mesmo recuo elastico de um empurrao qualquer). `'immovable'`
   * e a torreta e o zora, que escrevem a propria posicao — ali nao ha parede nenhuma, so um corpo
   * que nao anda, e celebrar isso ensinaria uma tatica que nao existe.
   */
  public shove(
    dx: number,
    dy: number,
    canEnter: (wx: number, wy: number) => boolean,
  ): 'moved' | 'slammed' | 'immovable' {
    if (!this.alive || (dx === 0 && dy === 0)) return 'immovable';
    if (!this.canBeShoved) {
      this.triggerKnockback(dx, dy);
      return 'immovable';
    }
    if (!canEnter(this.worldX + dx, this.worldY + dy)) {
      // O ENCONTRAO: o mesmo recuo, mais fundo e mais esmagado — o corpo chega na parede e para
      // de verdade, em vez de quicar como quem foi so cutucado.
      this.triggerKnockback(dx * 1.5, dy * 1.5);
      this.knockbackSquash = 0.62;
      return 'slammed';
    }

    this.worldX += dx;
    this.worldY += dy;
    // Ele SAI do tile antigo deslizando (a mesma gramatica do passo), so que esticado e rapido:
    // teleportar um tile no frame do impacto leria como um bug, nao como um arremesso.
    this.scene.tweens.killTweensOf(this);
    this.stepTween?.stop();
    this.sprite.setAngle(0);
    this.knockbackOffsetX = -dx;
    this.knockbackOffsetY = -dy;
    this.knockbackSquash = 0.8;
    this.scene.tweens.add({
      targets: this,
      knockbackOffsetX: 0,
      knockbackOffsetY: 0,
      knockbackSquash: 1.0,
      duration: 200,
      ease: 'Power3.easeOut',
      onComplete: () => this.reposeWindup(),
    });
    return 'moved';
  }

  public setPlateTarget(_target?: { x: number; y: number }): void {
    // no-op: so quem busca placa implementa
  }

  /** Apply damage (default 1). Weak weapons pass fractions — e.g. the wood club deals 0.5. */
  public takeDamage(amount = 1): boolean {
    if (!this.alive) return false;
    // Recusa o golpe que chega dentro da janela de i-frames (ver hurtInvulnMs). Quem chama SEMPRE
    // pergunta antes (`isHurtInvulnerable`) para poder responder na tela — este guarda é a rede,
    // não a porta: sem ele, um caminho novo de dano (uma bomba, o fogo do chão) fura a regra em
    // silêncio e ninguém descobre até o combate voltar a ser uma serra.
    if (this.hurtInvulnMs > 0) return false;
    this.hurtInvulnMs = HURT_INVULN_MS;
    this.health -= amount;

    // A PISCADA BRANCA FOI ARRANCADA. Um `setTintFill(0xffffff)` num billboard `emissive` nao e
    // uma piscada: e uma silhueta chapada de branco puro que o bloom espalha pela tela, e o
    // hitstop de 60-110ms a CONGELA acesa — bater num bicho cegava quem estava olhando pra ele.
    // O golpe continua respondendo no corpo por tudo o que ja fazia e nao depende de luz: a
    // faisca do impacto, o baque da tela, o arremesso de um tile e o atordoamento.
    if (this.hurtTexture) {
      this.sprite.setTexture(this.hurtTexture);
      this.scene.time.delayedCall(150, () => {
        if (this.alive) {
          this.sprite.setTexture(this.normalTexture);
          // ...e ele volta MAIS ESCURO que antes, porque `restoreTint` passa pelo `woundedShade`
          // (ver abaixo). Com uma exceção: a caveira devolve a base intacta, porque a arte dela é
          // osso claro e escurecê-la a tornava difícil de ver na noite — ver UndeadEnemy.
          this.restoreTint();
        }
      });
    } else {
      // SEM ARTE DE DANO: o corpo recua em VALOR (ver HURT_DARKEN_TINT). Antes esta linha era um
      // `restoreTint()` solto, que com a vida cheia devolve exatamente a cor que já estava lá — ou
      // seja, quatro das sete espécies não tinham resposta nenhuma de corpo ao primeiro golpe.
      this.sprite.setTint(HURT_DARKEN_TINT);
      this.scene.time.delayedCall(HURT_DARKEN_MS, () => {
        if (this.alive && this.sprite.active) this.restoreTint();
      });
    }

    if (this.health <= 0) {
      // A piscada não pode vazar para a morte: o desmanche tweena o alpha a partir de onde ele
      // estiver, e começar de 0.35 faria o corpo sumir cedo demais.
      this.blinkDown = false;
      this.sprite.setAlpha(1);
      this.die();
      return true;
    }
    return false;
  }

  public abstract update(
    delta: number,
    playerX: number,
    playerY: number,
    playerSafe: boolean,
    playerHasTorch: boolean,
    isBlocked: (wx: number, wy: number) => boolean,
  ): boolean;

  /**
   * A blow glanced off (spawn invulnerability): flash a pale cold tint for a beat. Tint only —
   * never the hurtTexture swap, which is the "real damage" signal.
   */
  public flashImmune(): void {
    if (!this.alive) return;
    this.sprite.setTintFill(0xaec6ff);
    this.scene.time.delayedCall(90, () => {
      if (this.alive && this.sprite.active) this.restoreTint();
    });
  }

  /**
   * Devolve a cor de base depois de uma piscada. E um metodo e nao um `clearTint` solto porque uma
   * especie pode ter tom PERMANENTE (o mago frio, que divide a arte com o NPC mago): limpar o tint
   * la o devolveria branco, e ele leria como o outro personagem por um instante.
   */
  protected restoreTint(): void {
    // O carvão da tocha viva multiplica por cima do tom ferido: um corpo em chamas que pisca
    // de ameaça ou troca a textura de dano volta QUEIMADO, nunca limpo.
    const shade = this.burnCharShade(this.woundedShade());
    if (shade === 0xffffff) this.sprite.clearTint();
    else this.sprite.setTint(shade);
  }

  /**
   * O CORPO CONTA QUANTO AGUENTA — a substituta da barra de vida, que este jogo nunca desenhou.
   *
   * Havia uma `Graphics` por inimigo, limpa a cada frame e nunca preenchida: a barra tinha sido
   * removida por design (o mundo ensina, o HUD não) e o esqueleto dela ficou. Mas a decisão de não
   * ter barra deixou um buraco no dia em que a espada parou de matar de um golpe: com dois ou três
   * acertos por corpo, o jogador precisa saber se está progredindo, e a piscada de dano dura 150ms
   * e some.
   *
   * Então o corpo ESCURECE conforme perde vida — um tom multiplicativo, permanente, que se soma à
   * leitura que já existia. É a direção certa por lei da casa: acender um billboard `emissive` é
   * silhueta chapada que o bloom espalha (ver o comentário do `takeDamage`), escurecer não.
   *
   * Recebe a cor BASE e devolve ela escurecida, em vez de devolver um tom absoluto: há espécie com
   * tom permanente (o mago frio, que divide a arte com o NPC mago), e um tom absoluto apagaria a
   * identidade dela justamente enquanto ela apanha. Com a vida cheia devolve a base intacta.
   */
  protected woundedShade(base = 0xffffff): number {
    if (this.health >= this.maxHealth) return base;
    // 0 = intacto, 1 = no último ponto de vida.
    const hurt = 1 - Math.max(0, this.health - 1) / Math.max(1, this.maxHealth - 1);
    const mix = (shift: number, floor: number): number => {
      const from = (base >> shift) & 0xff;
      return Math.round(from + (from * (floor / 255) - from) * hurt) << shift;
    };
    return mix(16, 0x8c) | mix(8, 0x6a) | mix(0, 0x6a);
  }

  /**
   * Rear back into a HELD pose (the attack wind-up): ease away from the strike direction
   * and crouch slightly, then stay there — the release (the lunge of a landed hit or a
   * whiffed triggerKnockback) is its own tween and overwrites this one.
   */
  protected poseWindup(awayX: number, awayY: number, ms: number): void {
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      knockbackOffsetX: awayX * 0.2,
      knockbackOffsetY: awayY * 0.2,
      knockbackSquash: 0.86,
      duration: ms,
      ease: 'Sine.easeOut',
    });
  }

  /**
   * O ÚLTIMO EMPURRÃO: a direção do golpe que MATOU, aplicada ao corpo que já está caindo.
   *
   * Todo golpe que não mata arremessa o corpo um tile (`shove`) — o que mata não movia nada. A cena
   * chamava `triggerKnockback` para o corpo morto e ela saía na primeira linha (`!alive`); e mesmo
   * que não saísse, `render()` para de escrever a posição do billboard depois da morte, então o
   * deslocamento não teria por onde aparecer. O melhor golpe do jogo era o único que deixava o
   * corpo exatamente onde ele estava, inchando e desmanchando de pé.
   *
   * Por isso ele anda na POSIÇÃO do próprio billboard, que é o que o desmanche já usa. A ossada
   * continua caindo no tile LÓGICO (ver EnemyManager): a marca pertence ao lugar onde ele morreu,
   * não ao ponto onde os pixels pararam.
   */
  public deathFling(dx: number, dy: number): void {
    if (this.alive || !this.sprite.active) return;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    // Guardada para quem tem morte própria: as peças da caveira se espalham a favor do golpe.
    this.deathDir = { x: dx / len, y: dy / len };
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.sprite.x + (dx / len) * DEATH_FLING_TILES,
      y: this.sprite.y + (dy / len) * DEATH_FLING_TILES,
      duration: DEATH_FLING_MS,
      ease: 'Power3.easeOut',
    });
  }

  public triggerKnockback(dx: number, dy: number): void {
    if (!this.alive) return;
    this.scene.tweens.killTweensOf(this);
    this.knockbackOffsetX = dx * 0.38;
    this.knockbackOffsetY = dy * 0.38;
    this.knockbackSquash = 0.78;
    this.scene.tweens.add({
      targets: this,
      knockbackOffsetX: 0,
      knockbackOffsetY: 0,
      knockbackSquash: 1.0,
      duration: 230,
      ease: 'Power3.easeOut',
      // Assentado o solavanco, o corpo volta a se agachar se o golpe ainda estiver armado.
      onComplete: () => this.reposeWindup(),
    });
  }

  /**
   * Play the footstep animation for a completed grid step: the sprite starts back at the
   * old tile and slides into the new one, tilting slightly left/right on alternate steps.
   */
  private animateStep(ox: number, oy: number): void {
    this.scene.tweens.killTweensOf(this);
    this.knockbackOffsetX = -ox;
    this.knockbackOffsetY = -oy;
    this.scene.tweens.add({
      targets: this,
      knockbackOffsetX: 0,
      knockbackOffsetY: 0,
      duration: 260,
      ease: 'Sine.easeOut',
    });

    this.stepFlip = !this.stepFlip;
    this.stepTween?.stop();
    this.sprite.setAngle(this.stepFlip ? 9 : -9);
    this.stepTween = this.scene.tweens.add({
      targets: this.sprite,
      angle: 0,
      duration: 260,
      ease: 'Sine.easeOut',
    });
  }

  public render(tileSize: number, camera: WorldCamera): void {
    if (!this.alive) return;

    // The billboard lives in tile space; knockback/step offsets are already tile units.
    const scale = this.spriteScale * this.knockbackSquash;
    this.sprite
      .setPosition(this.worldX + this.knockbackOffsetX, this.worldY + this.knockbackOffsetY)
      .setDisplaySize(scale, scale);

    this.lastScreen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    this.lastTileSize = tileSize;

    if (this.burnLeftMs > 0) this.renderBurnFlames();
    this.onRendered(camera, tileSize);
  }

  /**
   * Hook for screen-space FX a subclass pins to this body (the undead's thought balloon).
   * It gets the CAMERA rather than the projected point because anything floating above the
   * head has to be projected at its own elevation — the 3D perspective shrinks a tile with
   * depth, so a fixed pixel offset would drift off the head as the creature walks away.
   */
  protected onRendered(_camera: WorldCamera, _tileSize: number): void {
    // no-op by default
  }

  public destroy(): void {
    this.clearBurn();
    this.clearWindup();
    if (this.scene.tweens) {
      this.scene.tweens.killTweensOf(this.sprite);
      this.scene.tweens.killTweensOf(this);
    }
    this.sprite.destroy();
  }

  protected die(): void {
    this.alive = false;
    // O fogo morre com o corpo (o desmanche já é cinza): chamas penduradas num corpo que está
    // encolhendo leriam como um segundo incêndio, e a luz emprestada tem de voltar pro pool.
    this.clearBurn();
    // O golpe armado morre com quem o armou. `clearWindup` sozinho apaga só o DESENHO do aviso, e
    // de propósito: ele também é chamado pelo fim do tween da marca, que fecha no mesmo instante em
    // que `tickWindup` resolve o golpe — zerar o relógio de lá engoliria o acerto uma vez a cada
    // tantas. Aqui não há corrida: o corpo acabou.
    this.windupLeftMs = 0;
    this.clearWindup();
    // MORREU (não foi despejado): quem enterra é o EnemyManager, no frame em que o corpo termina
    // de sumir. Um booleano e não uma chamada aqui porque a marca pertence ao instante em que o
    // corpo some, e não ao instante em que a vida chega a zero — no meio há uma animação inteira.
    this.corpseMark = this.leavesCorpseMark;
    // The step tilt also tweens sprite.angle; stop it so it can't fight the crumble spin.
    this.stepTween?.stop();
    this.onDeath();
    // Impact pop: swell for a beat, then crumble away spinning. O clarao branco daqui saiu pelo
    // mesmo motivo que o do dano (ver takeDamage) — e ele era o pior dos dois, porque o hitstop
    // da morte e o mais longo do jogo e segurava a silhueta branca acesa na tela inteira.
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.sprite.scaleX * 1.35,
      scaleY: this.sprite.scaleY * 1.35,
      duration: 70,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!this.sprite.active) return;
        this.restoreTint();
        // O PICO do desmanche: o corpo inchou e vai começar a sumir. É aqui que uma espécie com
        // morte PRÓPRIA entra (a caveira se parte em pedaços) — depois deste instante o corpo já
        // está encolhendo, e uma peça que nascesse mais tarde nasceria de um corpo pela metade.
        this.onCrumble();
        this.scene.tweens.add({
          targets: this.sprite,
          alpha: 0,
          scaleX: 0.1,
          scaleY: 0.1,
          angle: Phaser.Math.Between(-40, 40),
          duration: 240,
          ease: 'Power2.easeIn',
          onComplete: () => {
            this.sprite.setVisible(false);
            this.pendingRemoval = true;
          },
        });
      },
    });
  }

  /** Override to add death effects (pool, spawn, etc.) */
  protected onDeath(): void {
    // no-op by default
  }

  /**
   * O pico do desmanche — o instante entre o inchaço e o corpo começar a sumir (ver `die`).
   *
   * `onDeath` acontece cedo demais para uma morte com arte própria: ele roda no frame em que a vida
   * chega a zero, com o corpo ainda inteiro e parado. Este roda no pico do gesto, que é onde uma
   * silhueta pode se PARTIR sem que o olho perca o fio entre o corpo e as peças.
   */
  protected onCrumble(): void {
    // no-op by default
  }

  /**
   * A direção do golpe que matou, se houve uma (ver `deathFling`). Uma morte com arte própria
   * espalha as peças a favor dela — foi de lá que veio a pancada.
   */
  protected get deathDirection(): { x: number; y: number } | undefined {
    return this.deathDir;
  }

  private deathDir?: { x: number; y: number };

  /**
   * Quiet removal (no loot, no onDeath): the dark reclaims its own when the hero reaches a
   * campfire's safety. The skull turns pitch-black silhouette and melts back into the
   * ground while wisps of shadow curl up from the spot. Distinct from die(), a combat kill.
   */
  public despawn(): void {
    if (!this.alive) return;
    this.alive = false;
    this.clearBurn(); // um corpo em chamas despejado a 18 tiles não pode vazar chama nem luz
    this.windupLeftMs = 0; // ver `die()`: o relógio só se zera onde não há corrida com o tween
    this.clearWindup();
    this.scene.tweens.killTweensOf(this);
    this.stepTween?.stop();
    this.sprite.setAngle(0);
    // A PISCADA NÃO PODE VAZAR PARA O DESMANCHE — a mesma lei que `die()` já respeitava. O
    // desmanche tweena o alpha a partir de onde ele estiver, e um corpo despejado no vale da
    // piscada dos i-frames começaria a derreter em 0.35: meio some, e o resto parece um engasgo.
    this.blinkDown = false;
    this.sprite.setAlpha(1);
    this.sprite.setTintFill(0x05060f);

    this.spawnShadowWisps();
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: 0.08,
      alpha: 0,
      duration: 520,
      ease: 'Power2.easeIn',
      onComplete: () => {
        this.sprite.setVisible(false);
        this.pendingRemoval = true;
      },
    });
  }

  /** Pale cold wisps rising from where a despawning skull melted into the ground (2D overlay FX). */
  private spawnShadowWisps(): void {
    const w = this.lastTileSize;
    const x = this.lastScreen.x;
    const groundY = this.lastScreen.y;
    for (let i = 0; i < 4; i++) {
      const wisp = this.scene.add
        .circle(
          x + Phaser.Math.Between(-Math.round(w * 0.3), Math.round(w * 0.3)),
          groundY - Phaser.Math.Between(0, 4),
          Math.max(2, Math.round(w * 0.12)),
          0x6c7aa8,
          0.55,
        )
        .setDepth(SCENE_DEPTHS.player + 1);
      this.scene.tweens.add({
        targets: wisp,
        y: groundY - w * (0.7 + Math.random() * 0.6),
        x: wisp.x + Phaser.Math.Between(-5, 5),
        alpha: 0,
        scale: 0.4,
        delay: i * 80,
        duration: 480 + i * 90,
        ease: 'Sine.easeOut',
        onComplete: () => wisp.destroy(),
      });
    }
  }

  protected moveToward(
    targetX: number,
    targetY: number,
    isBlocked: (wx: number, wy: number) => boolean,
  ): void {
    const dx = targetX - this.worldX;
    const dy = targetY - this.worldY;

    const primary: [number, number] = Math.abs(dx) >= Math.abs(dy)
      ? [Math.sign(dx), 0]
      : [0, Math.sign(dy)];
    const secondary: [number, number] = Math.abs(dx) >= Math.abs(dy)
      ? [0, Math.sign(dy)]
      : [Math.sign(dx), 0];

    for (const [ox, oy] of [primary, secondary]) {
      if (ox === 0 && oy === 0) continue;
      if (!isBlocked(this.worldX + ox, this.worldY + oy)) {
        this.stepTo(ox, oy);
        return;
      }
    }
  }

  /**
   * Da UM passo na direcao pedida, sem perguntar nada: quem chamou ja checou o bloqueio. E o
   * unico lugar que mexe em worldX/worldY, e por isso o unico que sabe animar o passo — uma
   * especie com movimento proprio (o rodeio do mago) precisa desta porta para nao reimplementar
   * o deslize e o tombo lateral do passo.
   */
  protected stepTo(ox: number, oy: number): void {
    this.worldX += ox;
    this.worldY += oy;
    // Andar NAO espelha o corpo. Havia um `setFlipX(ox < 0)` aqui, e ele nunca fez nada — o
    // espelho morria no `apply()` do billboard no mesmo frame (ver Billboard3D.flipped). Consertada
    // a plataforma, ele passaria a valer, e valeria errado: este bestiario e desenhado DE FRENTE
    // (caveira, aranha, morcego, gosma, mago), entao espelhar nao vira ninguem — so inverte a luz,
    // que nesta arte vem sempre da esquerda. Quem e vista de LADO pede o espelho por conta propria,
    // e hoje ha uma so: o zora, que precisa encarar o lado pra onde cospe.
    this.animateStep(ox, oy);
  }

  protected moveAway(
    fromX: number,
    fromY: number,
    isBlocked: (wx: number, wy: number) => boolean,
  ): void {
    const dx = this.worldX - fromX;
    const dy = this.worldY - fromY;

    const primary: [number, number] = Math.abs(dx) >= Math.abs(dy)
      ? [Math.sign(dx) || 1, 0]
      : [0, Math.sign(dy) || 1];
    const secondary: [number, number] = Math.abs(dx) >= Math.abs(dy)
      ? [0, Math.sign(dy) || 1]
      : [Math.sign(dx) || 1, 0];

    for (const [ox, oy] of [primary, secondary]) {
      if (!isBlocked(this.worldX + ox, this.worldY + oy)) {
        this.stepTo(ox, oy);
        return;
      }
    }
  }

  protected wander(isBlocked: (wx: number, wy: number) => boolean): void {
    const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const [ox, oy] = dirs[Phaser.Math.Between(0, 3)];
    if (!isBlocked(this.worldX + ox, this.worldY + oy)) this.stepTo(ox, oy);
  }
}
