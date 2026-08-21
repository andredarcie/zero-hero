import { MasonryBuilder, enableTiling } from '@/game/objects/stairsMasonry';
import { getStoneTexture } from '@/game/render3d/stoneTexture';
import { STAIRS_PIT_DEPTH, world3d, type Box3D, type GroundEllipse } from '@/game/render3d/World3D';
import type * as THREE from 'three';
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
 *   existe nesta câmera (lição 1). Então ela é DESENHADA, não construída: pisadas encolhendo
 *   sobre um vão preto, entre duas paredes que descem em degraus. Só dá para sugerir.
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
 *      │ ▓▓ verga ▓▓  │ norte            │ ███ boca ███ │ norte  ← ele CHEGA no alto
 *      │ ███ vão ███  │                  │ ▄▄ degrau ▄▄ │
 *      │  ░ pisada ░  │                  │ ▄ degrau     │
 *      │ ░░ pisada ░░ │ sul              │ ▄ degrau     │ sul    ← e desce até o chão
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
 * 5. **A pedra é a do MUNDO, e o texel dela mede um pixel do mundo.** Uma folha só
 *    (`getStoneTexture('stair')`, 16×16 e cíclica) RECORTADA na densidade do mundo, e cada peça
 *    tira dela um pedaço diferente. Sem isso a `BoxGeometry` estica a arte inteira em CADA face,
 *    e o meio-fio sai com um texel de 20:1 — granito virado listra.
 * 6. **Nada ancorava a peça no chão.** Caixa não entra no passe de sombra projetada (só
 *    billboard e terreno assado entram), então a alvenaria não tinha contato nenhum com a grama
 *    e lia como adesivo. Um blob de contato (`addGroundEllipse`) resolve por uma malha.
 *
 * ── E O QUE A REFORMA DE HOJE ARRUMOU ────────────────────────────────────────
 *
 * A peça estava certa em geometria e ERRADA em duas coisas que a câmera vê antes de qualquer
 * outra: o VALOR e a SILHUETA.
 *
 *   O VALOR. A pedra vestia a rampa da rocha do mundo copiada tal e qual — e na rocha os tons
 *   claros são meia dúzia de pixels no teto de um seixo, enquanto aqui eles viravam a face
 *   inteira de um meio-fio de meio tile. Medido na tela: a peça saía a #d8d8dc, atravessava o
 *   corte do bloom e virava um borrão branco de porcelana na grama — de dia e de noite, porque
 *   nada disso vinha da luz. A folha foi reautorada como um TECLADO DE VALORES (ver
 *   `stoneTexture`): quatro fiadas de quatro linhas, coroa/corpo/sombra/junta, e escolher a linha
 *   do recorte passou a ser escolher o tom. Pisada clara, espelho escuro, junta preta.
 *
 *   A SILHUETA. Um meio-fio de altura constante dos dois lados do vão desenha um RETÂNGULO, e um
 *   retângulo com um buraco preto dentro é uma banheira, não uma escadaria. Hoje as duas paredes
 *   DESCEM em degraus junto com as pisadas, cada lance com um coping claro por cima: a peça
 *   ganhou uma silhueta serrilhada que diz "isto afunda" antes de o olho chegar nas pisadas. É a
 *   mesma leitura que faz a escada de baixo funcionar, agora dos dois lados.
 *
 * Isso custaria quarenta draw calls no `addBox` (uma `Mesh` e um `Material` por caixa, e as cinco
 * escadas do mundo nascem todas no `create()`). Por isso a alvenaria inteira virou UMA malha
 * mergeada (`stairsMasonry` + `World3D.addLitMesh`): quatro vezes mais pedra por um TERÇO das
 * malhas de antes. O que continua em `addBox` é só o VÃO, porque ele é `unlit` e `unlit` é outro
 * material — e são três caixas, não quarenta.
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
 * AS LINHAS DA FOLHA DE PEDRA, por tom — o teclado que `stoneTexture` autorou.
 *
 * Quatro fiadas de quatro linhas: coroa, corpo, sombra, junta. Pedir `CROWN[i]` é pedir "claro na
 * fiada i"; `SHADE[i]` é pedir "escuro". Um número solto no `uvShift` de uma peça seria uma
 * adivinhação — e foi exatamente assim que a versão anterior acabou com quatro pisadas do mesmo
 * branco.
 */
const CROWN = [0, 4, 8, 12] as const;
const BODY = [1, 5, 9, 13] as const;
const SHADE = [2, 6, 10, 14] as const;

