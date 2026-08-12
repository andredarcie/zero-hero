import type Phaser from 'phaser';

import { ASSET_KEYS, BLOOM_BLOWS } from '@/game/constants';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, FX_RING_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { PropDir } from '@/game/world/worldSchema';
import type { WorldProp } from './WorldProp';

/**
 * O MARTINETE — o momento em que este jogo encena a Revolucao Industrial.
 *
 * A esponja que sai do forno esta encharcada de escoria e so vira metal util depois de MARTELADA
 * quente, ate a escoria espirrar fora. O jogador faz isso com o botao A, esponja por esponja — e e
 * tedioso de proposito, porque foi tedioso de verdade por mil anos. O martinete e a resposta
 * historica exata: uma VIGA pesada pivotada num mancal, com o malho pendurado numa ponta; cames no
 * eixo da RODA D'AGUA erguem a outra ponta e soltam, e a viga desaba em arco sobre a bigorna. Foi
 * assim que as forjas medievais tiraram esse trabalho das costas de um homem.
 *
 * A arte sai de referencia de dominio publico, e nao de invencao (ver o spec no spritefactory): o
 * Schwanzhammer de Trattenbach, o belly helve hammer de Wortley Top Forge e a xilogravura do Nong
 * Shu (Wang Zhen, ~1313). Isso importa aqui e nao so la, porque foi a MAQUINA ERRADA que travou
 * este arquivo por tres versoes: desenhado como martelo de QUEDA (guias verticais, sec. XIX), o
 * movimento tinha de caber numa calha de 16px de altura e nao havia pixel que chegasse. A viga da
 * o curso de graca — ela e comprida, entao um giro pequeno no mancal e um deslocamento grande na
 * ponta —, e ainda move DUAS coisas em sentidos opostos: a ponta sobe e a cauda afunda.
 *
 * E e por isso que ele custa 3 watts: a roda d'agua da 4. **Uma roda banca exatamente um martinete
 * e sobra 1 para a esteira que leva o ferro embora.**
 *
 * ── A BIGORNA E A BASE DELE ─────────────────────────────────────────────────────────────────
 * A peca entra DENTRO da maquina, como carga, e nao num tile vizinho. A versao anterior batia no
 * tile a frente e o custo apareceu em campo, duas vezes: a maquina nasce virada para onde o heroi
 * olha, entao a bigorna ficava dois tiles adiante de quem instalava — quem punha a esponja "do lado
 * do martelo", que e o gesto natural, punha no lugar errado e a maquina ficava parada sem nada no
 * mundo explicando por que. E como a bigorna era chao comum, uma esteira passando por baixo roubava
 * a esponja antes do primeiro golpe (medido: a esteira anda a cada 900ms, o primeiro golpe caia aos
 * 1100ms — zero pancadas, para sempre).
 *
 * Com a carga dentro, as duas coisas somem: ha UM lugar, ele e visivel (a bigorna, embaixo do
 * malho), e ninguem passa por dentro de uma maquina. E o `dir` deixou de significar qualquer coisa
 * aqui — a viga aponta para onde a arte a desenhou, e nao para onde o heroi olhava.
 *
 * ── O CICLO, e por que ele tem cinco tempos ─────────────────────────────────────────────────
 * Peso nao se desenha, se ENCENA. Um malho que alterna entre dois frames nao pesa nada; o que
 * pesa e a ordem `sobe devagar -> PARA no alto -> despenca -> trava no impacto -> recua`. A pausa
 * no alto e a mais importante das cinco e a mais facil de cortar por parecer tempo morto: e ela
 * que promete a queda. E o `hitstop` no fim — o malho preso embaixo por um piscar — e o que faz a
 * pancada doer, pela mesma razao que faz um acerto de espada doer neste jogo.
 *
 * A TERCEIRA pancada e maior que as duas primeiras (sobe mais alto, treme mais, solta mais
 * escoria): ela e a que termina a peca, e um final identico aos passos anteriores nao seria final.
 *
 * ── O QUE A PANCADA MOVE ALEM DO MALHO ──────────────────────────────────────────────────────
 * Cada golpe toca CINCO coisas, e nenhuma delas e o malho: a peca achata (mais larga, mais baixa,
 * e ACESA — o calor esfria sozinho ate o proximo golpe), a bigorna acende, a armacao inteira cede
 * um fio e volta, a escoria salta em parabola e a poeira levanta no pe. Uma pancada que so move o
 * martelo e um martelo se mexendo; o TAMANHO dela vem de quanta coisa se mexe junto.
 *
 * E como a peca achata, o malho para mais FUNDO a cada golpe (`STOCK_FRAME`) ate encostar no aco
 * na ultima. Tres pancadas identicas seriam a mesma pancada tres vezes; assim, olhar a maquina
 * ja diz em que ponto da forja ela esta — sem numero, sem barra, sem legenda.
 */

