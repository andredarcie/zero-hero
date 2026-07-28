import { CHUNK_COLUMNS, CHUNK_ROWS, SEA_TILE_FRAME } from '@/game/constants';
import type { ChunkData } from '@/game/world/Chunk';
import type { NpcKind, ScreenContent } from '@/game/world/ScreenContent';
import type { WorldProp } from '@/game/world/worldSchema';

/**
 * O MUNDO INFINITO — terreno, props e spawns gerados a partir de uma semente, chunk a chunk,
 * enquanto o heroi anda.
 *
 * Este arquivo e o unico lugar do jogo que INVENTA mundo. Tudo o resto (a aventura, os levels)
 * le um arquivo autorado, e isso continua verdade: o gerador entra pelo mesmo buraco de fechadura
 * que o world.json usa (WorldData.setInfiniteWorld), entao ChunkManager, os managers de entidade
 * e o World3D leem daqui sem saber que mudou alguma coisa.
 *
 * As tres regras que moldaram o gerador:
 *
 * 1. **Determinismo por coordenada, nunca por ordem de visita.** O que existe em (x, y) e uma
 *    funcao de (semente, x, y) e de mais nada. Sem isso, sair de um chunk e voltar reconstruiria
 *    uma floresta diferente — e o mundo deixaria de ser um LUGAR.
 * 2. **A geografia e feita de TILES, nao de props.** Arvore, mato e lago sao frames do tileset,
 *    que o World3D funde num punhado de meshes; um lago de props seria um objeto por tile e um
 *    custo por frame para sempre. Props sao caros e raros de proposito — so o que o jogador
 *    manipula (fogueira, arvore seca, pedra, portal) merece ser um.
 * 3. **O acampamento e uma clareira, nao um chunk.** Ele e definido por DISTANCIA ao centro do
 *    mundo, o que o deixa atravessar fronteiras de chunk sem costura e sem nenhum caso especial
 *    no gerador: cada tile so pergunta "quao longe de casa eu estou?".
 */

// ── o acampamento ─────────────────────────────────────────────────────────────
//
// Fica na origem do mundo, e nao num canto: o mundo cresce para os quatro lados, entao a casa
// tem que estar no meio dele. As coordenadas sao positivas por habito de leitura (o resto do
// jogo autora mundos em 0..N), mas nada aqui depende disso — o heroi pode andar para -400.

/** Centro do acampamento, em tiles — e o lugar da fogueira. */
export const CAMP_X = 6;
export const CAMP_Y = 6;
/**
 * Onde o heroi nasce: na DIAGONAL da fogueira, nunca no eixo dela.
 *
 * Isso nao e estetica. A fogueira e solida, e esbarrar numa fogueira ACESA abre a loja — entao
 * um heroi nascido ao sul dela abriria a loja no primeiro passo ao norte, toda expedicao. Na
 * diagonal, os quatro rumos saem limpos e a fogueira continua a dois passos de deliberacao.
 *
 * O desvio lateral e de exatamente CAMP_GATE_HALF: fora do eixo da fogueira, mas ainda DENTRO
 * do corredor norte-sul, entao andar em linha reta a partir do nascimento sai do acampamento.
 */
export const CAMP_SPAWN_X = CAMP_X + 2;
export const CAMP_SPAWN_Y = CAMP_Y + 3;
/** Raio da clareira: dentro disto nao nasce arvore nenhuma e nada e sorteado. */
const CAMP_CLEARING = 8.5;
/** A paliçada: o anel de mata fechada que faz o acampamento ter uma BORDA e quatro portoes. */
const CAMP_WALL_OUTER = 11.5;
/**
 * Meia-largura dos portoes cardeais, em tiles (2 → corredores de 5 tiles).
 *
 * Largos o bastante para serem SAIDAS e nao agulhas: o jogador tem que poder andar para o norte
 * e sair, sem procurar a fresta. E a mesma largura que define a zona proibida dos props de
 * casa — nada de solido nasce onde alguem vai passar.
 */