/**
 * A espessura de todo COPING e de toda PISADA clara da peça.
 *
 * Ela é fina de propósito: o que ela precisa fazer é pôr uma LINHA clara em cima de uma massa
 * escura, e uma linha grossa vira outra face. Um texel e meio do mundo, que é o mínimo que
 * sobrevive ao filtro nearest desta câmera.
 */
const CAP_H = 0.022;

// ── O BURACO, na superfície ──────────────────────────────────────────────────

/**
 * Quanto o HERÓI afunda ao descer (ver `STAIRS_DROP_TILES`, que o exporta, e `walkStairs`).
 * Ele mora aqui, antes de tudo, porque o espelho do degrau é DERIVADO dele — e uma constante
 * usada acima da própria declaração é um `undefined` silencioso em tempo de módulo.
 */
const STAIRS_DROP_TILES_VALUE = 0.55;

/**
 * As PISADAS. O que desce é o TAMANHO delas — cada uma mais curta e mais estreita que a anterior à
 * medida que se afasta da luz — e, desde que o poço é um buraco de verdade, também a ALTURA
 * (`TREAD_RISE`). Enquanto tudo tinha de caber acima de y=0, o tamanho era o único recurso: elas
 * também afinavam (`TREAD_H_NEAR`→`TREAD_H_FAR`, 0,078→0,030) para fingir a queda. Isso saiu com o
 * vão falso — hoje o degrau é uma massa que vai do fundo do poço até o seu topo, e quem diz o
 * quanto ele desceu é a queda real, não a espessura.
 */
const TREAD_LEN_NEAR = 0.112;
const TREAD_LEN_FAR = 0.074;
/**
 * As pisadas não encostam nas paredes: 10% da largura do vão fica de escuro em cada lado, o lance
 * inteiro. Sem essa folga a pisada da frente vai de parede a parede e a peça lê como uma TAMPA de
 * pedra com um risco preto no fundo — o escuro precisa CONTORNAR os degraus para eles estarem
 * dentro de um buraco em vez de em cima dele.
 */
const TREAD_INSET = 0.20;
/**
 * Quanto a última pisada é mais estreita que a primeira, em fração da largura do lance.
 *
 * Encolheu junto com a rampa de tom, e pelo mesmo motivo: era 0,36 para fingir distância, e um
 * degrau 36% mais estreito no fundo de um poço preto vira um risco. A queda real faz esse trabalho.
 */
const TREAD_NARROW = 0.20;
/**
 * A fresta escura entre uma pisada e a outra: é ela que separa degrau de rampa.
 *
 * Ela subiu de 0,046 para 0,060 quando ficou medido quanto esta câmera ACHATA o eixo norte-sul:
 * um tile mede ~142 px de largura na tela e ~80 px de profundidade, quase 2:1. Toda distância em
 * `z` desta peça aparece com metade do tamanho que tem — e uma fresta de 0,046 tile virava três
 * pixels, que é o mesmo que fresta nenhuma. As quatro pisadas liam como uma placa só.
 */
const TREAD_GAP = 0.060;
/** Quanto o nariz da pisada avança sobre a fresta anterior. Um beiral, e é ele que faz sombra. */
const TREAD_NOSE = 0.014;
/**
 * De que fiada cada pisada tira a pedra dela — e a rampa ABRIU quando o poço virou buraco de
 * verdade.
 *
 * Ela ia de coroa a SOMBRA (`[CROWN, BODY, SHADE, SHADE]`), e isso estava certo enquanto o "fundo"
 * era uma laje preta pintada logo abaixo da pisada: escurecer era o segundo eixo do "isto recua",
 * porque o primeiro (a queda) não existia. Agora existe — e uma pisada de sombra DENTRO de um poço
 * preto simplesmente não aparece: das quatro, só a da entrada chegava à tela. Quem diz o quanto
 * cada degrau desceu passou a ser a geometria, então o tom só precisa deixá-las todas legíveis
 * contra o escuro. Continua caindo, de coroa a corpo — mas nenhuma se apaga.
 */
const TREAD_CAP_ROW: readonly number[] = [CROWN[0], CROWN[1], BODY[0], BODY[2]];

