import { getStoneTexture } from '@/game/render3d/stoneTexture';
import { world3d, type Box3D, type GroundEllipse } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

/**
 * A ESCADA — a porta entre os dois andares do mundo, e a única que não é mágica.
 *
 * Ela substituiu um PORTAL: um arco com vórtice que engolia o herói girando, apagava a luz do
 * mundo, abria um túnel na tela e o cuspia caindo do céu no outro lado. Aquilo era bonito e era
 * teletransporte — e num jogo onde tudo o mais é físico (a ponte é feita de tábuas de verdade,
 * a pira sobe tora a tora, a montanha é cubo), a única passagem entre os dois mundos não podia
 * ser a peça que desmente a regra. Aqui o herói **desce andando**, e sobe andando.
 *
 * É GEOMETRIA, nunca sprite — a mesma carpintaria da ponte e da pira. Nenhum frame de arte novo
 * precisa existir, e a sombra e a luz do mundo entram de graça.
 *
 * ── DUAS PEÇAS, E ELAS NÃO SÃO A MESMA ──────────────────────────────────────
 *
 * Isto já foi UM lance só, cortado pelo teto: a mesma geometria espelhada nos dois andares. Era
 * elegante no papel e errado na tela, porque as duas metades não mostram a mesma coisa.
 *
 *   EM CIMA a escada é um BURACO. Tudo o que ela tem está abaixo do chão, e nada abaixo de y=0
 *   existe nesta câmera (lição 1). Então ela é DESENHADA, não construída: listras baixas
 *   encolhendo sobre um vão preto. Só dá para sugerir.
 *
 *   EMBAIXO a escada é uma MASSA. Ela sai do chão da caverna e SOBE até a boca no teto — ela tem
 *   volume, espelho, degrau, silhueta. Não há nada a sugerir: ela está toda acima de y=0, que é
 *   justamente onde esta câmera enxerga.
 *
 * E o lance de baixo sobe para o NORTE, para longe da câmera. Isto não é gosto, é projeção — a
 * câmera olha de 45,9°, e medido:
 *
 *   subindo PARA LONGE   → todo espelho aparece por cima da pisada da frente. Os quatro leem.
 *   subindo PARA A CÂMERA → a massa do topo (1 tile) tapa o lance inteiro: sobram 0,02 tile de
 *                           tela, uns 4 px. É a lição 2 de novo, agora em três dimensões.
 *
 * O PREÇO: o herói entra andando para o norte lá em cima e SAI andando para o sul lá embaixo —
 * ele desce os degraus vindo na direção da tela. O rumo se inverte, e isso já foi lei aqui
 * ("o rumo não muda no meio da viagem"). A lei caiu porque ela protegia uma continuidade que
 * ninguém vê — a tela fica preta no meio — enquanto cobrava a única coisa que se vê: a escada.
 * É também como o Zelda de cima sempre fez: some subindo, aparece descendo.
 *
 *      SUPERFÍCIE (buraco)               SUBTERRÂNEO (massa)
 *      ┌──────────────┐                  ┌──────────────┐
 *      │ ▓▓ fundo ▓▓  │ norte            │ ███ boca ███ │ norte  ← ele CHEGA no alto
 *      │ ███ vão ███  │                  │ ▄▄ degrau ▄▄ │
 *      │  ░ degrau ░  │                  │ ▄ degrau     │
 *      │ ░░ degrau ░░ │ sul              │ ▄ degrau     │ sul    ← e desce até o chão
 *      └──────────────┘                  └──────────────┘
 *         ↑ ele ENTRA por aqui, andando para o norte
 *
 * A BOCA FICA AO NORTE NOS DOIS. É a simplificação que a inversão comprou: entrar na escada é
 * andar para o NORTE em qualquer andar — no de cima isso é cair no buraco, no de baixo é subir
 * os degraus. Uma regra, dois andares, nenhum `if` em `handleTileEntered`.
 *
 * ── O QUE ESTA PEÇA APRENDEU APANHANDO ───────────────────────────────────────
 *
 * 1. **Nada abaixo de y=0 existe.** A v1 era um poço com degraus afundando: correto em 3D, e
 *    invisível — o chão do mundo é um quad OPACO em y=0 e a câmera olha de cima. Da superfície
 *    a escada era um aro pálido flutuando sobre a grama.
 * 2. **Perspectiva não cabe aqui.** A v2 pôs degraus altos descendo para longe: o da frente
 *    tapava todos os outros, e quatro degraus viravam uma rampa cinza lisa. As pisadas viraram
 *    LISTRAS BAIXAS sobre o escuro, cada uma menor que a anterior — o que desce é o TAMANHO
 *    delas, e isso lê em qualquer ângulo.
 * 3. **Preto puro sai MARROM** — enquanto o vão foi uma SUPERFÍCIE. Uma caixa escura num
 *    material iluminado soma o ambiente quente do mundo e vira lama; e, pior, ela CLAREIA junto
 *    com o dia e sob a tocha do herói, o que é o oposto de um buraco. Hoje o vão é `unlit`
 *    (ver `addBox`): buraco não tem superfície, então ele não recebe luz nenhuma e é preto na
 *    mesma medida de dia, de noite e com a tocha na mão.
 * 4. **A laje do vão enterrava as pisadas do fundo.** As últimas listras são mais baixas que a
 *    espessura da laje escura, então sumiam dentro dela. Todas assentam no TOPO do vão, nunca
 *    no chão do mundo.
 * 5. **A pedra é a do MUNDO, e o texel dela mede um pixel do mundo.** A peça vestia o granito
 *    molhado do vau do rio (escuro, azulado, com musgo de beira d'água) enquanto a montanha ao
 *    lado usa a rocha autorada do atlas — duas pedras na mesma tela. E, pior, a `BoxGeometry`
 *    estica a arte inteira em CADA face: o meio-fio saía com um texel de 20:1, granito virado
 *    listra. Hoje é uma folha só (`getStoneTexture('stair')`, 16×16 e cíclica) RECORTADA na
 *    densidade do mundo por `pixelTiled`, e cada peça tira dela um pedaço diferente.
 * 6. **Nada ancorava a peça no chão.** Caixa não entra no passe de sombra projetada (só
 *    billboard e terreno assado entram), então a alvenaria não tinha contato nenhum com a grama
 *    e lia como adesivo. Um blob de contato (`addGroundEllipse`) resolve por uma malha.
 *
 * O TILE CONTINUA CAMINHÁVEL: pisar nele é o gesto, e quem decide é a GameScene
 * (`handleTileEntered`), que só aceita quem entra pela BOCA, de frente. Ninguém cai numa
 * escadaria de lado.
 */

