import { itemGroundVisual, type HeldItemKind } from '@/game/entities/ItemPickup';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { ShadowStrip } from '@/game/render3d/groundShadow';
import { type CastMemory, world3d } from '@/game/render3d/World3D';
import type { PropDir } from '@/game/world/worldSchema';

// O braco robotico ("inserter"). Pega o item que estiver no tile de ORIGEM e poe no de DESTINO,
// sozinho, sem o heroi encostar em nada.
//
// Por que isso e uma peca nova de verdade e nao mais um item: TUDO neste jogo que move carga
// depende do heroi carregar a carga com a propria mao, uma por vez. O braco e a primeira coisa
// que transporta um item sem ele — e, como o proprio corpo da maquina BLOQUEIA o tile em que
// esta, o que ele faz e passar carga por cima de uma linha que o heroi tem de contornar. Essa
// e a pergunta que ele traz pro design: um item pode chegar onde o heroi nao chega.
//
// Ele tambem obedece a regra "itens PRODUZEM, nao so somem": o braco nao consome nada. O item
// que entra e o mesmo que sai, um tile adiante.
//
// ── A ANATOMIA: base -> braco -> antebraco -> garra ──────────────────────────────────────────
// Igual ao inserter do Factorio: uma base compacta presa ao chao, um eixo giratorio, e dali um
// braco ARTICULADO de duas partes retangulares — a de baixo maior, a de cima menor — com a garra
// na ponta. As quatro pecas sao continuas e se movem UMA EM RELACAO A OUTRA: o cotovelo dobra.
//
// Isso obriga a duas coisas que as versoes anteriores nao tinham:
//
//   1. O braco GIRA em vez de transladar. No Factorio a velocidade de um inserter e literalmente
//      ANGULAR. A v1 levava a garra em linha reta de um tile ao outro e por isso jamais poderia
//      parecer presa: no meio do caminho a mao passa exatamente em cima da base, o que faz o
//      braco ter comprimento ZERO.
//   2. O braco DOBRA em vez de manter comprimento fixo. A v2 girava com raio constante, e um
//      cotovelo de angulo constante e um braco RIGIDO — as partes nao se moviam entre si, so
//      giravam juntas. Aqui o punho se recolhe ao passar pela maquina e se estende de novo pra
//      alcancar o tile, entao o cotovelo abre e fecha durante o gesto. E o recolhimento que faz
//      as duas partes existirem como duas partes.
//
// A posicao do cotovelo sai de cinematica inversa de dois elos (poseArm), resolvida no plano
// vertical que contem o ombro e o punho.
//
// ── A garra fica PARADA SOBRE A ORIGEM, e nao guardada na maquina ────────────────────────────
// Ela pousa no ar em cima do tile de origem, com a sombra de contato caindo no chao logo abaixo.
// Essa sombra e o convite: e ela que diz "ponha alguma coisa aqui e algo acontece", do mesmo
// jeito que a bomba-fantasma marca o bombSpot. O jogo nao tem botao de usar item — entao a marca
// tem de ser visivel e o gesto tem de ser PISAR (GameScene.handleTileEntered deposita o item que
// o heroi estiver segurando ao entrar no tile). Sem isso o braco seria inalimentavel: o heroi so
// larga um item TROCANDO por outro que ja esteja no chao, e a origem comeca vazia.

// N, L, S, O — a mesma ordem dos frames do sheet, entao `dir` indexa a arte direto.
// worldY cresce pra BAIXO (sul), como no resto do mundo.
const DIR_VEC: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const HAND_FRAME_OPEN = 0;
const HAND_FRAME_SHUT = 1;
const HAND_FRAME_SEGMENT = 2;
const HAND_FRAME_PIVOT = 3;

// O mesmo tom com que RockObject rebaixa a pedra. A rampa `stone` da arte e clara (topo em
// #a9abbe) e, sem esse desconto, a maquina sai mais quente que tudo em volta e o bloom a
// transforma num borrao branco a noite — foi o que o primeiro playtest mostrou na tela.
const METAL_TINT = 0xc9c9c9;
const UNPOWERED_TINT = 0x6f767d;

// TODO QUAD DE ARTE TEM EXATAMENTE 1 TILE. Isso nao e arbitrario: um tile do jogo vale 16 pixels
// de arte e os sprites sao 16x16, entao 1 tile e a unica escala em que cada texel cai em um pixel.
// Exibir a 0.78 (como esta peca fazia) e pedir pra desenhar 16 pixels e mostrar 12,5 — uma reducao
// NAO-INTEIRA. Com filtro NEAREST cada quadro descarta um conjunto diferente de pixels conforme a
// posicao subpixel, e como a garra se move o tempo todo a silhueta se remontava a cada frame. Era
// por isso que nenhuma versao da garra ficava reconhecivel: nao era o desenho, era a escala.
//
// O tamanho APARENTE se controla por quanto do quadro 16x16 o desenho ocupa — a garra ocupa ~13
// pixels, o pivo ~5 —, nunca encolhendo o quad.
const BASE_SIZE = 1;
const HAND_SIZE = 1;
const PIVOT_SIZE = 1;
const ELBOW_SIZE = 1;
const ITEM_SIZE = 0.5;

// De onde o braco SAI da maquina: o TOPO da coluna giratoria (nao o meio da placa). Subiu junto
// com a base v3, que passou a ter placa larga embaixo e coluna por cima.
const SHOULDER_ELEV = 0.66;
// A altura de REPOUSO e a altura de agarrar — AMBAS do PUNHO, nao da garra. A garra pende
// NODE_UP abaixo do punho com os dedos pra baixo, entao o punho para de descer uma garra acima
// do item: sao os DEDOS que fazem o ultimo palmo, nunca o punho no chao. O repouso e bem alto
// de proposito: parada, a maquina fica com o braco erguido, e so MERGULHA quando aparece carga
// na origem. Isso da a ela estados legiveis de longe — no alto respirando = ociosa, inclinada
// tremendo = recusando (ver STRAIN_*), embaixo = trabalhando — e faz o gesto de descer valer
// alguma coisa. Com repouso rente ao chao (era 0.44) o mergulho era um tremelique de meio pixel
// e a maquina parecia sempre no mesmo estado.
const HAND_HOVER = 0.92;
const HAND_GRAB = 0.52; // punho no agarrar: os dedos (centro - 0.34 - boca) abracam o domo do item