/** A PAREDE DO FUNDO: o outro lado do vão, vista de cima. Ela é o que dá profundidade. */
const BACK_LEN = 0.13;
/**
 * A altura da parede do fundo — e ela BAIXOU, desfazendo um empréstimo.
 *
 * Ela tinha subido para 0,30 porque no SUBTERRÂNEO esta mesma medida era a única massa da peça:
 * lá o vão é a boca no teto, e uma soleira de 0,20 não é boca nenhuma. Só que o lance de baixo
 * ganhou uma PORTA de verdade (ombreiras, verga e fecho, ver `buildFlight`) e não depende mais
 * disto — e enquanto dependeu, a superfície pagou a conta: uma parede alta atravessada no fundo,
 * com verga e tudo, fecha o vão por cima e a peça inteira lê como uma LAREIRA. Aqui ela é o que
 * sempre devia ter sido: um lábio baixo que diz "o chão continua atrás desta pedra", e nada mais.
 */
const BACK_H = 0.185;

/** A alvenaria em volta: as duas paredes que descem, e dois marcos na boca de entrada. */
const CURB_W = 0.10;
/**
 * A ESCADA DA PAREDE LATERAL — a altura do primeiro lance e quanto ela desce a cada um.
 *
 * Cinco lances, um por pisada mais o do fundo. É esta série que desenha a silhueta serrilhada:
 * de fora, antes de qualquer pisada aparecer, já se lê que o chão afunda ali.
 */
const CHEEK_H_NEAR = 0.175;
const CHEEK_DROP = 0.030;
/** Quanto o coping passa da parede, para os dois lados. Um beiral, não um enfeite. */
const CAP_OVERHANG = 0.010;
/**
 * O TOM DE CADA LANCE DE COPING, do mais perto da entrada ao mais fundo.
 *
 * Ele APAGA, e é essa a peça inteira do enigma que faltava: com os cinco lances em coroa as duas
 * beiras chegavam ao fundo do buraco tão acesas quanto começaram, e um retângulo de pedra clara
 * com um vão preto dentro é uma lareira. Aqui os dois últimos lances afundam para sombra e o
 * enquadramento SE ABRE no escuro — a alvenaria some dentro do buraco, que é o que uma alvenaria
 * faz quando o chão acaba.
 */
const COPING_ROW: readonly number[] = [CROWN[0], CROWN[1], BODY[2], SHADE[3], SHADE[0]];
/**
 * OS MARCOS DA ENTRADA — e eles são BAIXOS, o que não foi a primeira tentativa.
 *
 * Com 0,26 de altura eles eram a coisa mais alta da peça, plantados justamente nos dois cantos
 * mais perto da câmera: dois postes brancos na frente de um buraco, e o conjunto voltava a ler
 * como um OBJETO pousado na grama em vez de um vão aberto nela. Agora eles mal passam do primeiro
 * lance da parede (0,175) — a diferença é 0,02 tile, o bastante para o canto existir e pouco o
 * bastante para nada se levantar do chão. Eles engordaram o que emagreceram em altura: um marco
 * é um bloco atarracado na beira, não uma torre.
 */
const NEWEL_H = 0.16;
const NEWEL_W = 0.135;
const NEWEL_CAP_W = 0.155;

/**
 * QUANTO CADA DEGRAU DESCE — e a lição nº 1 do cabeçalho, finalmente desfeita.
 *
 * "Nada abaixo de y=0 existe" era verdade enquanto o chão do mundo era um quad opaco em y=0. Hoje
 * o tile da escada é um POÇO de verdade: o `World3D` afunda o quad daquele tile em
 * `STAIRS_PIT_DEPTH` e fecha as quatro beiras com parede, exatamente como faz com o leito do rio.
 * Então os degraus deixaram de SUGERIR profundidade e passaram a ter: eles descem.
 *
 * **E ele é DERIVADO de `STAIRS_DROP_TILES`, nunca escolhido.** Quem já descia era o HERÓI: a
 * caminhada afunda o corpo 0,55 tile, e esse número existia desde quando não havia degrau nenhum
 * embaixo dele para pisar. Um passo escolhido a olho (o primeiro palpite foi 0,115) põe a pedra a
 * descer na metade da velocidade do corpo — ele atravessa os degraus e sai por baixo. Aqui o
 * espelho é a queda dividida pelos degraus, e as botas encontram pedra em cada um.
 *
 * O último degrau para em −0,41 e o corpo termina em −0,55: ele afunda 0,14 tile ALÉM da última
 * pisada, para dentro do escuro. É de propósito — uma escada que acaba num degrau visível não
 * leva a lugar nenhum.
 */