/** A largura do lance. Menor que 1 para sobrar chão de mundo nos dois lados da alvenaria. */
const RUN_W = 0.74;
/** O comprimento total da peça, ao longo do eixo norte-sul. */
const RUN_LEN = 1.0;

/**
 * Quantas pisadas o lance tem — e, por isso, quantas BOTAS se ouvem e quantas passadas o corpo
 * dá ao atravessar. A cadência da caminhada é medida nisto (ver `GameScene.walkStairs`): quem
 * mexer no número de degraus mexe no ritmo do gesto junto, que é o certo.
 */
export const STAIRS_STEPS = 4;
const STEPS = STAIRS_STEPS;
/**
 * As PISADAS. Baixas de propósito — nenhuma pode tapar a seguinte nesta câmera — e o que desce é
 * o TAMANHO delas: cada uma mais fina, mais curta e mais estreita que a anterior à medida que se
 * afasta da luz. É assim que um desenho de cima diz "isto recua" sem ter perspectiva para gastar.
 */
const TREAD_H_NEAR = 0.075;
const TREAD_H_FAR = 0.028;
const TREAD_LEN_NEAR = 0.130;
const TREAD_LEN_FAR = 0.070;
/** Quanto a última pisada é mais estreita que a primeira, em fração da largura do lance. */
const TREAD_NARROW = 0.24;
/** A fresta escura entre uma pisada e a outra: é ela que separa degrau de rampa. */
const TREAD_GAP = 0.046;
/**
 * De que altura da folha de pedra cada pisada tira o recorte dela, em texels.
 *
 * Não é decoração: a arte desce de crown a slate dentro de cada bloco (ver `stoneTexture`), então
 * escolher a linha é escolher o TOM. A de cima tira o topo claro e a do fundo tira a base
 * escura — a mesma leitura de "isto recua" que o tamanho já dá, agora também na cor, e sem uma
 * segunda textura nem um segundo material. É pixel art fazendo variação do jeito de sempre: uma
 * folha só, recortes diferentes.
 */