// As duas partes. A de baixo e mais longa e mais grossa que a de cima — e o que faz o braco ter
// uma direcao de leitura (ombro pesado, punho leve) em vez de parecer um cano de secao unica.
// A soma tem de superar o alcance maximo (~1.03 tiles: punho em repouso a um tile de distancia;
// com a garra pendurada o punho nunca mais desce ate o chao) ou a cinematica nao fecha e o
// cotovelo trava esticado.
const UPPER_LEN = 0.7;
const FORE_LEN = 0.52;
const UPPER_THICK = 0.2; // a de baixo e mais grossa: aguenta o braco todo
const FORE_THICK = 0.16; // degrau suave a partir do braco (era 0.14, e a queda saltava)

// A ORDEM DE PROFUNDIDADE DENTRO DA MAQUINA.
//
// Um quad deste renderer e um plano em (X, altura) posicionado em z = tileY: duas pecas do braco
// com o mesmo tileY caem EXATAMENTE no mesmo plano, e onde elas se cobrem o teste de profundidade
// nao tem vencedor — o resultado e o strobe classico, pixel a pixel, quadro a quadro. E o mesmo
// fenomeno que o DEPTH_LAYER do projeto resolve entre heroi e item no chao; aqui e a versao
// INTERNA dele, entre as pecas de um mesmo objeto (o ItemPickup faz igual com as 8 copias do
// contorno). Cada peca ganha um empurraozinho na direcao da camera, na ordem em que devem
// aparecer: corpo atras, depois braco, antebraco, garra, e a carga na frente de tudo.
const DEPTH_UPPER = 0.02;
const DEPTH_FORE = 0.04;
// A carga fica ATRAS da garra, entre o antebraco e os dedos. A primeira versao punha o item na
// frente de tudo — e no unico instante em que a maquina existe pra ser vista (a travessia), o
// item tapava a pinca inteira: lia-se um item voando com um braco atras. Com os dedos POR CIMA
// da carga, a pinca fechada e uma faixa no meio do item e a aberta espalha os dedos sobre ele —
// e isso que faz o "segurar" existir na tela.
const DEPTH_ITEM = 0.045;
const DEPTH_PIVOT = 0.05; // os discos por CIMA das hastes: uma junta se ve, nao se adivinha
const DEPTH_HAND = 0.06;

// O quanto a garra PENDE abaixo do punho. A arte (v4) tem o nó no TOPO e os dedos abrindo pra
// BAIXO — uma garra que desce sobre itens no chao, e nao o V pra cima que era antes (uma garra
// esperando chuva). O punho da cinematica e onde a haste do antebraco morre; o centro do quad da
// garra fica NODE_UP abaixo dele, o que poe o nó da arte exatamente no punho: a haste chega por
// CIMA no nó, e com a boca virada pra baixo nao existe mais geometria em que a barra atravesse o
// vao da pinca — o defeito que derrubou cinco versoes (e que o antigo CLAW_AHEAD so contornava)
// deixou de ser possivel.
const NODE_UP = 0.34;

// Alcance estendido (o tile vizinho) e o quanto o braco se RECOLHE ao passar pela maquina.
const REACH = 1;
const FOLD = 0.52;
// E o quanto o punho sobe no meio do arco, que e o que faz o gesto passar POR CIMA.
const SWING_LIFT = 0.3;

// O quanto o PLANO DE DOBRA deita pro lado quando o braco aponta pro fundo da tela. A dobra
// acontece no plano (radial, vertical) — e quando a direcao radial coincide com o eixo de
// profundidade (braco apontando norte ou sul, METADE das colocacoes possiveis), esse plano
// projeta pra ZERO na tela: o rig inteiro colapsa numa linha vertical e a maquina vira um poste.
// Pior: o meio do arco passa pelo norte, entao o FOLD — o momento mais dramatico do gesto —
// era exatamente o instante invisivel. A saida e girar o plano de dobra em direcao ao eixo
// LATERAL do mundo conforme |sin(angulo)| cresce. A cinematica continua EXATA: o cotovelo sai a
// distancia `a` ao longo da linha ombro->punho mais `h` por um versor perpendicular a ela — e
// qualquer mistura normalizada de dois versores perpendiculares continua perpendicular, entao
// os dois elos seguem medindo UPPER_LEN e FORE_LEN (e o playtest das juntas continua valendo).
const ELBOW_SIDE = 0.55;

// ── O movimento secundario da carga: um pendulo ─────────────────────────────────────────────
// A carga nao e soldada na pinca — ela esta PENDURADA nela. Entao ela atrasa quando o braco
// arranca, escora quando ele freia e assenta balancando quando ele para: e a diferenca entre
// carregar um peso e carregar um adesivo. Mola sub-amortecida (ζ<1 de proposito: o passar do
// ponto e voltar E o balanco) dirigida pela velocidade tangencial do punho. So a componente X
// (a lateral de tela) e aplicada: um balanco em profundidade e invisivel e so baguncaria a
// ordem de desenho da pinca.
const CARGO_LAG_S = 0.085; // quanto de atraso a velocidade imprime (s de deslocamento por vel)
const CARGO_MAX = 0.16; // teto do deslocamento, em tiles — carga nao e chicote
const CARGO_OMEGA = 13; // rigidez da mola (rad/s)
const CARGO_ZETA = 0.32; // sub-amortecida: sobra oscilacao pra ver a carga ASSENTAR
const CARGO_TILT_DEG = 55; // graus de inclinacao por tile de deslocamento — o item pende