const DIR_VEC: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * Frames do sheet. A VIGA e uma tira de angulos (`BEAM_BASE + i`, do fundo do curso ao alto)
 * porque prop neste jogo NAO GIRA — `setAngle` gira no plano da camera, e o que precisa girar aqui
 * e um objeto deitado no mundo. Angulo e frame, a mesma solucao da roda d'agua.
 */
const FRAME_TABLE = 0;
const FRAME_HOT = 1;
const FRAME_PILLAR = 2;
/** A tira da viga vive num sheet PROPRIO (frames de 32px), entao ela comeca no zero dele. */
const BEAM_BASE = 0;
/** O indice mais alto da tira. O fundo do curso e 0. */
const BEAM_TOP = 5;

/**
 * ONDE FICA O PILAR, em tiles a partir da mesa. Uma direcao so, e de proposito.
 *
 * A regra geral de instalacao ("nasce a frente, virada pra onde voce olha") daria quatro
 * orientacoes e quatro vezes a arte — e a viga nao e simetrica: ela tem uma ponta que bate e uma
 * cauda que o came empurra. Uma peca de duas casas com quatro rotacoes tambem quadruplica o que
 * pode dar errado ao instalar. Entao ela nasce sempre com o pilar a LESTE da mesa, e o que o
 * jogador escolhe e o LUGAR, nao o angulo — como o extrator, que tambem abre mao do olhar do
 * heroi porque a geometria dele nao admite.
 */
const PILLAR_DX = 1;

/** Trabalhando, a arte sai como foi autorada; parada, um tom abaixo — sem apagar a peca. */
const METAL_TINT = 0xffffff;
const IDLE_TINT = 0xb4b6bc;
const SPARK = 0xf8e394;
const SLAG = 0xe7462a;

/**
 * O ALTO DO CURSO, em indice de frame. A ultima pancada sobe ate o topo da tira e as outras param
 * um degrau abaixo: um final identico aos passos anteriores nao seria final, e aqui isso e
 * desenho e nao numero — da para VER qual vai ser a que termina.
 */
const RISE_TOP = BEAM_TOP - 1;
/** O recuo depois do impacto: dois quiques curtos e amortecidos, nunca o curso inteiro. */
const BEAM_BOUNCE = 1.3;

/**
 * ONDE O MALHO PARA, por pancada JA dada. A peca ACHATA, entao ele desce mais fundo a cada golpe
 * e chega a encostar no aco na ultima. Sem isso as tres pancadas sao a mesma pancada tres vezes,
 * e o jogador nao tem como saber que esta progredindo sem olhar um numero que nao existe.
 */
const STOCK_FRAME = [1, 1, 0, 0];
/** Parada COM peca dentro, a viga fica ERGUIDA — senao o malho tapa o que voce acabou de por. */
const PARK_LOADED = 4;
/** Quanto tempo a viga leva para assumir a posicao de parada (ela nao TELEPORTA). */
const PARK_MS = 260;

/** Os cinco tempos, em ms. Somados dao ~740ms por pancada a plena energia. */
const RISE_MS = 300;
const HANG_MS = 130;
const FALL_MS = 70;
const HITSTOP_MS = 70;
const RECOIL_MS = 170;
const BLOW_MS = RISE_MS + HANG_MS + FALL_MS + HITSTOP_MS + RECOIL_MS;

/** Quanto tempo a chapa fica em brasa depois de apanhar (a ultima pancada esquenta mais). */
const HOT_MS = 260;
const HOT_MS_LAST = 460;

/** A ARMACAO ABSORVE a pancada: o corpo inteiro afunda um fio e volta. */
const BODY_JOLT = 0.04;
const BODY_JOLT_MS = 160;

/** Um fio a frente do corpo, para a viga nunca empatar em profundidade com o poste. */
const HEAD_DEPTH = 0.02;
/** A carga fica entre os dois: atras da viga, a frente do corpo. */
const LOAD_DEPTH = 0.01;