const CAMP_GATE_HALF = 2;
/**
 * Ate aqui o mundo ainda e "quintal": sem lago, sem mata fechada, sem prop hostil. Existe para
 * que os primeiros passos para fora sejam claramente uma ESCOLHA e nao um susto.
 */
const CAMP_CALM_RADIUS = 20;

// ── frames do tileset (forest_tile_set.png) ───────────────────────────────────
const GROUND_FRAME = 5;                      // a terra: o mundo autorado inteiro e feito dela
const DECOR_FRAMES = [0, 6, 7, 8, 10, 11] as const; // grama baixa, pedrinhas, flores
const TREE_FRAMES = [4, 14, 15, 16, 17] as const;   // pinheiros (o machado de aco derruba)

// ── ruido ─────────────────────────────────────────────────────────────────────

/** Hash inteiro estavel (o mesmo de scripts/worldgen/terrainGen.ts). */
const hash = (a: number, b: number, c: number, d: number): number => {
  let v = (((a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ (d * 48397741)) >>> 0);
  v = (((v >> 16) ^ v) * 0x45d9f3b) >>> 0;
  v = (((v >> 16) ^ v) * 0x45d9f3b) >>> 0;
  return ((v >> 16) ^ v) >>> 0;
};

/**
 * 0..1 a partir de quatro inteiros.
 *
 * O divisor e 2^31 e nao 2^32, e isso NAO e um detalhe: o ultimo passo do mix e `(v >> 16) ^ v`,
 * e em JavaScript `>>` opera em int32 com sinal — o resultado nunca acende o bit 31. O hash
 * portanto so devolve [0, 2^31), e dividir por 0xffffffff daria um "ruido" que jamais passa de
 * 0.5. Todo limiar acima disso seria terra que nunca acontece: com o divisor errado este mundo
 * nasceu sem uma unica arvore de floresta e sem um unico lago, e a censura do gerador foi como
 * isso apareceu. O hash fica como esta (ele e o mesmo do gerador que ja escreveu o world.json,
 * onde so se usa `% 100` e a faixa e irrelevante); quem se corrige e a conversao.
 */
const rand01 = (a: number, b: number, c: number, d: number): number => hash(a, b, c, d) / 0x7fffffff;

/**
 * Ruido de valor com interpolacao suave sobre uma grade grossa. Sorteio tile a tile faz
 * CHUVISCO — arvores isoladas espalhadas por igual, que e a textura que denuncia terreno
 * gerado. O que faz uma floresta parecer floresta e a densidade variar devagar; e isso que
 * este ruido da, e e por isso que o gerador consulta sempre ele e nunca o hash cru.
 */
const valueNoise = (x: number, y: number, cell: number, seed: number, salt: number): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx); // smoothstep: sem isto a grade da grade aparece
  const sy = fy * fy * (3 - 2 * fy);
  const c00 = rand01(gx, gy, seed, salt);
  const c10 = rand01(gx + 1, gy, seed, salt);
  const c01 = rand01(gx, gy + 1, seed, salt);
  const c11 = rand01(gx + 1, gy + 1, seed, salt);
  return (c00 * (1 - sx) + c10 * sx) * (1 - sy) + (c01 * (1 - sx) + c11 * sx) * sy;
};

// ── geografia ─────────────────────────────────────────────────────────────────

export const distanceFromCamp = (worldX: number, worldY: number): number =>
  Math.hypot(worldX - CAMP_X, worldY - CAMP_Y);

/**
 * A paliçada do acampamento, com quatro portoes cardeais. Sem ela a clareira nao teria BORDA:
 * o jogador precisa ver o mundo aleatorio comecar em algum lugar, e atravessar um portao e a
 * frase mais curta possivel para "estou saindo".
 */
const isCampWall = (worldX: number, worldY: number): boolean => {
  const dx = worldX - CAMP_X;
  const dy = worldY - CAMP_Y;
  const d = Math.hypot(dx, dy);
  if (d <= CAMP_CLEARING || d > CAMP_WALL_OUTER) return false;
  const gate = Math.abs(dx) <= CAMP_GATE_HALF || Math.abs(dy) <= CAMP_GATE_HALF;
  return !gate;
};