const TREAD_UV_ROW: readonly number[] = [1, 3, 5, 6];

/** A PAREDE DO FUNDO: o outro lado do vão, vista de cima. Ela é o que dá profundidade. */
const BACK_LEN = 0.13;
/**
 * A altura da parede do fundo.
 *
 * Ela subiu de 0,20 para cá porque no SUBTERRÂNEO ela é a única massa da peça: lá o vão é a boca
 * no teto de onde o herói desce, e uma soleira de 0,20 não é boca nenhuma. Não pode subir muito
 * mais que isto: a parede fica do lado da CÂMERA na metade de baixo, e alta demais ela tapa as
 * próprias pisadas que deveria emoldurar (medido: acima de ~0,45 ela come a listra do fundo).
 */
const BACK_H = 0.30;

/** A alvenaria em volta: meio-fio nos dois lados, e dois marcos na boca de entrada. */
const CURB_W = 0.10;
const CURB_H = 0.15;
const NEWEL_H = 0.24;

/** A espessura da laje escura do vão. As pisadas assentam no topo dela — ver a lição 4. */
const HOLE_H = 0.05;
/**
 * O vão. Preto de verdade, porque ele é `unlit` e nenhuma luz o alcança — ver a lição 3. Não é
 * `0x000000` cravado só para o caso de alguém tirar o `unlit`: um cinza-quase-preto degrada para
 * "escuro" em vez de degradar para "lama".
 */
const HOLE_COLOR = 0x0a0806;

/** O blob de contato sob a peça: o que faz a alvenaria tocar a grama — ver a lição 6. */
const CONTACT_R = 0.6;
const CONTACT_ALPHA = 0.22;

// ── O LANCE DE BAIXO: a escada de verdade ────────────────────────────────────
// Ela e um objeto proprio, e nao a peca de cima espelhada. Cada degrau e uma caixa que vai do
// CHAO ate a altura dele — e por isso que ela tem volume: nao ha pisada flutuando, ha uma massa
// de pedra escalonada, com o espelho de cada degrau virado para a camera.

/**
 * O pé do lance é o CENTRO do tile — onde o herói para quando acaba de descer. Ao sul dele o tile
 * é chão livre; ao norte é a escada inteira.
 */
const FLIGHT_FOOT = 0;
/**
 * A altura de um espelho. A profundidade da pisada NÃO é escolhida: ela é o percurso do herói
 * dividido pelo número de degraus, e é isso que faz a subida bater com a caminhada — cada bota
 * cai exatamente num degrau, e o corpo sobe um espelho no mesmo instante em que o pé pousa. Com
 * os dois números escolhidos à parte o corpo flutuava até meio espelho acima da pedra.
 */
const FLIGHT_RISER = 0.14;
/** A largura do lance, e o corrimao que o acompanha degrau a degrau. */
const FLIGHT_W = 0.70;
const RAIL_W = 0.09;
/** Quanto o corrimao passa da pisada dele — e o que faz o lance ter beira. */
const RAIL_RISE = 0.06;
/**
 * A BOCA NO TETO, em pe atras do ultimo degrau: o buraco por onde o lance continua para cima.
 *
 * Ela e o espelho exato do vao la de cima — `unlit`, preta, e no lado LONGE da camera nos dois
 * andares. E ela que faz a escada "acabar em algum lugar" em vez de parar no ar; e o corpo do
 * heroi apaga contra ela, que e o mesmo gesto de ser engolido pelo escuro.
 */
const SHAFT_LEN = 0.08;
const SHAFT_H = 0.52;