// ── Os tres estados legiveis da maquina parada ──────────────────────────────────────────────
// Ociosa ela RESPIRA (mesma gramatica da bomba-fantasma no bombSpot: o convite de "poe algo
// aqui" e uma coisa viva, nao uma fotografia). Recusando — carga esperando na origem mas saida
// bloqueada — ela se INCLINA sobre o item e treme, querendo e nao podendo: sem isso a recusa
// era indistinguivel de maquina quebrada. Trabalhando, mergulha (o que ja existia).
const IDLE_BOB = 0.028; // amplitude da respiracao, em tiles (~meio pixel: presenca, nao ruido)
const IDLE_BOB_MS = 1700;
// A altura da inclinacao de recusa (do punho): os dedos pendurados param pairando no ombro do
// domo do item — quase tocando a carga que ela quer e nao pode levar — bem distinta do repouso
// (0.92) e do agarrar (0.52).
const STRAIN_ELEV = 0.66;
const STRAIN_TREMBLE = 0.013;
const STRAIN_TREMBLE_MS = 130;
const IDLE_EASE_MS = 160; // suaviza a troca respirar<->inclinar (nada de teleporte de altura)

// Tempos do ciclo. Somados dao ~1.8s por item — da pra VER a maquina descer, agarrar, atravessar
// e largar, que e o ponto todo de existir uma animacao em vez de um teleporte.
const WIND_MS = 110; // ANTECIPACAO: sobe um tico antes de mergulhar
const WIND_LIFT = 0.09; // o quanto ele arma antes do bote
const SNAP_DIP = 0.05; // o quanto a pinca crava ao morder
const DESCEND_MS = 170; // desce ate o item
const GRIP_MS = 120; // fecha a pinca
const LIFT_MS = 170; // levanta com a carga
const SWING_MS = 560; // a meia-volta, dobrando e desdobrando
const LOWER_MS = 170; // desce no destino
const RELEASE_MS = 120; // abre a pinca
const RISE_MS = 170; // levanta vazia
const RETURN_MS = 440; // volta pra origem
const RESCAN_MS = 220; // respiro antes de procurar carga de novo

type ArmPhase =
  | 'idle' | 'wind' | 'descend' | 'grip' | 'lift' | 'swing' | 'lower' | 'release' | 'rise' | 'return';

/**
 * O que o braco precisa do mundo. Um port pequeno em vez de uma referencia a GameScene: o objeto
 * nao tem por que enxergar a cena inteira pra fazer o que faz, e assim o acoplamento fica
 * declarado em cinco linhas em vez de escondido numa importacao circular.
 */
export type ArmWorldPort = {
  /** Ha um item colhivel neste tile? */
  hasItem(x: number, y: number): boolean;
  /** Tira o item do chao e devolve o que era (null se nao havia). */
  take(x: number, y: number): HeldItemKind | null;
  /** Devolve um item ao chao. */
  put(kind: HeldItemKind, x: number, y: number): void;
  /** O tile impede que algo seja depositado ali? (parede, pedra, agua, lava…) */
  blocked(x: number, y: number): boolean;
  // Os tres momentos do ciclo que fazem som. O braco nao conhece o SoundManager: ele avisa, e
  // quem toca e a cena.
  /** A pinca fechou em cima de uma carga. */
  grabbed(): void;
  /** A meia-volta comecou — e o servo girando. */
  swinging(): void;
  /** A pinca abriu e a carga assentou no destino. */
  released(): void;
};

// Suaviza partida e chegada, que e como um servo se move: nem arranque seco, nem freada seca.
const ease = (t: number): number => 0.5 - Math.cos(Math.PI * t) / 2;
// Mergulho ACELERANDO: peso. Um braco que desce em velocidade constante parece um elevador.
const easeInQuad = (t: number): number => t * t;
// Subida com ESTOURO: passa do ponto e volta. E o truque mais barato que existe pra uma peca
// mecanica parecer que tem massa — ela nao para no lugar, ela assenta nele.
const easeOutBack = (t: number): number => {
  const k = 2.2;
  const p = t - 1;
  return p * p * ((k + 1) * p + k) + 1;
};

export class RoboticArmObject {
  private readonly base: Billboard3D;
  private readonly hand: Billboard3D;
  /**
   * As duas partes: ombro -> cotovelo e cotovelo -> punho. Cada uma e UM quad esticado, e nao
   * uma fileira de pecinhas — uma peca de maquina e uma peca so.
   */
  public readonly upperArm: Billboard3D;
  public readonly foreArm: Billboard3D;
  private readonly shoulderPivot: Billboard3D;
  private readonly elbowPivot: Billboard3D;
  // A silhueta PROJETADA do braco: um elo de sombra por parte, ligando as juntas projetadas
  // no chao (ombro->cotovelo->punho->dedos). Ver o comentario no construtor.
  private readonly upperShadow: ShadowStrip;
  private readonly foreShadow: ShadowStrip;
  private readonly clawShadow: ShadowStrip;
  // A histerese de direcao da sombra (ver World3D.nearestLitFireInto) precisa de memoria
  // por objeto — entre duas fogueiras o "fogo mais proximo" nao pode alternar com o flicker.
  private readonly castMemory: CastMemory = {};

  /** Onde a dobra caiu neste quadro. Publico porque e o que prova que as juntas se encontram. */
  public elbowX = 0;
  public elbowY = 0;
  public elbowElev = 0;

  /**
   * Quanto a PROFUNDIDADE do mundo vale em altura de tela. A camera e fixa e nunca gira (olha de
   * `camHeight` de cima e `camBack` de tras), entao um passo pro norte sobe na tela numa razao
   * conhecida. E esse numero que deixa um quad — que so tem largura e altura no plano da tela —
   * ligar dois pontos separados tambem em profundidade: sem ele, um braco apontado pro norte
   * teria comprimento zero na conta e a barra sumiria.
   */
  private readonly depthToScreen: number;