const TREAD_RISE = STAIRS_DROP_TILES_VALUE / STEPS;
/**
 * O VÃO, EM TRÊS BANDAS — e não uma só, porque um buraco não tem um fundo, tem um FUNDO QUE SE
 * AFASTA.
 *
 * Nenhuma é `0x000000` cravado: um cinza-quase-preto degrada para "escuro" em vez de degradar
 * para "lama" se um dia alguém tirar o `unlit`. A da boca leva um resto de azul do céu; a do
 * fundo é a mais próxima do preto que a peça tem. Elas são `unlit` — ver a lição 3 —, então o
 * degradê não muda com a hora do dia nem com a tocha na mão, que é o ponto.
 */
// (Havia um `VOID_NEAR`, o tom da boca do buraco da superfície. Ele morreu com o vão falso: o
// escuro de lá agora é o próprio poço no terreno, e `mats.pit` é quem escolhe o tom.)
const VOID_MID = 0x0b0910;
const VOID_FAR = 0x040308;

/** O blob de contato sob a peça: o que faz a alvenaria tocar a grama — ver a lição 6. */
const CONTACT_R = 0.68;
const CONTACT_ALPHA = 0.3;

// ── O LANCE DE BAIXO: a escada de verdade ────────────────────────────────────
// Ela e um objeto proprio, e nao a peca de cima espelhada. Cada degrau e uma massa que vai do
// CHAO ate a altura dele, com uma PISADA clara por cima — e por isso ele lê como degrau: o que a
// camera vê de cada um é uma linha clara sobre um espelho escuro, que é o desenho de uma escada.

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
/** A largura do lance, e as paredes que o acompanham degrau a degrau. */
const FLIGHT_W = 0.70;
const WALL_W = 0.12;
/**
 * Quanto a parede lateral passa da pisada dela.
 *
 * Era 0,06 e a peça lia como quatro barras brancas: um corrimão dessa altura, visto de cima,
 * não é beira nenhuma — é um risco ao lado da pisada. Com 0,115 a parede tem FACE, e a face é o
 * que separa "uma escada entre dois muros" de "lajes empilhadas".
 */
const WALL_RISE = 0.115;

/**
 * A BOCA NO TETO, em pe atras do ultimo degrau: o buraco por onde o lance continua para cima.
 *
 * Ela e o espelho exato do vao la de cima — `unlit`, preta, e no lado LONGE da camera nos dois
 * andares. E ela que faz a escada "acabar em algum lugar" em vez de parar no ar; e o corpo do
 * heroi apaga contra ela, que e o mesmo gesto de ser engolido pelo escuro.
 *
 * Hoje ela é EMOLDURADA: duas ombreiras e uma verga com fecho, porque um retângulo preto no ar
 * sem nada em volta lê como um erro de desenho, e uma porta lê como uma porta.
 */