/**
 * Quanto o herói percorre ao atravessar, em tiles — e ele vem da PEÇA, não de um número escolhido
 * à parte.
 *
 * É a distância do centro do tile até a face da parede do fundo, que é exatamente onde o vão
 * escuro acaba. Antes isto era `RUN_LEN * 0.58`, um número solto: o herói terminava a caminhada
 * 0,08 tile FORA do tile, tendo atravessado a pedra do fundo. Ninguém via, porque ele já estava
 * quase apagado ali — mas era uma constante que mentia, e qualquer ajuste em `BACK_LEN` a
 * quebrava em silêncio.
 */
export const STAIRS_RUN_TILES = RUN_LEN / 2 - BACK_LEN;
/**
 * Quanto ele AFUNDA na superfície. Grande de propósito: aqui existe um chão opaco em y=0, e é ele
 * — não o alpha — que engole o corpo. Ver `GameScene.walkStairs`.
 */
export const STAIRS_DROP_TILES = 0.55;
/**
 * A que altura o lance de baixo TERMINA — o topo do último degrau, onde fica a boca do teto.
 *
 * Ele não é o espelho de `STAIRS_DROP_TILES` e nunca poderia ser: em cima o herói AFUNDA num
 * buraco e quem o engole é o chão opaco em y=0; embaixo ele SOBE uma escada que existe de
 * verdade, e cada centímetro dessa subida tem pedra debaixo do pé. Já foi 0,10 — um resto de
 * subida para o corpo não flutuar, de quando a peça de baixo era a de cima virada do avesso.
 */
export const STAIRS_RISE_TILES = STAIRS_STEPS * FLIGHT_RISER;

/** A profundidade de uma pisada: o percurso do herói repartido entre os degraus. Ver FLIGHT_RISER. */
const FLIGHT_TREAD = STAIRS_RUN_TILES / STAIRS_STEPS;

/**
 * A que altura o corpo está depois de `k` do lance — e por que os dois andares respondem
 * diferente.
 *
 * Em cima não há degrau nenhum: o herói cai num buraco, e uma rampa contínua é a leitura certa de
 * uma queda. Embaixo há QUATRO degraus de pedra, e um corpo que sobe em rampa por cima deles
 * flutua — meio espelho no pior ponto, que é o bastante para o pé descolar da pisada. Aqui ele
 * pousa no degrau que está sob ele, e o degrau troca no mesmo `k` em que a bota toca o chão
 * (`STAIRS_STEPS` manda nos dois), então o pulo de altura e o som são o mesmo evento.
 */
export const stairsLiftAt = (k: number, underground: boolean): number => {
  if (!underground) return -STAIRS_DROP_TILES * k;
  const walked = STAIRS_RUN_TILES * k;
  // `ceil` e nao `floor`: no pe da escada (`walked` = 0) ele esta no CHAO, e sobe um espelho no
  // instante em que pisa no primeiro degrau. Com `floor` ele nascia ja um degrau acima do piso —
  // e, na chegada, terminava a descida flutuando 0,14 tile sobre a caverna.
  const step = Math.min(STAIRS_STEPS, Math.ceil(walked / FLIGHT_TREAD));
  return step * FLIGHT_RISER;
};
/** Quanto tempo um lance leva. Passo de gente descendo degrau — nem corrida, nem cerimônia. */
export const STAIRS_WALK_MS = 620;

export type StairsWay = 'down' | 'up';

export class StairsObject implements WorldProp {
  public readonly blocking = false;

  private readonly parts: Box3D[] = [];

  private readonly contact: GroundEllipse;

  public constructor(
    public readonly worldX: number,
    public readonly worldY: number,
    /**
     * QUAL DAS DUAS PEÇAS esta é — e elas não são a mesma geometria, ver o cabeçalho.
     *
     * `down` é o BURACO da superfície: listras encolhendo sobre um vão preto, tudo rente ao chão.
     * `up` é a ESCADA da caverna: uma massa de pedra que sai do piso e sobe, degrau a degrau, até
     * a boca no teto. A boca das duas fica ao NORTE, então entrar é sempre andar para o norte.
     */
    public readonly way: StairsWay = 'down',
  ) {
    const w3 = world3d();

    // ── O CONTATO COM O CHÃO ──────────────────────────────────────────────────
    // Caixa não projeta sombra neste mundo (o passe de silhueta só conhece billboard e terreno
    // assado), então sem isto a alvenaria fica pousada sobre o chão sem tocá-lo — a assinatura
    // do adesivo. Uma malha, um draw call, e a peça passa a ter peso.
    this.contact = w3.addGroundEllipse(CONTACT_R, CONTACT_R, CONTACT_ALPHA);
    this.contact.setPosition(worldX, worldY);

    if (this.way === 'down') this.buildHole();
    else this.buildFlight();
  }