  private carried?: Billboard3D;
  private carriedKind: HeldItemKind | null = null;

  private phase: ArmPhase = 'idle';
  private elapsed = 0;
  /** Relogio livre, nunca zerado: os osciladores (respiracao, tremor) nao podem resetar de fase
   *  toda vez que `elapsed` zera num rescan — senao a respiracao soluca a cada 220ms. */
  private aliveMs = 0;

  // O estado da parada: a altura atual do punho ocioso (que persegue respiracao ou inclinacao
  // suavemente) e de onde o wind parte — ele arma a partir de onde o braco ESTIVER, porque
  // depois de uma recusa longa o punho esta la embaixo e saltar pro repouso seria um teleporte.
  private idleElev = HAND_HOVER;
  private windFromElev = HAND_HOVER;

  // O pendulo da carga: deslocamento ao longo da tangente do arco e sua velocidade.
  private cargoSwing = 0;
  private cargoSwingVel = 0;
  private prevHandAngle = 0;

  // Onde a garra esta neste quadro (o punho — ela pende NODE_UP abaixo dele). A carga e
  // desenhada a partir daqui em updateCargo — inclusive nas fases que nao chamam place()
  // (release), porque o balanco de assentar acontece justamente com o braco parado.
  private clawX = 0;
  private clawY = 0;

  private readonly angleIn: number;
  private readonly sweep: 1 | -1;
  private handAngle: number;
  private handRadius = REACH;
  private returnFromAngle = 0;
  // Os sons disparam na ENTRADA da fase. Nao da pra testar `elapsed === 0` no switch porque o
  // delta ja foi somado antes dele; uma bandeira armada no enter() e o jeito honesto.
  private pendingSwingSfx = false;
  private pendingReleaseSfx = false;
  private powered = true;

  public handX: number;
  public handY: number;
  private handElev = HAND_HOVER;