const SHAFT_LEN = 0.08;
const SHAFT_H = 0.52;
const JAMB_W = 0.13;
const LINTEL_H = 0.09;

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
export const STAIRS_DROP_TILES = STAIRS_DROP_TILES_VALUE;
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

  /** A ALVENARIA INTEIRA, numa malha só. Ver `stairsMasonry`. */
  private readonly masonry: THREE.Mesh;

  /** O VÃO. Fora da malha porque `unlit` é outro material — e são três caixas, não quarenta. */
  private readonly voids: Box3D[] = [];

  private readonly contact: GroundEllipse;

  public constructor(
    public readonly worldX: number,
    public readonly worldY: number,
    /**
     * QUAL DAS DUAS PEÇAS esta é — e elas não são a mesma geometria, ver o cabeçalho.
     *
     * `down` é o BURACO da superfície: pisadas encolhendo sobre um vão preto, entre duas paredes
     * que descem em degraus. `up` é a ESCADA da caverna: uma massa de pedra que sai do piso e
     * sobe, degrau a degrau, até a boca emoldurada no teto. A boca das duas fica ao NORTE, então
     * entrar é sempre andar para o norte.
     */
    public readonly way: StairsWay = 'down',
  ) {
    const w3 = world3d();
    const sheet = getStoneTexture('stair');
    enableTiling(sheet);

    // ── O CONTATO COM O CHÃO ──────────────────────────────────────────────────
    // Caixa não projeta sombra neste mundo (o passe de silhueta só conhece billboard e terreno
    // assado), então sem isto a alvenaria fica pousada sobre o chão sem tocá-lo — a assinatura
    // do adesivo. Uma malha, um draw call, e a peça passa a ter peso.
    this.contact = w3.addGroundEllipse(CONTACT_R, CONTACT_R, CONTACT_ALPHA);
    this.contact.setPosition(worldX, worldY);

    const stone = new MasonryBuilder(sheet);
    if (this.way === 'down') this.buildHole(stone);
    else this.buildFlight(stone);

    this.masonry = w3.addLitMesh(stone.build(), sheet);
    this.masonry.position.set(worldX, 0, worldY);
  }

  /** Uma caixa de VÃO: escuridão que não é superfície, então não recebe luz nenhuma. */
  private addVoid(w: number, h: number, d: number, colour: number, y: number, z: number): void {
    this.voids.push(
      world3d().addBox(w, h, d, colour, { unlit: true })
        .setPosition(this.worldX, this.worldY + z)
        .setElevation(y),
    );
  }

  /**
   * O BURACO, na superfície.
   *
   * Tudo acima de y=0, a profundidade sugerida pelo TAMANHO das pisadas e pelo DEGRAU das duas
   * paredes, e um vão que escurece em três bandas no lado longe da câmera. Ninguém precisa ver o
   * buraco; precisa ler "degraus, e depois o escuro".
   */
  private buildHole(stone: MasonryBuilder): void {
    /** Um deslocamento medido a partir da beira SUL (a da entrada), andando para o norte. */
    const at = (fromEntry: number): number => RUN_LEN / 2 - fromEntry;

    // ── O VÃO NÃO É MAIS DESENHADO ───────────────────────────────────────────
    // Aqui viviam três caixas pretas encaixadas: uma laje `unlit` em três bandas que escureciam
    // para o norte, fingindo um fundo que se afasta. Elas eram o buraco. Hoje o buraco é o próprio
    // TERRENO — `World3D` afunda o quad deste tile e fecha as beiras com parede preta, como faz
    // com o rio —, e uma laje falsa por cima de um poço de verdade seria uma tampa.
    //
    // A beira por onde se entra continua ABERTA, sem soleira. Houve uma: um lábio de pedra claro
    // atravessado na entrada, para o chão do mundo "acabar em algum lugar". Na tela ele virou uma
    // PAREDE — a peça lia como um caixote fechado, e a entrada, que é a única coisa que o jogador
    // precisa entender ali, era justamente o que ficava tapado.

    // A PAREDE DO FUNDO, em pé na beira da boca. Sem ela o escuro é um adesivo; com ela o olho
    // aceita que o chão continua, atrás daquela pedra. Ela é LARGA o bastante para encostar nas
    // duas paredes laterais: um vão de 0,1 tile entre elas deixava o norte da peça aberto.
    stone.block({
      x: 0,
      y: BACK_H / 2,
      z: at(RUN_LEN - BACK_LEN / 2),
      w: RUN_W + 2 * CURB_W,
      h: BACK_H,
      d: BACK_LEN,
      uv: [2, BODY[1]],
    });
    // O COPING sobre ela, avançando 0,03 para DENTRO do vão (nunca para fora: o tile acaba
    // exatamente na face norte da parede, e um beiral ali vazaria para o tile do vizinho). Ele sai
    // em CORPO, e não em coroa: é a beira mais funda da peça, e ela não pode ser a mais acesa.
    stone.block({
      x: 0,
      y: BACK_H + CAP_H * 1.3 / 2,
      z: at(RUN_LEN - 0.08),
      w: RUN_W + 2 * CURB_W + 0.02,
      h: CAP_H * 1.3,
      d: BACK_LEN + 0.03,
      uv: [1, BODY[1]],
    });
    // ── AS PISADAS ───────────────────────────────────────────────────────────
    // Elas marcham da entrada em direção à boca, encolhendo — e param antes de chegar, deixando
    // o último trecho de escuro puro: é para lá que a escada desce. Cada uma é uma MASSA escura
    // com uma PISADA clara por cima, e o nariz da pisada avança sobre a fresta: é o beiral que
    // faz o degrau ter frente.
    const treadLen = (k: number): number => TREAD_LEN_NEAR
      + (k / (STEPS - 1)) * (TREAD_LEN_FAR - TREAD_LEN_NEAR);

    let fromEntry = 0.018;
    for (let i = 0; i < STEPS; i += 1) {
      const t = i / (STEPS - 1);
      const w = RUN_W * (1 - TREAD_INSET) * (1 - t * TREAD_NARROW);
      const len = treadLen(i);
      const mid = fromEntry + len / 2;
      // O TOPO deste degrau, DENTRO do poço: o primeiro rente ao chão do mundo, cada um seguinte
      // um `TREAD_RISE` mais fundo. A massa abaixo dele é UM ESPELHO — exatamente a queda até o
      // degrau seguinte —, e não uma coluna até o fundo.
      //
      // Ela FOI uma coluna, na primeira tentativa de furar o chão: parecia mais correto ("um
      // degrau é o que sobra de uma escada maciça depois de cortar o vão") e encheu o poço de
      // granito. Vista de cima, a soma dos quatro blocos é uma TAMPA de pedra com o buraco
      // debaixo — o preto que o poço abriu nunca chegava à tela. O escuro tem de passar ENTRE os
      // degraus e por baixo do último: é ele que diz que aquilo continua descendo.
      const top = -i * TREAD_RISE;
      stone.block({
        x: 0,
        y: top - CAP_H - TREAD_RISE / 2,
        z: at(mid),
        w,
        h: TREAD_RISE,
        d: len,
        uv: [1 + i * 3, SHADE[i]],
      });
      // A pisada clara, com o nariz avançando para a entrada.
      stone.block({
        x: 0,
        y: top - CAP_H / 2,
        z: at(mid - TREAD_NOSE / 2),
        w,
        h: CAP_H,
        d: len + TREAD_NOSE,
        uv: [2 + i * 3, TREAD_CAP_ROW[i]],
      });
      fromEntry += len + TREAD_GAP;
    }

    // ── AS PAREDES QUE DESCEM ────────────────────────────────────────────────
    // O contorno da peça, e a coisa que mais mudou nela. Cinco lances por lado, cada um mais
    // baixo que o anterior, cada um com um coping claro por cima: a silhueta serrilhada diz
    // "isto afunda" de longe, antes de qualquer pisada aparecer. Um meio-fio de altura constante
    // desenhava um retângulo, e um retângulo com um buraco preto dentro é uma banheira.
    const segLen = (RUN_LEN - BACK_LEN) / (STEPS + 1);
    for (const side of [-1, 1]) {
      const x = side * (RUN_W / 2 + CURB_W / 2);
      for (let k = 0; k < STEPS + 1; k += 1) {
        const top = CHEEK_H_NEAR - k * CHEEK_DROP;
        const z = at(k * segLen + segLen / 2);
        // O recorte comeca na COLUNA 2 (e na 10 do outro lado), nunca na 0: a coluna 0 e a junta
        // vertical da fiada de cima, e um coping de 1,6 texel de largura que caisse em cima dela
        // sairia com metade do comprimento escuro.
        const col = (side < 0 ? 2 : 10) + k;
        // A MASSA da parede em SOMBRA e só o coping em coroa: quem tem de ser a coisa mais clara
        // da peça é a PISADA, porque é nela que o jogador precisa olhar. Com a parede inteira em
        // corpo, o frame de pedra ganhava do lance que ele existe para emoldurar.
        // A massa desce ate o FUNDO do poco: ela e o forro da parede do buraco, nao um meio-fio
        // pousado na grama. Sem isso o poco preto aparece POR TRAS do meio-fio assim que a camera
        // pega a peca de lado, e a alvenaria volta a ler como adesivo em cima de um furo.
        stone.block({
          x,
          y: (top - CAP_H - STAIRS_PIT_DEPTH) / 2,
          z,
          w: CURB_W,
          h: top - CAP_H + STAIRS_PIT_DEPTH,
          d: segLen,
          uv: [col, SHADE[k % 4]],
        });
        // E o coping APAGA à medida que desce (coroa nos dois primeiros lances, corpo dos outros)
        // e ANDA para dentro do vão: é a mesma recessão que as pisadas têm, agora nas paredes. De
        // outro jeito as duas beiras chegam ao fundo do buraco tão acesas e tão largas quanto
        // começaram, e o vão vira um desenho chapado com um retângulo preto no meio.
        stone.block({
          x: x - side * k * 0.011,
          y: top - CAP_H / 2,
          z,
          w: CURB_W + 2 * CAP_OVERHANG,
          h: CAP_H,
          d: segLen,
          uv: [col, COPING_ROW[k]],
        });
      }
      // OS MARCOS, nos dois cantos da beira por onde se ENTRA. Eles enquadram a entrada — e como
      // só se entra de frente, eles são a única legenda de que a peça precisa. Eles passam do
      // primeiro lance da parede de propósito: um marco rente à parede não é um marco.
      stone.block({
        x, y: NEWEL_H / 2, z: at(0.085), w: NEWEL_W, h: NEWEL_H, d: NEWEL_W, uv: [3, SHADE[2]],
      });
      stone.block({
        x,
        y: NEWEL_H + 0.04 / 2,
        z: at(0.085),
        w: NEWEL_CAP_W,
        h: 0.04,
        d: NEWEL_CAP_W,
        // O capitel do marco sai em CORPO. Em coroa, os dois cantos mais perto da câmera eram a
        // coisa mais clara da tela e fechavam um U aceso em volta do vão — e um U aceso com preto
        // dentro é uma banheira. Quem fica em coroa na beira da entrada é a PISADA, que é onde o
        // pé vai.
        uv: [side < 0 ? 2 : 8, BODY[1]],
      });
    }

    // DOIS BLOCOS CAÍDOS sobre os copings. Não é sujeira decorativa: eles quebram a régua perfeita
    // das duas paredes, e uma escadaria velha que nunca perdeu uma pedra lê como uma peça de
    // catálogo. Ficam EM CIMA da alvenaria, nunca no chão em volta — ali é por onde se anda.
    stone.block({
      x: -(RUN_W / 2 + CURB_W / 2),
      y: CHEEK_H_NEAR - CHEEK_DROP + 0.025,
      z: at(0.30),
      w: 0.075,
      h: 0.05,
      d: 0.09,
      uv: [5, BODY[2]],
    });
    stone.block({
      x: RUN_W / 2 + CURB_W / 2,
      y: CHEEK_H_NEAR - 3 * CHEEK_DROP + 0.02,
      z: at(0.63),
      w: 0.06,
      h: 0.04,
      d: 0.07,
      uv: [11, SHADE[3]],
    });
  }

  /**
   * O LANCE, no subterrâneo. Uma escada de pedra que sai do chão e SOBE até a boca no teto.
   *
   * Cada degrau é uma MASSA que vai do chão até a altura dele, com uma PISADA clara por cima —
   * não é uma laje, é o degrau inteiro. É daí que vem o volume: uma massa escalonada, e não
   * quatro lajes flutuando. Cada caixa esconde a de trás até a altura do espelho, então o que a
   * câmera vê de cada degrau é exatamente uma linha clara sobre um espelho escuro, que é como uma
   * escada se lê.
   *
   * Ela sobe para o NORTE, para LONGE da câmera — ver o cabeçalho: é a única orientação em que os
   * quatro espelhos aparecem. E ela ocupa só a metade norte do tile: ao sul do pé sobra chão
   * livre, que é onde o herói para quando termina de descer.
   */
  private buildFlight(stone: MasonryBuilder): void {
    const top = STEPS * FLIGHT_RISER;

    for (let i = 0; i < STEPS; i += 1) {
      const h = (i + 1) * FLIGHT_RISER;
      // A caixa ocupa a profundidade de UMA pisada e vai do chão até o topo dela.
      const z = FLIGHT_FOOT - (i + 0.5) * FLIGHT_TREAD;
      // A massa, em SOMBRA: o que a câmera vê dela é o espelho, e um espelho claro embaixo de uma
      // pisada clara é uma rampa. A altura desconta a pisada para o topo continuar exatamente em
      // `h` — é lá que `stairsLiftAt` põe o pé do herói, e meio texel de erro já descola a bota.
      stone.block({
        x: 0,
        y: (h - CAP_H) / 2,
        z,
        w: FLIGHT_W,
        h: h - CAP_H,
        d: FLIGHT_TREAD,
        uv: [1 + i * 3, SHADE[i]],
      });
      // A PISADA, avançando sobre o espelho de baixo. O beiral é o degrau.
      stone.block({
        x: 0,
        y: h - CAP_H / 2,
        z: z + TREAD_NOSE / 2,
        w: FLIGHT_W,
        h: CAP_H,
        d: FLIGHT_TREAD + TREAD_NOSE,
        uv: [2 + i * 3, CROWN[i]],
      });
      // AS PAREDES sobem junto, degrau a degrau, com um coping claro correndo por cima. Elas são
      // a beira do lance: sem elas a massa lê como uma rampa de blocos, e é a beira que diz "isto
      // é uma escada e ela tem largura".
      for (const side of [-1, 1]) {
        const x = side * (FLIGHT_W / 2 + WALL_W / 2);
        const wallTop = h + WALL_RISE;
        const col = side < 0 ? 2 : 10;
        stone.block({
          x,
          y: (wallTop - CAP_H) / 2,
          z,
          w: WALL_W,
          h: wallTop - CAP_H,
          d: FLIGHT_TREAD,
          uv: [col, SHADE[i]],
        });
        // O coping da parede sai em CORPO, e não em coroa. Com ele em coroa as duas beiras viravam
        // um zíper de luz subindo dos dois lados e disputavam a atenção com as pisadas — e quem
        // tem de ser lido aqui são os degraus, que são o que o jogador vai SUBIR.
        stone.block({
          x,
          y: wallTop - CAP_H / 2,
          z,
          w: WALL_W + 2 * CAP_OVERHANG,
          h: CAP_H,
          d: FLIGHT_TREAD,
          uv: [col + 1, BODY[i]],
        });
      }
    }

    // ── A BOCA NO TETO ───────────────────────────────────────────────────────
    // O vão em pé atrás do último degrau, em DUAS bandas (a de baixo ainda pega um resto da luz
    // da caverna, a de cima é o mais perto do preto que a peça tem) — mesmo material do vão lá em
    // cima e pelo mesmo motivo: buraco não é superfície. É contra ela que o corpo do herói apaga.
    const shaftZ = FLIGHT_FOOT - STEPS * FLIGHT_TREAD - SHAFT_LEN / 2;
    const shaftW = FLIGHT_W + 0.02;
    this.addVoid(shaftW, SHAFT_H / 2, SHAFT_LEN, VOID_MID, top + SHAFT_H / 4, shaftZ);
    this.addVoid(shaftW, SHAFT_H / 2, SHAFT_LEN, VOID_FAR, top + (SHAFT_H * 3) / 4, shaftZ);

    // E A PORTA em volta dela: duas ombreiras e uma verga com fecho. Um retângulo preto no ar sem
    // nada em volta lê como um erro de desenho; uma porta lê como uma porta — e é ela que promete
    // que o lance CONTINUA, em vez de acabar no escuro.
    for (const side of [-1, 1]) {
      stone.block({
        x: side * (FLIGHT_W / 2 + JAMB_W / 2),
        y: top + SHAFT_H / 2,
        z: shaftZ,
        w: JAMB_W,
        h: SHAFT_H,
        d: SHAFT_LEN + 0.04,
        uv: [side < 0 ? 2 : 10, BODY[0]],
      });
    }
    stone.block({
      x: 0,
      y: top + SHAFT_H + LINTEL_H / 2,
      z: shaftZ,
      w: FLIGHT_W + 2 * JAMB_W,
      h: LINTEL_H,
      d: SHAFT_LEN + 0.06,
      uv: [1, CROWN[0]],
    });
    stone.block({
      x: 0,
      y: top + SHAFT_H + LINTEL_H + 0.03,
      z: shaftZ,
      w: 0.15,
      h: 0.06,
      d: SHAFT_LEN + 0.08,
      uv: [6, CROWN[2]],
    });
    // OS CANTOS DA BOCA: dois blocos comendo os vértices de cima do vão. É o que sobra de um arco
    // numa alvenaria que não sabe cortar aduela — e é o bastante: um retângulo perfeito lê como
    // recorte, e dois cantos chanfrados leem como PEDRA ASSENTADA. É a mesma economia da
    // montanha, que é cubo e mesmo assim lê como rocha.
    for (const side of [-1, 1]) {
      stone.block({
        x: side * (FLIGHT_W / 2 - 0.055),
        y: top + SHAFT_H - 0.055,
        z: shaftZ,
        w: 0.13,
        h: 0.11,
        d: SHAFT_LEN + 0.03,
        uv: [side < 0 ? 4 : 12, SHADE[1]],
      });
    }

    // UM BLOCO CAÍDO ao pé do lance, do lado de fora da parede — a mesma ideia da peça de cima, e
    // aqui ele também dá escala ao primeiro degrau, que é o menor de todos.
    stone.block({
      x: -(FLIGHT_W / 2 + WALL_W / 2 - 0.01),
      y: 0.028,
      z: FLIGHT_FOOT + 0.11,
      w: 0.075,
      h: 0.055,
      d: 0.09,
      uv: [5, BODY[2]],
    });
  }

  public destroy(): void {
    this.masonry.removeFromParent();
    this.masonry.geometry.dispose();
    (this.masonry.material as THREE.Material).dispose();
    for (const part of this.voids) part.destroy();
    this.voids.length = 0;
    this.contact.destroy();
  }
}