/**
 * A bigorna agora e um TILE INTEIRO (a mesa de pedra), e o malho foi desenhado para cair no centro
 * dele. Entao a carga, a escoria e o anel de choque nao tem deslocamento nenhum a lembrar — e a
 * razao de a ponta da viga estar no pixel 8 do frame, e nao no 7.
 */
const ANVIL_OFFSET_X = 0;
/** A carga pousa NA FACE da bigorna (a linha clara da arte), e nao no chao do tile. */
const LOAD_ELEV = 0.3125;
/** A peca a cada pancada: mais larga e mais baixa — e assim que a forja se ve acontecendo. */
const LOAD_W0 = 0.26;
const LOAD_H0 = 0.26;
const LOAD_SPREAD = 0.036;
const LOAD_FLATTEN = 0.046;
/** O calor que a pancada DEIXA na peca, e que esfria sozinho ate o proximo golpe. */
const LOAD_HOT_TINT = 0xffb27a;
const LOAD_COOL_MS = 620;

type Phase = 'rise' | 'hang' | 'fall' | 'hitstop' | 'recoil';

export type TripHammerWorldPort = {
  /**
   * A peca pronta SALTA para um tile livre em volta. Quem escolhe o tile e a cena (ela conhece o
   * chao, a agua e o que ja esta caido), e por isso isto e uma porta e nao uma conta daqui.
   * Devolve `false` quando nao havia lugar — e ai a peca FICA na bigorna, que e o unico final
   * honesto: sumir com ela seria perder material em silencio.
   */
  eject(kind: HeldItemKind, fromX: number, fromY: number): boolean;
  /** A pancada caiu (uma vez por golpe, no frame do impacto). */
  struck(finished: boolean): void;
};

/** O que ele sabe trabalhar, e no que aquilo vira. Uma tabela, para a proxima peca ser uma linha. */
const HAMMERS: Partial<Record<HeldItemKind, HeldItemKind>> = { bloom: 'iron' };

export class TripHammerObject implements WorldProp {
  public readonly blocking = true;

  /** A MESA DE PEDRA — o tile ancora, o que a maquina "e" para o resto do jogo. */
  private readonly body: Billboard3D;
  /** O PILAR, no tile vizinho. Nao anima: ele existe para a viga ter onde girar. */
  private readonly pillar: Billboard3D;
  /** A VIGA e o malho, num quad de DOIS tiles que passa na frente dos outros dois. */
  private readonly head: Billboard3D;
  private load?: Billboard3D;
  private readonly sparks = new Set<Billboard3D>();
  /** Alvo do tween que esfria a peca. Um objeto proprio: tint nao e tweenavel direto. */
  private readonly loadHeat = { k: 0 };