  /**
   * O BURACO, na superfície. Ele não mudou: é o desenho que três redesenhos custaram.
   *
   * Tudo acima de y=0, a profundidade sugerida pelo TAMANHO das listras, e um vão preto no lado
   * longe da câmera. Ninguém precisa ver o buraco; precisa ler "degraus, e depois o escuro".
   */
  private buildHole(): void {
    const w3 = world3d();
    const stone = getStoneTexture('stair');
    const { worldX, worldY } = this;
    /** Um deslocamento medido a partir da beira SUL (a da entrada), andando para o norte. */
    const at = (fromEntry: number): number => worldY + (RUN_LEN / 2 - fromEntry);

    // ── O VÃO ────────────────────────────────────────────────────────────────
    // Uma laje escura cobrindo quase o tile inteiro: é sobre ela que as pisadas aparecem, e é
    // ela que vira ESCURIDÃO no trecho que sobra do lado da boca. Ela não é o buraco — é a
    // leitura do buraco, que é tudo o que uma câmera de cima consegue ver de um. `unlit` porque
    // buraco não é superfície: ver a lição 3.
    this.parts.push(
      w3.addBox(RUN_W, HOLE_H, RUN_LEN - BACK_LEN, HOLE_COLOR, { unlit: true })
        .setPosition(worldX, at((RUN_LEN - BACK_LEN) / 2))
        .setElevation(HOLE_H / 2),
    );

    // A PAREDE DO FUNDO, em pé na beira da boca. Sem ela o escuro é um adesivo; com ela o olho
    // aceita que o chão continua, atrás daquela pedra.
    this.parts.push(
      w3.addBox(RUN_W, BACK_H, BACK_LEN, stone, { pixelTiled: true, uvShift: [2, 9] })
        .setPosition(worldX, at(RUN_LEN - BACK_LEN / 2))
        .setElevation(BACK_H / 2),
    );

    // ── AS PISADAS ───────────────────────────────────────────────────────────
    // Elas marcham da entrada em direção à boca, encolhendo — e param antes de chegar, deixando
    // o último trecho de escuro puro: é para lá que a escada desce.
    const treadLen = (k: number): number => TREAD_LEN_NEAR
      + (k / (STEPS - 1)) * (TREAD_LEN_FAR - TREAD_LEN_NEAR);

    for (let i = 0; i < STEPS; i += 1) {
      const t = i / (STEPS - 1);
      const h = TREAD_H_NEAR + t * (TREAD_H_FAR - TREAD_H_NEAR);
      const w = RUN_W * (1 - t * TREAD_NARROW);
      let fromEntry = 0;
      for (let k = 0; k < i; k += 1) fromEntry += treadLen(k) + TREAD_GAP;
      fromEntry += treadLen(i) / 2;
      this.parts.push(
        w3.addBox(w, h, treadLen(i), stone, { pixelTiled: true, uvShift: [1 + i * 3, TREAD_UV_ROW[i]] })
          .setPosition(worldX, at(fromEntry))
          // NO TOPO da laje do vão, nunca no chão do mundo: a lição 4 do cabeçalho.
          .setElevation(HOLE_H + h / 2),
      );
    }

    // ── A ALVENARIA ──────────────────────────────────────────────────────────
    // Meio-fio nos dois lados: ele é o contorno da peça. Sem ele o lance se dissolve no chão
    // quando o terreno tem a cor da pedra, e a escada vira uma mancha.
    for (const side of [-1, 1]) {
      this.parts.push(
        // O recorte comeca na COLUNA 2 (e na 10 do outro lado), nunca na 0: a coluna 0 e a junta
        // vertical da fiada de cima, e um meio-fio de 1,6 texel de largura que caisse em cima
        // dela sairia com metade do comprimento escuro. Conferido contando os texels que cada
        // face recebe — a face de topo do meio-fio mostra os 16 texels da folha na altura, entao
        // e a COLUNA que decide a cor dele inteiro.
        w3.addBox(CURB_W, CURB_H, RUN_LEN, stone, { pixelTiled: true, uvShift: [side < 0 ? 2 : 10, 0] })
          .setPosition(worldX + side * (RUN_W / 2 + CURB_W / 2), worldY)
          .setElevation(CURB_H / 2),
      );
      // OS MARCOS, nos dois cantos da beira por onde se ENTRA. Eles enquadram a entrada — e como
      // só se entra de frente, eles são a única legenda de que a peça precisa.
      this.parts.push(
        w3.addBox(CURB_W * 1.25, NEWEL_H, CURB_W * 1.25, stone, {
          pixelTiled: true,
          uvShift: side < 0 ? [9, 1] : [1, 9],
        })
          .setPosition(worldX + side * (RUN_W / 2 + CURB_W / 2), at(CURB_W * 0.7))
          .setElevation(NEWEL_H / 2),
      );
    }
  }