/**
 * Lagos: agua parada, feita de tile de MAR — e nao de props `water`.
 *
 * A escolha nao e por preguica. O mar bloqueia por SOLID_GROUND_FRAMES, que e incondicional:
 * ele barra ate as botas de lava, e nenhum item do jogo tira agua do lugar. Num mundo gerado
 * isso e exatamente o que se quer, porque o gerador nao tem como garantir que um rio tenha
 * margem, ponte ou saida — e um lago que o jogador pudesse abrir seria um lago que ele
 * atravessaria por cima da geografia toda. Aqui o lago e um FATO: contorne.
 */
const isLake = (worldX: number, worldY: number, seed: number): boolean => {
  if (distanceFromCamp(worldX, worldY) < CAMP_CALM_RADIUS) return false;
  return valueNoise(worldX, worldY, 11, seed, LAKE_SALT) > LAKE_THRESHOLD;
};

/**
 * Densidade de mata em (x, y): 0 = clareira, 1 = parede de pinheiros. Duas oitavas — uma larga
 * (onde ficam os bosques) e uma curta (o recorte da borda deles) — e um termo de distancia, que
 * e o que faz o mundo FECHAR conforme o heroi se afasta de casa. O escuro fica mais apertado
 * longe: e a mesma curva do risco.
 */
const forestDensity = (worldX: number, worldY: number, seed: number): number => {
  const broad = valueNoise(worldX, worldY, 17, seed, 0x2b);
  const fine = valueNoise(worldX, worldY, 5, seed, 0x3c);
  const dist = distanceFromCamp(worldX, worldY);
  const depth = Math.min(1, Math.max(0, (dist - CAMP_CALM_RADIUS) / 140));
  return broad * 0.7 + fine * 0.3 + depth * 0.16;
};

/**
 * Os dois limiares, medidos e nao chutados (censo em tres sementes, anel de 260 tiles):
 * pinheiro em ~23% dos tiles e lago em ~7%, com a mata subindo de ~8% perto de casa para ~26%
 * no fundo. Sao os numeros que fazem o mundo ABRIR na saida do acampamento e FECHAR conforme o
 * heroi se afasta — a geografia dizendo a mesma coisa que o multiplicador de moedas.
 */
const LAKE_THRESHOLD = 0.82;
const LAKE_SALT = 0x1a;
const FOREST_THRESHOLD = 0.68;

// ── terreno ───────────────────────────────────────────────────────────────────

const buildChunk = (cx: number, cy: number, seed: number): ChunkData => {
  const ground: number[][] = [];
  const upper: (number | null)[][] = [];
  const collisions: boolean[][] = [];

  for (let ly = 0; ly < CHUNK_ROWS; ly++) {
    ground[ly] = [];
    upper[ly] = [];
    collisions[ly] = [];
    for (let lx = 0; lx < CHUNK_COLUMNS; lx++) {
      const wx = cx * CHUNK_COLUMNS + lx;
      const wy = cy * CHUNK_ROWS + ly;
      ground[ly][lx] = GROUND_FRAME;
      upper[ly][lx] = null;
      // Colisao pintada fica sempre falsa: quem bloqueia aqui e o FRAME (pinheiro em cima, mar
      // embaixo), pelas regras implicitas de SOLID_UPPER_FRAMES/SOLID_GROUND_FRAMES. Assim o
      // machado de aco, que limpa o frame, limpa junto a passagem — sem uma parede invisivel
      // sobrando (a armadilha que fellTreeTile documenta).
      collisions[ly][lx] = false;

      const dist = distanceFromCamp(wx, wy);

      if (dist <= CAMP_CLEARING) {
        // A clareira de casa: chao limpo, com um punhado de grama que o fogo nem toca.
        const r = hash(wx, wy, seed, 0x51);
        if (r % 100 < 16) upper[ly][lx] = DECOR_FRAMES[(r >> 6) % DECOR_FRAMES.length];
        continue;
      }

      if (isCampWall(wx, wy)) {
        upper[ly][lx] = TREE_FRAMES[hash(wx, wy, seed, 0x62) % TREE_FRAMES.length];
        continue;
      }

      if (isLake(wx, wy, seed)) {
        ground[ly][lx] = SEA_TILE_FRAME;
        continue;
      }

      const density = forestDensity(wx, wy, seed);
      const r = hash(wx, wy, seed, 0x73);
      if (density > FOREST_THRESHOLD && r % 100 < 62) {
        upper[ly][lx] = TREE_FRAMES[(r >> 7) % TREE_FRAMES.length];
      } else if (r % 100 < 26) {
        upper[ly][lx] = DECOR_FRAMES[(r >> 9) % DECOR_FRAMES.length];
      }
    }
  }

  return { cx, cy, ground, upper, collisions };
};