  public constructor(
    public readonly worldX: number,
    public readonly worldY: number,
    public readonly dir: PropDir = 1,
    /** Sem variavel, preserva o comportamento legado autoalimentado. Com variavel, exige true. */
    public readonly variable?: string,
  ) {
    // A direcao vira FRAME, nunca rotacao: Billboard3D.setAngle gira no plano da camera
    // (mesh.rotation.z), o que inclinaria o desenho em vez de vira-lo pro lado.
    this.base = world3d()
      .addBillboard('inserter', dir, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(BASE_SIZE, BASE_SIZE)
      .setTint(METAL_TINT);

    // Cada parte e UM retangulo solido esticado entre duas juntas (ver layBar).
    // `centered`: o quad de uma barra e ancorado no MEIO, e nao nos pes como um prop em pe —
    // ela e posicionada pelo ponto medio entre as duas juntas e girada em torno dele.
    //
    // ── A SOMBRA DO BRACO E UMA SO: o esqueleto PROJETADO ──────────────────────────────────
    // Todos os tres sistemas de sombra do jogo assumem um prop EM PE, com pe no chao — e as
    // hastes nao tem pe: flutuam entre juntas. Cada tentativa de sombrear por peca falhou de um
    // jeito: blob por peca = linha pontilhada de manchas soltas; tiras em projecao de PLANTA =
    // um sol a pino que nao existe na cena, brigando com as silhuetas direcionais da base;
    // castGroundShadow por haste = a silhueta nasce onde a haste NAO esta, porque o cast ignora
    // elevacao. A resposta e projetar o proprio ESQUELETO: groundCastAt da a direcao/esticada/
    // escuridao da luz no pe da maquina (fogo mais proximo, com handoff pro luar), cada junta
    // projeta em plan + dir * elev * unitLen, e uma ShadowStrip por elo liga as juntas
    // projetadas — ombro->cotovelo->punho->dedos. Como os elos COMPARTILHAM as juntas, a
    // silhueta e conexa por construcao; e como a projecao usa a mesma estilizacao dos sprites em
    // pe, ela BROTA da silhueta que a base ja lanca, em vez de contradize-la. Ver poseArm.
    const makeBar = (): Billboard3D => world3d()
      .addBillboard('inserter-hand', HAND_FRAME_SEGMENT, { centered: true })
      .setTint(METAL_TINT);

    this.upperArm = makeBar();
    this.foreArm = makeBar();
    // Alpha-base 1: o escurecimento por quadro vem inteiro do cast (set(..., alpha do cast)),
    // entao o elo escurece e RESPIRA exatamente como a silhueta de qualquer prop em pe.
    // Espessuras ~ as das hastes: a silhueta e um recorte da peca, nao um borrao em volta dela.
    this.upperShadow = new ShadowStrip(world3d().scene, 0.24, 1);
    this.foreShadow = new ShadowStrip(world3d().scene, 0.2, 1);
    this.clawShadow = new ShadowStrip(world3d().scene, 0.24, 1);

    // OS PIVOS. Sem eles o braco era so uma forma metalica dobrada: havia dobra, mas nada dizia
    // "gira aqui". Um disco escuro em cada junta e o detalhe mais barato que existe pra vender
    // maquina — e por isso ele vem DEPOIS das hastes na ordem de profundidade, cobrindo o vinco
    // onde as duas barras se encontram (que e justamente onde a emenda apareceria).
    const makePivot = (size: number): Billboard3D => world3d()
      .addBillboard('inserter-hand', HAND_FRAME_PIVOT, { centered: true })
      .setDisplaySize(size, size)
      .setTint(METAL_TINT);

    this.shoulderPivot = makePivot(PIVOT_SIZE).setPosition(worldX, worldY + DEPTH_PIVOT).setElevation(SHOULDER_ELEV);
    this.elbowPivot = makePivot(ELBOW_SIZE);

    const cam = world3d().params;
    this.depthToScreen = (cam.camHeight - 0.4) / cam.camBack;

    // A garra leva groundShadow: a sombra segue a mao (o Billboard3D reposiciona o blob junto),
    // entao ela e ao mesmo tempo o contato fisico que prende a garra ao mundo e — parada sobre a
    // origem — a marca de "deposite aqui".
    // `centered` TAMBEM aqui, e nao so nas barras. Sem ele o Billboard3D ancora o quad nos PES
    // (`geo.translate(0, 0.5, 0)`, "origin at the feet"), que e o certo pra um prop de pe no chao
    // e o errado pra uma peca pendurada no ar: a barra terminava no ponto do punho e a garra era
    // desenhada a partir dali PRA CIMA, meio sprite acima do fim do braco. Era essa a mao solta.
    this.hand = world3d()
      .addBillboard('inserter-hand', HAND_FRAME_OPEN, {
        centered: true,
        // Sombra menor e mais leve que a primeira versao: manchas grandes e escuras longe do
        // corpo liam como buracos no chao, e nao como sombra de uma peca fina.
        groundShadow: { rx: 0.19, rz: 0.17, alpha: 0.3 },
        // O blob fica (e o convite de "deposite aqui" e o contato, como o blob do heroi), mas a
        // silhueta por sprite NAO: ela assume um caster em pe no tile, e a garra flutua — a
        // lingua nascia no lugar errado. A silhueta da garra e o elo punho->dedos da corrente
        // projetada (ver poseArm).
        castGroundShadow: false,
      })
      .setDisplaySize(HAND_SIZE, HAND_SIZE)
      .setTint(METAL_TINT);

    // O angulo em que a origem fica, visto do eixo. Todo o ciclo e descrito em ANGULO a partir
    // daqui — o braco nunca "vai ate um tile", ele gira ate apontar pra ele.
    const [ax, ay] = this.inputTile;
    this.angleIn = Math.atan2(ay - worldY, ax - worldX);

    // Por qual lado a meia-volta passa. Escolhe-se o lado que sobe na TELA (o menor y do mundo,
    // que e o norte): varrendo por baixo, a garra e a carga passariam por tras do proprio corpo
    // da maquina e sumiriam justo no meio do gesto. Empate (braco norte/sul) desempata pro leste.
    const midUp = Math.sin(this.angleIn + Math.PI / 2);
    const midDown = Math.sin(this.angleIn - Math.PI / 2);
    if (midUp < midDown) this.sweep = 1;
    else if (midDown < midUp) this.sweep = -1;
    else this.sweep = Math.cos(this.angleIn + Math.PI / 2) > 0 ? 1 : -1;

    this.handAngle = this.angleIn;
    this.prevHandAngle = this.angleIn;
    this.handX = ax;
    this.handY = ay;
    this.place(this.angleIn, REACH, HAND_HOVER);
  }

  /** A maquina e solida: o heroi contorna. E dessa solidez que vem o valor de puzzle dela. */
  public get blocking(): boolean { return true; }

  /** O tile de onde ele TIRA (atras) e o tile onde ele POE (a frente). */
  public get inputTile(): readonly [number, number] {
    const [vx, vy] = DIR_VEC[this.dir];
    return [this.worldX - vx, this.worldY - vy];
  }

  public get outputTile(): readonly [number, number] {
    const [vx, vy] = DIR_VEC[this.dir];
    return [this.worldX + vx, this.worldY + vy];
  }

  /** O angulo em que o destino fica: meia volta a partir da origem, pelo lado escolhido. */
  private get angleOut(): number { return this.angleIn + this.sweep * Math.PI; }

  public get isBusy(): boolean { return this.phase !== 'idle'; }

  public get isPowered(): boolean { return this.powered; }

  public update(delta: number, port: ArmWorldPort, powered = true): void {
    this.setPowered(powered);
    this.prevHandAngle = this.handAngle;
    // Cortar energia congela a transmissao onde ela estiver — inclusive segurando carga. O
    // pendulo ainda assenta pela gravidade, e retomar energia continua o mesmo gesto sem perda.
    if (!powered) {
      this.updateCargo(delta);
      return;
    }
    this.elapsed += delta;
    this.aliveMs += delta;
    const [inX, inY] = this.inputTile;
    const [outX, outY] = this.outputTile;

    switch (this.phase) {
      case 'idle': {
        // So arranca quando ha carga na origem E o destino esta vazio e livre. A checagem do
        // destino e o que impede a maquina de empilhar dois itens no mesmo tile — o chao do jogo
        // guarda um item por tile, e dois viram um sumico silencioso.
        const wants = port.hasItem(inX, inY);
        const outFree = !port.blocked(outX, outY) && !port.hasItem(outX, outY);

        // Os tres estados legiveis (ver as constantes IDLE_BOB/STRAIN_*): sem nada pra fazer a
        // maquina respira no alto; querendo trabalhar com a saida presa ela se inclina sobre a
        // carga e treme. A altura persegue o alvo em vez de saltar pra ele — a recusa e uma
        // postura que a maquina ASSUME, nao um teleporte.
        const target = wants && !outFree
          ? STRAIN_ELEV + STRAIN_TREMBLE * Math.sin((this.aliveMs * 2 * Math.PI) / STRAIN_TREMBLE_MS)
          : HAND_HOVER + IDLE_BOB * Math.sin((this.aliveMs * 2 * Math.PI) / IDLE_BOB_MS);
        this.idleElev += (target - this.idleElev) * Math.min(1, delta / IDLE_EASE_MS);
        this.place(this.angleIn, REACH, this.idleElev);

        if (this.elapsed < RESCAN_MS) break;
        if (!wants || !outFree) { this.elapsed = 0; break; }
        this.enter('wind');
        break;
      }

      case 'wind': {
        // Antecipacao. Uma maquina que so desce parece um carimbo; uma que ARMA antes parece que
        // decidiu descer. Sao 110ms e mudam completamente a leitura do bote. Parte da altura em
        // que o punho estava (a respiracao balanca o repouso) e chega em HAND_HOVER, que e de
        // onde o mergulho conta a descida.
        const t = Math.min(1, this.elapsed / WIND_MS);
        const base = this.windFromElev + (HAND_HOVER - this.windFromElev) * t;
        this.place(this.angleIn, REACH, base + WIND_LIFT * Math.sin(Math.PI * t));
        if (t >= 1) this.enter('descend');
        break;
      }

      case 'descend': {
        const t = Math.min(1, this.elapsed / DESCEND_MS);
        this.place(this.angleIn, REACH, HAND_HOVER + (HAND_GRAB - HAND_HOVER) * easeInQuad(t));
        if (t >= 1) {
          // O item pode ter sumido no meio do caminho (o heroi passou e pegou). Se sumiu, a
          // garra sobe vazia em vez de fechar no ar e "carregar" um item que nao existe.
          this.enter(port.hasItem(inX, inY) ? 'grip' : 'rise');
        }
        break;
      }

      case 'grip': {
        // A mordida CRAVA: a pinca afunda um tico ao fechar e volta. Sem isso o fechamento e so
        // uma troca de textura, e troca de textura nao tem peso nenhum.
        const bite = Math.sin(Math.PI * Math.min(1, this.elapsed / GRIP_MS));
        this.place(this.angleIn, REACH, HAND_GRAB - SNAP_DIP * bite);
        if (this.elapsed >= GRIP_MS) {
          this.carriedKind = port.take(inX, inY);
          if (this.carriedKind) {
            this.spawnCarried(this.carriedKind);
            port.grabbed();
          }
          this.enter(this.carriedKind ? 'lift' : 'rise');
        }
        break;
      }

      case 'lift': {
        // Sobe com estouro: passa da altura de repouso e assenta nela.
        const t = Math.min(1, this.elapsed / LIFT_MS);
        this.place(this.angleIn, REACH, HAND_GRAB + (HAND_HOVER - HAND_GRAB) * easeOutBack(t));
        if (t >= 1) this.enter('swing');
        break;
      }

      case 'swing': {
        if (this.pendingSwingSfx) { this.pendingSwingSfx = false; port.swinging(); }
        const t = Math.min(1, this.elapsed / SWING_MS);
        this.sweepTo(this.angleIn, this.angleOut, t);
        if (t >= 1) this.enter('lower');
        break;
      }

      case 'lower': {
        const t = Math.min(1, this.elapsed / LOWER_MS);
        this.place(this.angleOut, REACH, HAND_HOVER + (HAND_GRAB - HAND_HOVER) * t);
        if (t >= 1) this.enter('release');
        break;
      }

      case 'release': {
        // A saida foi validada no idle — um ciclo inteiro atras (~1.5s). Qualquer coisa pode
        // te-la ocupado nesse meio tempo: um item largado, um caixote empurrado, a carga de
        // OUTRO braco. Largar por cima empilharia dois itens num tile — o sumico silencioso
        // que a checagem do idle existe para impedir — entao ela e refeita AQUI, no instante
        // da entrega. Ocupada, a garra simplesmente espera de mao baixa segurando a carga
        // (a mesma leitura da recusa do idle: maquina viva, saida presa) e solta sozinha
        // assim que o tile vagar.
        const outTaken = this.carriedKind !== null
          && (port.blocked(outX, outY) || port.hasItem(outX, outY));
        if (outTaken) break;
        if (this.pendingReleaseSfx) { this.pendingReleaseSfx = false; port.released(); }
        if (this.elapsed >= RELEASE_MS) {
          if (this.carriedKind) port.put(this.carriedKind, outX, outY);
          this.carriedKind = null;
          this.despawnCarried();
          this.enter('rise');
        }
        break;
      }

      case 'rise': {
        // 'rise' e alcancado do DESTINO (largou) e tambem da ORIGEM (o item sumiu antes da
        // pinca fechar), entao ele sobe do angulo em que o braco estiver — nao de um fixo.
        const t = Math.min(1, this.elapsed / RISE_MS);
        this.place(this.handAngle, REACH, HAND_GRAB + (HAND_HOVER - HAND_GRAB) * t);
        if (t >= 1) this.enter('return');
        break;
      }

      case 'return': {
        // A volta desfaz o mesmo arco, dobrando de novo no meio.
        const t = Math.min(1, this.elapsed / RETURN_MS);
        this.sweepTo(this.returnFromAngle, this.angleIn, t);
        if (t >= 1) this.enter('idle');
        break;
      }
    }

    this.updateCargo(delta);
  }

  private setPowered(powered: boolean): void {
    if (this.powered === powered) return;
    this.powered = powered;
    const tint = powered ? METAL_TINT : UNPOWERED_TINT;
    this.base.setTint(tint);
    this.upperArm.setTint(tint);
    this.foreArm.setTint(tint);
    this.shoulderPivot.setTint(tint);
    this.elbowPivot.setTint(tint);
    this.hand.setTint(tint);
    this.carried?.setTint(powered ? 0xffffff : 0xa2a5a8);
  }

  private enter(next: ArmPhase): void {
    // A volta parte do angulo em que o braco ESTIVER. Ele nem sempre volta do destino: quando o
    // item some antes da pinca fechar, o braco ainda aponta pra origem, e voltar "do destino"
    // faria uma meia-volta fantasma sem motivo.
    if (next === 'return') this.returnFromAngle = this.handAngle;
    // O wind arma A PARTIR de onde o punho esta (respirando no alto ou inclinado numa recusa
    // que acabou de destravar) — e a parada seguinte retoma a perseguicao dali tambem.
    if (next === 'wind') this.windFromElev = this.handElev;
    if (next === 'idle') this.idleElev = this.handElev;
    this.phase = next;
    this.elapsed = 0;
    if (next === 'swing') this.pendingSwingSfx = true;
    if (next === 'release') this.pendingReleaseSfx = true;
    // As trocas de frame da pinca moram na ENTRADA da fase — o quadro nao muda no meio de uma,
    // entao re-setar a textura a cada update era trabalho repetido por nada.
    if (next === 'grip') this.hand.setTexture('inserter-hand', HAND_FRAME_SHUT);
    if (next === 'idle' || next === 'descend' || next === 'release') {
      this.hand.setTexture('inserter-hand', HAND_FRAME_OPEN);
    }
  }

  /**
   * O pendulo da carga (ver CARGO_*): mola sub-amortecida perseguindo o atraso que a velocidade
   * tangencial do punho imprime. Roda TODO quadro, mesmo nas fases sem place() — o balanco mais
   * importante e o de ASSENTAR, que acontece com o braco ja parado no destino.
   */
  private updateCargo(deltaMs: number): void {
    if (!this.carried) {
      this.cargoSwing = 0;
      this.cargoSwingVel = 0;
      return;
    }
    const dt = Math.min(deltaMs, 50) / 1000; // clamp: um hitch de GC nao pode chicotear a mola
    let dTheta = this.handAngle - this.prevHandAngle;
    if (Math.abs(dTheta) > 1) dTheta = 0; // salto de angulo (troca de fase) nao e velocidade
    const tangVel = dt > 0 ? (dTheta / dt) * this.handRadius : 0;

    const swingTarget = Math.max(-CARGO_MAX, Math.min(CARGO_MAX, -tangVel * CARGO_LAG_S));
    const accel = CARGO_OMEGA * CARGO_OMEGA * (swingTarget - this.cargoSwing)
      - 2 * CARGO_ZETA * CARGO_OMEGA * this.cargoSwingVel;
    this.cargoSwingVel += accel * dt;
    this.cargoSwing += this.cargoSwingVel * dt;

    // So a componente X da tangente vira imagem: e a unica visivel, e deslocar a carga em Y
    // mudaria a profundidade dela e quebraria a ordem carga-atras-da-pinca (DEPTH_ITEM).
    const disp = this.cargoSwing * -Math.sin(this.handAngle);
    this.carried
      .setPosition(this.clawX + disp, this.clawY + DEPTH_ITEM)
      // Na BOCA da pinca: um tico abaixo do centro da garra, entre os dedos abertos ou presa
      // no bico fechado. No agarrar isso da ~0.13 — a mesma altura em que o item estava no
      // chao, entao o pegar nao tem pulo.
      .setElevation(Math.max(0.02, this.handElev - NODE_UP - 0.05))
      .setAngle(disp * CARGO_TILT_DEG); // pendurada, ela INCLINA junto — e o fio invisivel
  }

  /**
   * A meia-volta: gira de um angulo ao outro RECOLHENDO o braco no meio do caminho e estendendo
   * de novo na chegada. E esse encolhimento que faz o cotovelo abrir e fechar — sem ele as duas
   * partes girariam juntas, rigidas, e nao haveria articulacao nenhuma pra ver.
   */
  private sweepTo(from: number, to: number, t: number): void {
    const k = ease(t);
    const fold = Math.sin(Math.PI * t); // 0 nas pontas, 1 no meio
    this.place(
      from + (to - from) * k,
      REACH - (REACH - FOLD) * fold,
      HAND_HOVER + SWING_LIFT * fold,
    );
  }

  /**
   * Aponta o braco: angulo, alcance e altura. E a unica forma de mover a garra — a posicao dela
   * e sempre derivada daqui, nunca escolhida direto, que e o que mantem o braco preso ao eixo.
   */
  private place(theta: number, radius: number, elev: number): void {
    this.handAngle = theta;
    this.handRadius = radius;
    this.handElev = elev;
    this.handX = this.worldX + radius * Math.cos(theta);
    this.handY = this.worldY + radius * Math.sin(theta);

    // A garra PENDE do punho: mesmo (x, y), centro NODE_UP abaixo — o que poe o nó da arte
    // exatamente onde a haste do antebraco morre, chegando por cima.
    this.clawX = this.handX;
    this.clawY = this.handY;
    this.hand.setPosition(this.clawX, this.clawY + DEPTH_HAND).setElevation(elev - NODE_UP);
    // A carga NAO e posicionada aqui: ela pende da pinca com atraso e balanco proprios, e isso
    // mora em updateCargo — que roda mesmo nas fases em que o braco nao se move.
    this.poseArm();
  }

  /**
   * Cinematica inversa de dois elos. O cotovelo sai a distancia `a` ao longo da linha
   * ombro->punho mais `h` por um versor PERPENDICULAR a ela — e a escolha desse versor e a
   * escolha do plano de dobra. O plano parte do (radial, vertical) — cotovelo pra CIMA, como um
   * braco de linha de montagem — e deita pro eixo lateral do mundo conforme o braco aponta pro
   * fundo da tela (ver ELBOW_SIDE): dobra vertical num braco leste-oeste, dobra de lado num
   * braco norte-sul, e uma rotacao continua do plano no caminho entre um e outro. Os elos medem
   * UPPER_LEN e FORE_LEN em qualquer mistura, porque a mistura normalizada de dois versores
   * perpendiculares a linha continua perpendicular a ela.
   */
  private poseArm(): void {
    const dz = this.handElev - SHOULDER_ELEV;
    const d = Math.hypot(this.handRadius, dz) || 1e-4;

    // Distancia do ombro ate a projecao do cotovelo sobre a linha ombro->punho, e o quanto ele
    // sai dessa linha. O clamp e o que segura o caso degenerado: com o punho longe demais o braco
    // simplesmente estica (h = 0) em vez de gerar NaN e sumir da tela.
    const a = Math.min(d, Math.max(0, (UPPER_LEN * UPPER_LEN - FORE_LEN * FORE_LEN + d * d) / (2 * d)));
    const h = Math.sqrt(Math.max(0, UPPER_LEN * UPPER_LEN - a * a));

    const cos = Math.cos(this.handAngle);
    const sin = Math.sin(this.handAngle);
    // u: versor ombro->punho. p: perpendicular no plano (radial, vertical) — a dobra "pra cima".
    // l: perpendicular lateral no chao — a dobra "de lado". |sin| mede o quanto o radial esta
    // alinhado com a profundidade (e portanto o quanto p projeta pra nada na tela); `lean`
    // escolhe o lado da varredura, entao o cotovelo LIDERA a meia-volta.
    const ur = this.handRadius / d;
    const uz = dz / d;
    const k = ELBOW_SIDE * Math.abs(sin);
    const lean = this.sweep;
    const wx = -uz * cos * (1 - k) - sin * k * lean;
    const wy = -uz * sin * (1 - k) + cos * k * lean;
    const wz = ur * (1 - k);
    const wl = Math.hypot(wx, wy, wz) || 1e-4;

    const elbowX = this.worldX + a * ur * cos + h * (wx / wl);
    const elbowY = this.worldY + a * ur * sin + h * (wy / wl);
    const elbowZ = SHOULDER_ELEV + a * uz + h * (wz / wl);

    this.elbowX = elbowX;
    this.elbowY = elbowY;
    this.elbowElev = elbowZ;

    this.elbowPivot.setPosition(elbowX, elbowY + DEPTH_PIVOT).setElevation(elbowZ);
    this.layBar(this.upperArm, this.worldX, this.worldY, SHOULDER_ELEV, elbowX, elbowY, elbowZ, UPPER_THICK, DEPTH_UPPER);
    this.layBar(this.foreArm, elbowX, elbowY, elbowZ, this.handX, this.handY, this.handElev, FORE_THICK, DEPTH_FORE);

    // A silhueta projetada (ver o comentario no construtor): pergunta a luz no pe da maquina
    // (fogo mais proximo, ou luar via handoff), projeta cada junta do esqueleto no chao pela
    // MESMA estilizacao dos sprites em pe — plan + direcao * elevacao * unitLen — e liga as
    // juntas projetadas com um elo de sombra por parte. O ombro projeta exatamente onde a
    // cabeca da silhueta da base cai, entao a corrente nasce de dentro dela; os dedos da garra
    // pendurada fecham a ponta, e o elo deles ENCURTA quando a garra mergulha rente ao chao.
    const cast = world3d().groundCastAt(this.worldX, this.worldY, this.castMemory);
    if (!cast) {
      this.upperShadow.hide();
      this.foreShadow.hide();
      this.clawShadow.hide();
    } else {
      const px = (x: number, elev: number): number => x + cast.dirX * elev * cast.unitLen;
      const pz = (z: number, elev: number): number => z + cast.dirZ * elev * cast.unitLen;
      const fingersElev = Math.max(0.02, this.handElev - NODE_UP - 0.3);
      this.upperShadow.set(
        px(this.worldX, SHOULDER_ELEV), pz(this.worldY, SHOULDER_ELEV),
        px(elbowX, elbowZ), pz(elbowY, elbowZ),
        cast.alpha,
      );
      this.foreShadow.set(
        px(elbowX, elbowZ), pz(elbowY, elbowZ),
        px(this.handX, this.handElev), pz(this.handY, this.handElev),
        cast.alpha,
      );
      this.clawShadow.set(
        px(this.handX, this.handElev), pz(this.handY, this.handElev),
        px(this.handX, fingersElev), pz(this.handY, fingersElev),
        cast.alpha,
      );
    }
  }

  /**
   * Estica UM quad de uma junta ate a outra: posicao no meio, comprimento igual a distancia na
   * tela, e girado pra apontar de uma ponta a outra. Isso funciona porque o quad deste renderer
   * nao e camera-facing por lookAt — ele e um plano no eixo (X, altura) do mundo e a camera nunca
   * gira, entao girar em `rotation.z` e girar exatamente no plano da tela.
   *
   * A profundidade entra pela conversao `depthToScreen`; e a altura do quad que aparece
   * encurtada pela inclinacao da camera, entao o componente vertical e dividido por ela — sem
   * isso a barra chegaria torta em qualquer direcao que nao fosse leste-oeste.
   */
  private layBar(
    bar: Billboard3D,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    thickness: number,
    depth: number,
  ): void {
    const dx = bx - ax;
    const vy = (bz - az) - (by - ay) * this.depthToScreen;
    const len = Math.hypot(dx, vy);
    bar
      .setPosition(ax + dx / 2, ay + (by - ay) / 2 + depth)
      .setElevation(az + (bz - az) / 2)
      .setDisplaySize(Math.max(0.05, len), thickness)
      // `angle` inverte o sinal ao virar rotation.z, entao o angulo vai negado.
      .setAngle(-Math.atan2(vy, dx) * (180 / Math.PI));
  }

  private spawnCarried(kind: HeldItemKind): void {
    const visual = itemGroundVisual(kind);
    // Centrado pelo mesmo motivo da garra: a carga esta PENDURADA na pinca, nao apoiada no chao.
    this.carried = world3d()
      .addBillboard(visual.texture, visual.frame, { emissive: true, centered: true })
      .setPosition(this.clawX, this.clawY + DEPTH_ITEM)
      .setDisplaySize(ITEM_SIZE, ITEM_SIZE)
      .setElevation(Math.max(0.02, this.handElev - NODE_UP - 0.05));
    this.cargoSwing = 0;
    this.cargoSwingVel = 0;
  }

  private despawnCarried(): void {
    this.carried?.destroy();
    this.carried = undefined;
  }

  // Sem render(): o braco nao tem nada pra reprojetar por quadro (o mundo e 3D de verdade, quem
  // se move e a camera) e o ciclo anda em update(), com delta. RockObject abriu esse precedente.

  public destroy(): void {
    this.despawnCarried();
    this.base.destroy();
    this.hand.destroy();
    this.upperArm.destroy();
    this.foreArm.destroy();
    this.shoulderPivot.destroy();
    this.elbowPivot.destroy();
    this.upperShadow.destroy();
    this.foreShadow.destroy();
    this.clawShadow.destroy();
  }
}