  private loaded: HeldItemKind | null = null;
  private phase: Phase = 'rise';
  private elapsed = 0;
  private blows = 0;
  private powered = false;
  private hotMs = 0;
  /**
   * O angulo da viga AGORA, em indice FRACIONARIO de frame. Ele e fracionario e o desenho e
   * inteiro de proposito: o movimento e calculado liso (as curvas de peso continuam valendo) e so
   * o ultimo passo arredonda. Guardar o inteiro faria toda transicao sair de um degrau.
   */
  private beamPos = 0;
  /** O frame realmente desenhado, para nao chamar `setTexture` num quadro que nao mudou nada. */
  private beamFrame = -1;
  /** De onde a fase atual comecou: e o que faz parar e voltar a trabalhar nao dar um pulo. */
  private phaseFrom = 0;
  /** A peca pronta que nao teve para onde saltar. Fica na bigorna ate haver chao. */
  private finished = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly worldX: number,
    public readonly worldY: number,
    public readonly dir: PropDir = 1,
    public readonly playerBuilt = false,
  ) {
    this.body = world3d()
      .addBillboard(ASSET_KEYS.tripHammer, FRAME_TABLE, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1)
      .setTint(IDLE_TINT);
    this.pillar = world3d()
      .addBillboard(ASSET_KEYS.tripHammer, FRAME_PILLAR, { groundShadow: true })
      .setPosition(worldX + PILLAR_DX, worldY)
      .setDisplaySize(1, 1)
      .setTint(IDLE_TINT);
    // A viga cobre os DOIS tiles: quad de duas larguras, centrado na fronteira entre eles. E ela
    // vem um fio a frente dos dois, senao ela some por dentro do pilar em que gira.
    this.head = world3d()
      .addBillboard(ASSET_KEYS.tripHammerBeam, BEAM_BASE, {})
      .setPosition(worldX + PILLAR_DX / 2, worldY - HEAD_DEPTH)
      .setDisplaySize(2, 1)
      .setTint(IDLE_TINT);
  }

  /**
   * O SEGUNDO TILE — o do pilar. E o contrato de `WorldProp`: `GameScene.propAt` le isto e, com
   * ele, colisao, tiro, ocupacao, instalar e recolher passam a valer para as duas metades.
   */
  public get covers(): ReadonlyArray<readonly [number, number]> {
    return [[this.worldX + PILLAR_DX, this.worldY]];
  }

  /** Onde a maquina trabalha: na MESA, que e o tile ancora. O playtest pergunta por aqui. */
  public get anvilTile(): readonly [number, number] { return [this.worldX, this.worldY]; }
  /** Para onde ela olha. Nao muda mais nada no corpo — sobrevive so como dado do mundo. */
  public get facing(): readonly [number, number] { return DIR_VEC[this.dir]; }

  public get isRunning(): boolean { return this.powered; }
  public get blowsLanded(): number { return this.blows; }
  /** O que esta na bigorna agora — o que o aviso do botao le. */
  public get carrying(): HeldItemKind | null { return this.loaded; }

  /**
   * A BIGORNA ACEITA QUALQUER COISA — e trabalha uma so.
   *
   * Poderia recusar tudo que nao e esponja, e a primeira versao recusava. Duas coisas derrubaram
   * isso. A primeira e o aviso: ele diz "Place <o que voce tem na mao>", e um aviso que so aparece
   * para um item do jogo inteiro ensina menos do que um lugar onde se pode POR e ver o que
   * acontece. A segunda e o braco robotico: se a bigorna recusasse cargas, ele precisaria saber o
   * que ela aceita ANTES de largar — e um braco que decide errado perde a carga em silencio, que e
   * o pior defeito possivel. Aceitando tudo, o pior caso e uma pedra pousada numa bigorna, visivel,
   * que o B devolve.
   *
   * O que ela nao faz e MARTELAR o que nao sabe trabalhar: com uma pedra dentro, a maquina fica
   * parada. Bater sem transformar seria barulho prometendo um resultado que nunca vem.
   */
  public static works(kind: HeldItemKind): boolean { return kind in HAMMERS; }

  /** Poe a peca na bigorna. Recusa so com a bigorna OCUPADA — um lugar, uma peca. */
  public accept(kind: HeldItemKind): boolean {
    if (this.loaded) return false;
    this.loaded = kind;
    this.finished = false;
    this.blows = 0;
    this.phase = 'rise';
    this.elapsed = 0;
    this.showLoad(kind);
    return true;
  }

  /**
   * Tira de volta o que esta na bigorna — a metade simetrica do gesto de por, e a mesma lei de
   * "tudo que se instala se recolhe". As pancadas ja dadas se perdem junto: guarda-las faria a
   * proxima esponja sair pronta pela metade sem que nada no mundo explicasse por que.
   */
  public release(): HeldItemKind | null {
    const kind = this.loaded;
    if (!kind) return null;
    this.loaded = null;
    this.finished = false;
    this.blows = 0;
    this.elapsed = 0;
    this.phase = 'rise';
    this.hideLoad();
    this.head.setDisplaySize(1, 1);
    return kind;
  }

  public update(deltaMs: number, port: TripHammerWorldPort, satisfaction: number): void {
    const power = Math.max(0, Math.min(1, satisfaction));
    if (this.hotMs > 0) {
      this.hotMs = Math.max(0, this.hotMs - deltaMs);
      if (this.hotMs === 0) this.body.setTexture(ASSET_KEYS.tripHammer, FRAME_TABLE);
    }

    // A peca terminou e nao teve para onde ir: ele tenta de novo todo frame, e enquanto isso fica
    // parado com ela na bigorna. Nada se perde, e a fila e visivel.
    if (this.finished && this.loaded) {
      this.setPowered(false);
      // E ele ERGUE o malho enquanto espera: uma peca pronta presa embaixo de um martelo e uma
      // fila invisivel, e fila invisivel e a unica coisa que uma fabrica nao pode ter.
      this.rest(deltaMs);
      if (port.eject(this.loaded, this.worldX, this.worldY)) {
        this.loaded = null;
        this.finished = false;
        this.hideLoad();
      }
      return;
    }

    // Ela so RODA com uma peca que ela saiba trabalhar. Com uma pedra na bigorna fica parada, e
    // parada e a resposta honesta: martelar sem transformar seria barulho prometendo resultado.
    const working = this.loaded !== null && TripHammerObject.works(this.loaded) && power > 0;
    this.setPowered(working);
    if (!working) {
      this.rest(deltaMs);
      return;
    }

    // A ENERGIA E VELOCIDADE, e nao um interruptor: meia rede faz o malho subir em camera lenta,
    // que e a leitura certa de uma fabrica com fome (ver powerGrid).
    this.elapsed += deltaMs * power;
    this.advance(port);
    this.drawBeam();
  }

  /** O relogio de um golpe, e as bordas entre os cinco tempos. */
  private advance(port: TripHammerWorldPort): void {
    const marks: ReadonlyArray<readonly [Phase, number]> = [
      ['rise', RISE_MS], ['hang', HANG_MS], ['fall', FALL_MS],
      ['hitstop', HITSTOP_MS], ['recoil', RECOIL_MS],
    ];
    let acc = 0;
    for (const [phase, span] of marks) {
      acc += span;
      if (this.elapsed >= acc) continue;
      if (this.phase !== phase) {
        this.phase = phase;
        // Toda fase sai de ONDE O MALHO ESTA, e nao de uma constante: e isso que faz voltar a
        // trabalhar depois de uma queda de energia (com o malho parado la em cima) ser um
        // movimento, e nao um teleporte de meia peca.
        this.phaseFrom = this.beamPos;
        // O IMPACTO acontece na BORDA de entrada do hitstop, uma vez so. Amarra-lo a um limiar
        // testado por frame dispararia duas vezes num quadro longo — e um golpe duplo por lag e
        // exatamente o tipo de defeito que so aparece na maquina de outra pessoa.
        if (phase === 'hitstop') this.strike(port);
      }
      return;
    }
    // Passou do fim: um golpe inteiro se fechou.
    this.elapsed -= BLOW_MS;
    this.phase = 'rise';
    this.phaseFrom = this.beamPos;
  }

  /** A pancada. Tudo que e JUICE mora aqui, e nada disto e estado — sao bilhetes. */
  private strike(port: TripHammerWorldPort): void {
    this.blows += 1;
    const last = this.blows >= BLOOM_BLOWS;

    this.body.setTexture(ASSET_KEYS.tripHammer, FRAME_HOT);
    this.hotMs = last ? HOT_MS_LAST : HOT_MS;
    world3d().shake(last ? 150 : 90, last ? 0.016 : 0.009);
    this.spawnSparks(last ? 11 : 6, last);
    this.spawnShock(last);
    this.spawnDust(last);
    this.joltBody(last);
    this.punchLoad();
    port.struck(last);

    if (!last) return;
    const made = HAMMERS[this.loaded ?? 'bloom'];
    if (!made) return;
    this.loaded = made;
    this.finished = true;
    // O `showLoad` vem ANTES de zerar as pancadas de proposito: e assim que a barra pronta nasce
    // com a forma ACHATADA que as tres marteladas deram nela, e nao gorda como a esponja entrou.
    this.showLoad(made);
    this.blows = 0;
    // A saida e tentada JA, no mesmo frame do golpe que a terminou: esperar o proximo update
    // poria um quadro de "ferro pronto parado na bigorna" entre a pancada e o salto.
    if (port.eject(made, this.worldX, this.worldY)) {
      this.loaded = null;
      this.finished = false;
      this.hideLoad();
    }
  }

  /**
   * O ANGULO da viga neste instante.
   *
   * As curvas nao sao decorativas: `1-(1-t)^3` sai rapido e chega devagar (o came arrastando o
   * rabo da viga para baixo, o peso quase vencendo no alto) e `t^2` sai devagar e chega rapido (a
   * queda, que e gravidade pura). Trocar as duas por linhas retas apaga a peca inteira — o mesmo
   * movimento, com a mesma duracao, deixa de pesar.
   *
   * Nao ha squash aqui, e e de proposito: viga de madeira nao achata. O que faz a pancada TER
   * tamanho e o que acontece em volta dela — a armacao cedendo, a escoria, a poeira, o tremor.
   */
  private drawBeam(): void {
    const t = this.phaseProgress();
    const bottom = this.stockFrame;
    const top = this.blows + 1 >= BLOOM_BLOWS ? BEAM_TOP : RISE_TOP;
    let pos = bottom;
    switch (this.phase) {
      case 'rise': pos = this.phaseFrom + (top - this.phaseFrom) * (1 - (1 - t) ** 3); break;
      case 'hang': pos = top; break;
      case 'fall': pos = this.phaseFrom - (this.phaseFrom - bottom) * t * t; break;
      case 'hitstop': pos = bottom; break;
      // Dois quiques amortecidos, nao um seno so: viga pesada quica curto e PARA.
      case 'recoil':
        pos = bottom + BEAM_BOUNCE * Math.abs(Math.sin(Math.PI * 2 * t)) * (1 - t) ** 2;
        break;
    }
    this.beamPos = pos;
    this.showBeam(pos);
  }

  /** Arredonda o angulo para um frame da tira, e so toca na textura quando ele muda de verdade. */
  private showBeam(pos: number): void {
    const frame = Math.max(0, Math.min(BEAM_TOP, Math.round(pos)));
    if (frame === this.beamFrame) return;
    this.beamFrame = frame;
    this.head.setTexture(ASSET_KEYS.tripHammerBeam, BEAM_BASE + frame);
  }

  /**
   * Onde o malho PARA — em cima do que estiver na bigorna. A peca achata a cada pancada, entao
   * este degrau desce junto e o ultimo golpe encosta no aco. E a progressao da forja desenhada
   * como movimento, que e a unica linguagem que esta maquina tem.
   */
  private get stockFrame(): number {
    if (!this.loaded) return 0;
    return STOCK_FRAME[Math.min(this.blows, STOCK_FRAME.length - 1)];
  }

  private phaseProgress(): number {
    const spans: Record<Phase, [number, number]> = {
      rise: [0, RISE_MS],
      hang: [RISE_MS, HANG_MS],
      fall: [RISE_MS + HANG_MS, FALL_MS],
      hitstop: [RISE_MS + HANG_MS + FALL_MS, HITSTOP_MS],
      recoil: [RISE_MS + HANG_MS + FALL_MS + HITSTOP_MS, RECOIL_MS],
    };
    const [start, span] = spans[this.phase];
    return Math.max(0, Math.min(1, (this.elapsed - start) / span));
  }

  /**
   * A POSICAO DE PARADA, e ela diz duas coisas diferentes.
   *
   * Vazia, a maquina fecha: o malho desce e POUSA na bigorna, e a peca inteira le como uma coisa
   * so, sem buraco preto no meio. Com carga e sem poder trabalhar (rede morta, ou uma pedra na
   * bigorna), ele fica ERGUIDO — porque um malho tapando o que voce acabou de por e a maquina
   * escondendo a unica informacao que voce foi ali buscar.
   *
   * E ele CAMINHA ate la em vez de aparecer: teleporte de meia peca num quadro e o tipo de coisa
   * que o olho registra como bug mesmo sem saber nomear.
   */
  private rest(deltaMs: number): void {
    const target = this.loaded ? PARK_LOADED : 0;
    const k = Math.min(1, deltaMs / PARK_MS);
    this.beamPos += (target - this.beamPos) * k;
    if (Math.abs(target - this.beamPos) < 0.02) this.beamPos = target;
    this.phaseFrom = this.beamPos;
    this.showBeam(this.beamPos);
  }

  private setPowered(powered: boolean): void {
    if (this.powered === powered) return;
    this.powered = powered;
    const tint = powered ? METAL_TINT : IDLE_TINT;
    this.body.setTint(tint);
    this.pillar.setTint(tint);
    this.head.setTint(tint);
  }

  // ── A CARGA na bigorna ──────────────────────────────────────────────────────────────────────

  private showLoad(kind: HeldItemKind): void {
    const visual = LOAD_VISUAL[kind];
    if (!visual) return;
    if (!this.load) {
      this.load = world3d()
        .addBillboard(visual.texture, visual.frame, { emissive: true })
        .setPosition(this.worldX + ANVIL_OFFSET_X, this.worldY - LOAD_DEPTH);
    } else {
      this.load.setTexture(visual.texture, visual.frame).setVisible(true);
    }
    const [w, h] = this.loadShape();
    this.load.setDisplaySize(w, h).setElevation(LOAD_ELEV);
  }

  private hideLoad(): void {
    this.scene.tweens.killTweensOf(this.loadHeat);
    this.load?.setVisible(false).setTint(0xffffff);
  }

  /**
   * O TAMANHO da peca depois de N pancadas. Ela nao muda de sprite — ela ESPALHA: mais larga e
   * mais baixa a cada golpe, que e literalmente o que uma esponja de ferro faz sob o malho
   * enquanto a escoria sai. E o mesmo numero que decide onde o malho para (`stockElevation`),
   * porque as duas coisas sao a mesma peca: uma fonte de verdade, ou o malho afunda no vazio.
   */
  private loadShape(): readonly [number, number] {
    const k = Math.min(this.blows, BLOOM_BLOWS);
    return [LOAD_W0 + k * LOAD_SPREAD, LOAD_H0 - k * LOAD_FLATTEN];
  }

  /**
   * A peca APANHA: achata fundo no frame do impacto, volta com sobra (`Back`) — e volta para uma
   * forma NOVA, mais espalhada que a de antes do golpe. E ACENDE: o trabalho aquece o metal, e o
   * calor esfria sozinho ate a proxima pancada.
   */
  private punchLoad(): void {
    const load = this.load;
    if (!load) return;
    const [w, h] = this.loadShape();
    this.scene.tweens.killTweensOf(load);
    load.setDisplaySize(w * 1.3, h * 0.5);
    this.scene.tweens.add({
      targets: load, displayWidth: w, displayHeight: h, duration: 220, ease: 'Back.easeOut',
    });

    this.loadHeat.k = 1;
    load.setTint(LOAD_HOT_TINT);
    this.scene.tweens.killTweensOf(this.loadHeat);
    this.scene.tweens.add({
      targets: this.loadHeat,
      k: 0,
      duration: LOAD_COOL_MS,
      ease: 'Quad.easeOut',
      onUpdate: () => this.load?.setTint(mixTint(0xffffff, LOAD_HOT_TINT, this.loadHeat.k)),
    });
  }

  // ── Os bilhetes de efeito ───────────────────────────────────────────────────────────────────

  /**
   * A ESCORIA saltando da bigorna — quente, e mais farta na pancada que termina a peca.
   *
   * Ela voa em PARABOLA, e nao em linha: sai para os lados e para cima, desacelera, cai. Um
   * respingo de metal que sobe e some no ar le como fumaca; um que sobe, vira e DESCE le como
   * materia — e este jogo inteiro se apoia em coisas que parecem ter peso. O arco custa uma
   * conta por quadro num objeto proxy, porque tween nao interpola trajetoria, so valores.
   */
  private spawnSparks(count: number, last: boolean): void {
    for (let i = 0; i < count; i += 1) {
      // Saem RASANTES: escoria que escapa entre o malho e a bigorna e cuspida para o lado, e
      // um leque baixo diz de onde ela saiu melhor que um circulo completo.
      const side = i % 2 === 0 ? 1 : -1;
      const spread = 0.35 + Math.random() * 0.75;
      const spark = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, emissive: true, fog: false, depthWrite: false,
        })
        .setTint(i % 3 === 0 ? SLAG : SPARK)
        .setPosition(this.worldX + ANVIL_OFFSET_X, this.worldY - 0.03)
        .setElevation(LOAD_ELEV)
        .setDisplaySize(0.05, 0.05);
      this.sparks.add(spark);

      const reach = (last ? 0.62 : 0.42) * spread;
      const vx = side * reach;
      const vy = (last ? 0.5 : 0.34) * (0.5 + Math.random());
      const gravity = vy + LOAD_ELEV; // chega ao chao exatamente em t=1
      const arc = { t: 0 };
      this.scene.tweens.add({
        targets: arc,
        t: 1,
        duration: 300 + i * 30,
        ease: 'Linear',
        onUpdate: () => {
          const { t } = arc;
          spark.x = this.worldX + ANVIL_OFFSET_X + vx * t;
          spark.elevation = Math.max(0.01, LOAD_ELEV + vy * t - gravity * t * t);
          spark.alpha = 1 - t * t;
        },
        onComplete: () => { this.sparks.delete(spark); spark.destroy(); },
      });
    }
  }

  /**
   * A POEIRA no pe da maquina. A escoria conta o que aconteceu na bigorna; a poeira conta que a
   * pancada chegou ao CHAO — e e ela que da tamanho ao golpe sem custar um pixel de sprite.
   */
  private spawnDust(last: boolean): void {
    for (let i = 0; i < (last ? 4 : 2); i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const dust = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, emissive: true, fog: false, depthWrite: false,
        })
        .setTint(0x7c7e8b)
        .setPosition(this.worldX, this.worldY + 0.04)
        .setElevation(0.03)
        .setDisplaySize(0.07, 0.07)
        .setAlpha(0.55);
      this.sparks.add(dust);
      this.scene.tweens.add({
        targets: dust,
        x: this.worldX + side * (0.3 + Math.random() * 0.25),
        elevation: 0.12,
        displayWidth: 0.16,
        displayHeight: 0.16,
        alpha: 0,
        duration: 340 + i * 60,
        ease: 'Quad.easeOut',
        onComplete: () => { this.sparks.delete(dust); dust.destroy(); },
      });
    }
  }

  /**
   * A ARMACAO ABSORVE O GOLPE. O corpo inteiro afunda um fio e volta com um repique.
   *
   * E o unico efeito daqui que age sobre a MAQUINA e nao sobre o ar em volta, e por isso e o que
   * mais vende a pancada: uma estrutura que nao reage a um peso de ferro caindo dentro dela nao
   * esta segurando nada. `Back.easeOut` na volta e o repique da madeira.
   */
  private joltBody(last: boolean): void {
    // O tranco e ESCALA, e nao altura: baixar a elevacao enfiaria a base do sprite por baixo do
    // chao (o quad e ancorado no pe), e ali ele briga em profundidade com o tile. Encolhendo,
    // o pe fica plantado e quem afunda e o alto da armacao — que e o que realmente cede.
    const k = last ? BODY_JOLT * 1.6 : BODY_JOLT;
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.killTweensOf(this.pillar);
    this.body.setDisplaySize(1 + k * 0.7, 1 - k);
    this.pillar.setDisplaySize(1 + k * 0.4, 1 - k * 0.6);
    this.scene.tweens.add({
      targets: this.body,
      displayWidth: 1,
      displayHeight: 1,
      duration: last ? BODY_JOLT_MS * 1.3 : BODY_JOLT_MS,
      ease: 'Back.easeOut',
    });
    // O pilar cede MENOS que a mesa: quem recebe a pancada e a pedra, e o poste so sente o eco.
    this.scene.tweens.add({
      targets: this.pillar,
      displayWidth: 1,
      displayHeight: 1,
      duration: last ? BODY_JOLT_MS * 1.5 : BODY_JOLT_MS * 1.2,
      ease: 'Back.easeOut',
    });
  }

  /** O anel de choque no chao — o que faz a pancada ter TAMANHO, e nao so barulho. */
  private spawnShock(last: boolean): void {
    const ring = world3d()
      .addBillboard(FX_RING_TEXTURE, 0, {
        flat: true, flatY: 0.035, additive: true, fog: false, depthWrite: false,
      })
            .setTint(SPARK)
      .setPosition(this.worldX + ANVIL_OFFSET_X, this.worldY)
      .setDisplaySize(0.3, 0.3)
      .setAlpha(last ? 0.75 : 0.5);
    this.sparks.add(ring);
    this.scene.tweens.add({
      targets: ring,
      displayWidth: last ? 1.5 : 1.0,
      displayHeight: last ? 1.5 : 1.0,
      alpha: 0,
      duration: last ? 380 : 280,
      ease: 'Cubic.easeOut',
      onComplete: () => { this.sparks.delete(ring); ring.destroy(); },
    });
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.killTweensOf(this.pillar);
    this.pillar.destroy();
    this.scene.tweens.killTweensOf(this.loadHeat);
    this.body.destroy();
    this.head.destroy();
    if (this.load) { this.scene.tweens.killTweensOf(this.load); this.load.destroy(); }
    for (const fx of this.sparks) {
      this.scene.tweens.killTweensOf(fx);
      fx.destroy();
    }
    this.sparks.clear();
  }
}

/**
 * A arte da carga na bigorna. E uma tabela local e curta de proposito: a maquina desenha apenas o
 * que ela sabe trabalhar, e ler o mapa global de itens daqui puxaria a cena inteira para dentro
 * de um prop.
 */
const LOAD_VISUAL: Partial<Record<HeldItemKind, { texture: string; frame: number }>> = {
  bloom: { texture: 'bloom-item', frame: 0 },
  iron: { texture: 'iron-item', frame: 0 },
};

/** Mistura dois tints por canal. O calor da peca esfria por aqui, e nao por trocar de sprite. */
const mixTint = (cold: number, hot: number, k: number): number => {
  const t = Math.max(0, Math.min(1, k));
  const ch = (shift: number): number => {
    const a = (cold >> shift) & 0xff;
    const b = (hot >> shift) & 0xff;
    return Math.round(a + (b - a) * t) << shift;
  };
  return ch(16) | ch(8) | ch(0);
};