// ── props ─────────────────────────────────────────────────────────────────────
//
// Um prop e um objeto vivo: sprite, sombra, colisao propria e uma linha de codigo rodando por
// frame. O mundo autorado inteiro tem 69 deles. Um mundo infinito que espalhasse props como
// espalha arvore acumularia milhares — e como a busca "tem prop neste tile?" e linear e roda
// dentro do flood-fill dos inimigos, isso viraria o gargalo do modo. Por isso o gerador so
// planta o que o jogador MEXE, com a mao fechada.

/** Chance por chunk de nascer uma fogueira apagada (a ilha de seguranca do escuro). */
const CAMPFIRE_CHANCE = 22;
/** Chance por chunk de nascer um portal de volta — a saida com 50%. */
const PORTAL_CHANCE = 30;
/** A partir de quantos tiles do acampamento um portal pode existir. */
const PORTAL_MIN_DIST = 26;

/** O tile aberto mais proximo de (x, y) dentro do chunk — um prop nunca nasce dentro de arvore. */
const openTileNear = (
  chunk: ChunkData,
  cx: number,
  cy: number,
  lx: number,
  ly: number,
): { worldX: number; worldY: number } | null => {
  for (let radius = 0; radius < 6; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const tx = lx + dx;
        const ty = ly + dy;
        if (tx < 0 || ty < 0 || tx >= CHUNK_COLUMNS || ty >= CHUNK_ROWS) continue;
        if (chunk.upper[ty][tx] !== null && chunk.upper[ty][tx]! >= 3) continue; // arvore de pe
        if (chunk.ground[ty][tx] === SEA_TILE_FRAME) continue;
        if (chunk.collisions[ty][tx]) continue;
        return { worldX: cx * CHUNK_COLUMNS + tx, worldY: cy * CHUNK_ROWS + ty };
      }
    }
  }
  return null;
};

/**
 * Os props do acampamento: a fogueira acesa, os moradores e a lenha de casa.
 *
 * Autorados a mao, e nao sorteados, porque o acampamento e a unica parte deste mundo que o
 * jogador tem que reconhecer. Ele volta aqui toda expedicao; se a casa mudasse de forma a cada
 * volta, voltar nao seria voltar.
 *
 * A fogueira e uma so, e no centro: e ela que cura (HEALTH_REGEN_MS), que repele as caveiras e
 * que ABRE A LOJA quando o heroi esbarra nela — o bonfire de Souls que o jogo ja tinha e que,
 * ate agora, nao tinha uma unica moeda para gastar.
 */
const campProps = (): WorldProp[] => [
  { type: 'campfire', worldX: CAMP_X, worldY: CAMP_Y, lit: true },
  // Tudo o que BLOQUEIA mora fora dos quatro corredores (|dx| e |dy| ambos > CAMP_GATE_HALF),
  // ou o acampamento teria uma porta trancada por uma pedra.
  { type: 'dryTree', worldX: CAMP_X - 5, worldY: CAMP_Y + 3 },
  { type: 'dryTree', worldX: CAMP_X + 5, worldY: CAMP_Y - 3 },
  { type: 'rock', worldX: CAMP_X + 3, worldY: CAMP_Y - 5 },
  { type: 'tallGrass', worldX: CAMP_X - 4, worldY: CAMP_Y - 3 },
  { type: 'tallGrass', worldX: CAMP_X - 3, worldY: CAMP_Y - 4 },
];