  /**
   * O LANCE, no subterrâneo. Uma escada de pedra que sai do chão e SOBE até a boca no teto.
   *
   * Cada degrau é uma caixa que vai do CHÃO até a altura dele — não é a pisada, é o degrau
   * inteiro. É daí que vem o volume: uma massa escalonada, e não quatro lajes flutuando. Cada
   * caixa esconde a de trás até a altura do espelho, então o que a câmera vê de cada degrau é
   * exatamente uma pisada e um espelho, que é como uma escada se lê.
   *
   * Ela sobe para o NORTE, para LONGE da câmera — ver o cabeçalho: é a única orientação em que os
   * quatro espelhos aparecem. E ela ocupa só a metade norte do tile: ao sul do pé sobra chão
   * livre, que é onde o herói para quando termina de descer.
   */
  private buildFlight(): void {
    const w3 = world3d();
    const stone = getStoneTexture('stair');
    const { worldX, worldY } = this;
    const top = STEPS * FLIGHT_RISER;

    for (let i = 0; i < STEPS; i += 1) {
      const h = (i + 1) * FLIGHT_RISER;
      // A caixa ocupa a profundidade de UMA pisada e vai do chão até o topo dela.
      const dy = FLIGHT_FOOT - (i + 0.5) * FLIGHT_TREAD;
      this.parts.push(
        w3.addBox(FLIGHT_W, h, FLIGHT_TREAD, stone, { pixelTiled: true, uvShift: [1 + i * 3, 1] })
          .setPosition(worldX, worldY + dy)
          .setElevation(h / 2),
      );
      // O CORRIMÃO sobe junto, degrau a degrau. Ele é a beira do lance: sem ele a massa lê como
      // uma rampa de blocos, e é a beira que diz "isto é uma escada e ela tem largura".
      for (const side of [-1, 1]) {
        this.parts.push(
          w3.addBox(RAIL_W, h + RAIL_RISE, FLIGHT_TREAD, stone, {
            pixelTiled: true,
            uvShift: [side < 0 ? 2 : 10, 0],
          })
            .setPosition(worldX + side * (FLIGHT_W / 2 + RAIL_W / 2), worldY + dy)
            .setElevation((h + RAIL_RISE) / 2),
        );
      }
    }

    // A BOCA NO TETO, em pé atrás do último degrau. Mesmo material do vão lá de cima (`unlit`),
    // pelo mesmo motivo: buraco não é superfície. É contra ela que o corpo do herói apaga.
    this.parts.push(
      w3.addBox(FLIGHT_W + 2 * RAIL_W, SHAFT_H, SHAFT_LEN, HOLE_COLOR, { unlit: true })
        .setPosition(worldX, worldY + FLIGHT_FOOT - STEPS * FLIGHT_TREAD - SHAFT_LEN / 2)
        .setElevation(top + SHAFT_H / 2),
    );
  }

  public destroy(): void {
    for (const part of this.parts) part.destroy();
    this.parts.length = 0;
    this.contact.destroy();
  }
}