/** Um chunk toca o acampamento? (Entao ele carrega os props autorados de casa.) */
const isCampChunk = (cx: number, cy: number): boolean => cx === 0 && cy === 0;

/**
 * O KIT: as tres ferramentas largadas no chao do acampamento, de novo a cada expedicao.
 *
 * O heroi tem UMA mao — entao isto nao e um inventario, e uma escolha, e ela e a primeira
 * decisao de risco do modo, tomada antes do primeiro passo:
 *
 *   • **espada** — mata a caveira num golpe. Combate, e nada mais.
 *   • **machado** — corta a arvore seca, que da graveto, que aceso vira TOCHA (luz no escuro,
 *     e tambem um golpe unico). Luz e uma arma indireta: as caveiras nao nascem na luz.
 *   • **picareta** — quebra pedra, que da pedra e ferro. E a ferramenta que produz MATERIA, e
 *     a unica que nao ajuda numa briga.
 *
 * Elas voltam ao chao toda vez que o acampamento e reconstruido (ver ExplorerDirector), porque
 * uma expedicao que termina em morte leva junto o que o heroi carregava: se o kit nao se
 * refizesse, uma morte azarada deixaria o jogador de maos vazias para sempre.
 */
export const campKit = (): Array<{ type: 'sword' | 'axe' | 'pickaxe'; worldX: number; worldY: number }> => [
  { type: 'sword', worldX: CAMP_X - 2, worldY: CAMP_Y + 5 },
  { type: 'axe', worldX: CAMP_X, worldY: CAMP_Y + 5 },
  { type: 'pickaxe', worldX: CAMP_X + 2, worldY: CAMP_Y + 5 },
];

const buildProps = (cx: number, cy: number, seed: number, chunk: ChunkData): WorldProp[] => {
  const props: WorldProp[] = [];
  if (isCampChunk(cx, cy)) props.push(...campProps());

  const centerX = cx * CHUNK_COLUMNS + CHUNK_COLUMNS / 2;
  const centerY = cy * CHUNK_ROWS + CHUNK_ROWS / 2;
  const chunkDist = distanceFromCamp(centerX, centerY);
  if (chunkDist < CAMP_WALL_OUTER + 4) return props; // o quintal de casa fica limpo

  const place = (salt: number, type: WorldProp['type'], extra?: Partial<WorldProp>): void => {
    const r = hash(cx, cy, seed, salt);
    const spot = openTileNear(chunk, cx, cy, r % CHUNK_COLUMNS, (r >> 8) % CHUNK_ROWS);
    if (!spot) return;
    if (props.some((p) => p.worldX === spot.worldX && p.worldY === spot.worldY)) return;
    props.push({ type, ...spot, ...extra });
  };

  // A fogueira APAGADA e o prop mais importante do mundo aleatorio: acender uma e comprar um
  // pedaco de seguranca no escuro — as caveiras nao entram na luz, a vida volta sozinha ali, e
  // a loja abre. Ela nao nasce acesa; o heroi tem que trazer fogo ate ela.
  if (hash(cx, cy, seed, 0x81) % 100 < CAMPFIRE_CHANCE) place(0x82, 'campfire');

  // Lenha e pedra: o que o machado e a picareta existem para pegar. Sem eles o mundo longe de
  // casa seria so caveira — e a tocha, que e a unica luz portatil, ficaria sem combustivel.
  const r = hash(cx, cy, seed, 0x91);
  if (r % 100 < 55) place(0x92, 'dryTree');
  if ((r >> 7) % 100 < 34) place(0x93, 'dryTree');
  if ((r >> 14) % 100 < 40) place(0x94, 'rock');
  if ((r >> 21) % 100 < 14) place(0x95, 'ironRock');
  if ((r >> 3) % 100 < 30) place(0x96, 'tallGrass');
  if ((r >> 11) % 100 < 22) place(0x97, 'dryBush');

  // O PORTAL: a pergunta "quer voltar?" plantada no meio do escuro. Ele nunca nasce perto de
  // casa — perto de casa a resposta seria obvia e a pergunta nao valeria nada.
  if (chunkDist >= PORTAL_MIN_DIST && hash(cx, cy, seed, 0xa1) % 100 < PORTAL_CHANCE) {
    place(0xa2, 'levelPortal');
  }

  return props;
};

// ── spawns transmitidos por chunk (coracoes, moradores) ───────────────────────

const NPC_KINDS: readonly NpcKind[] = ['wizard', 'salesman', 'painter', 'poet', 'blackCat'];

const buildContent = (cx: number, cy: number, seed: number, chunk: ChunkData): ScreenContent => {
  const content: ScreenContent = { enemies: [], pickups: [], npcs: [] };

  // As caveiras nao moram no mundo: elas sao invocadas em volta do heroi pelo
  // UndeadSpawnDirector enquanto ele demora no escuro. O gerador nao planta nenhuma.

  if (isCampChunk(cx, cy)) {
    // Os moradores. Ficam no acampamento e em nenhum outro lugar: um NPC no meio do nada
    // seria uma conversa sem casa, e o acampamento existe justamente para ser o lugar onde ha
    // alguem. As falas vem do catalogo de sempre (world.json + locales).
    // Fora dos corredores, como todo corpo solido do acampamento (ver campProps).
    const around: ReadonlyArray<readonly [number, number]> = [
      [-4, -4], [4, -4], [-4, 4], [4, 4], [-6, 3],
    ];
    NPC_KINDS.forEach((type, i) => {
      const [dx, dy] = around[i];
      content.npcs.push({ type, worldX: CAMP_X + dx, worldY: CAMP_Y + dy });
    });
    return content;
  }

  // Um coracao de vez em quando la fora — a unica cura longe da fogueira, e portanto a razao
  // de valer a pena desviar do caminho.
  const centerX = cx * CHUNK_COLUMNS + CHUNK_COLUMNS / 2;
  const centerY = cy * CHUNK_ROWS + CHUNK_ROWS / 2;
  if (distanceFromCamp(centerX, centerY) > CAMP_WALL_OUTER + 4
    && hash(cx, cy, seed, 0xb1) % 100 < 34) {
    const r = hash(cx, cy, seed, 0xb2);
    const spot = openTileNear(chunk, cx, cy, r % CHUNK_COLUMNS, (r >> 8) % CHUNK_ROWS);
    if (spot) content.pickups.push({ type: 'heart', worldX: spot.worldX, worldY: spot.worldY });
  }

  return content;
};

// ── a fachada com memoria ─────────────────────────────────────────────────────

/**
 * O gerador visto de fora. Memoriza tudo o que entrega, e essa memoria e obrigatoria e nao uma
 * otimizacao: o runtime EDITA o terreno no lugar (derrubar um pinheiro limpa `upper` e
 * `collisions` do chunk), entao entregar um objeto novo a cada consulta faria a floresta se
 * reerguer atras do heroi.
 */
export class ExplorerWorldSource {
  private readonly chunks = new Map<string, ChunkData>();
  private readonly props = new Map<string, WorldProp[]>();
  private readonly content = new Map<string, ScreenContent>();

  public constructor(public readonly seed: number) {}

  public chunk(cx: number, cy: number): ChunkData {
    const key = `${cx},${cy}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = buildChunk(cx, cy, this.seed);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  public chunkProps(cx: number, cy: number): WorldProp[] {
    const key = `${cx},${cy}`;
    let props = this.props.get(key);
    if (!props) {
      props = buildProps(cx, cy, this.seed, this.chunk(cx, cy));
      this.props.set(key, props);
    }
    return props;
  }

  public chunkContent(cx: number, cy: number): ScreenContent {
    const key = `${cx},${cy}`;
    let content = this.content.get(key);
    if (!content) {
      content = buildContent(cx, cy, this.seed, this.chunk(cx, cy));
      this.content.set(key, content);
    }
    return content;
  }
}
