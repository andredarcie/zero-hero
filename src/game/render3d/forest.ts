// A MATA FORA DA GRADE (pedido do autor, 2026-11-10: "as árvores estão em posições muito rígidas, quadradas... faça
// elas serem muito mais naturais e diversificadas, assim como a floresta real", mantendo a colisão).
//
// O mundo guarda UMA árvore por tile, no centro dele, e isso não muda: a colisão é da grade, o herói anda na grade, o
// `world.json` continua dizendo "pinheiro em (x, z)". O que muda é o DESENHO de cada uma, decidido aqui pela
// coordenada (determinístico: o mesmo tile é sempre a mesma árvore, e nada é sorteado em tempo de jogo):
//
//   · a POSIÇÃO: o pé sai do centro do tile, em pixel de arte inteiro. Dentro da mata, até 5 pixels para cada lado;
//     na BEIRA (um vizinho onde se pisa), no máximo 3 de lado e 2 para trás — o tile que barra continua visivelmente
//     ocupado, que é o que a colisão promete.
//   · a FORMA: o pinheiro de sempre, ou uma das árvores novas do atlas (spritefactory/sprites/forest-trees.mjs: abeto,
//     jovem, mudas, copa redonda, copa larga, pinheiro velho) — e, onde há mata atrás, uma ALTA de dois tiles
//     (gigante, abeto alto, alta de folha). A roupa (fruta, flor, tronco escuro) é a que o bioma já tinha escolhido.
//   · o TOM: cada árvore um pouco mais clara ou mais escura que a vizinha, e o miolo da mata mais fundo que a beira.
//
// Cada BIOMA tem a sua mata (a tabela abaixo): o prado é de árvores de copa redonda (a cerejeira), a geada é de
// abetos, a mata fechada tem as gigantes, as cinzas têm o pinheiro velho de galho aberto. E dentro de cada um a
// mistura não é uniforme: dois ruídos largos fazem MANCHAS — um trecho mais de folha, outro mais de agulha; um trecho
// de árvore nova, outro de árvore velha — como numa mata de verdade, onde as árvores nascem perto das parecidas.
//
// A ALTA só nasce com dois tiles de mata (ou de pedra) logo ao norte dela: ela cobre o que está atrás, e atrás dela
// não pode haver chão onde se pise, um item ou um vizinho.

import { BIOME_IDS, biomeWeightsAt, type BiomeId } from '@/game/world/biomes';

/** O primeiro quadro da família no atlas (forest_tile_set.png, 3 colunas). A ordem é a da spec da arte. */
export const FOREST_FIRST_FRAME = 78;
const ATLAS_COLUMNS = 3;
const SINGLE_SHAPES = ['spruce', 'young', 'saplings', 'round', 'wide', 'old'] as const;
const TALL_SHAPES = ['giant', 'tallSpruce', 'tallRound'] as const;
export type TreeShape = 'classic' | (typeof SINGLE_SHAPES)[number] | (typeof TALL_SHAPES)[number];
const ALL_SHAPES: readonly TreeShape[] = ['classic', ...SINGLE_SHAPES, ...TALL_SHAPES];
/** Todos os quadros da família (para o vento: frame novo de árvore balança). */
export const FOREST_FRAMES: readonly number[] = Array.from({ length: 42 }, (_, i) => FOREST_FIRST_FRAME + i);

/** Os pinheiros do mapa e a ROUPA de cada um: 0 liso, 1 fruta laranja, 2 flor lilás, 3 tronco escuro. */
const PINE_DRESS: Readonly<Record<number, number>> = { 4: 0, 14: 0, 18: 0, 15: 1, 16: 2, 17: 3 };
/** As outras árvores em pé do tileset (a seca, os tocos, as anciãs do jardim): saem do centro, mas não trocam de forma. */
const OTHER_TREES: ReadonlySet<number> = new Set([3, 21, 36, 37, 73, 74]);

/** O que uma árvore do mapa VESTE na tela. */
export interface TreeLook {
  shape: TreeShape;
  /** O quadro do atlas (numa alta, a célula de BAIXO; a de cima é `topFrame`, na mesma coluna). */
  frame: number;
  topFrame: number;
  tall: boolean;
  /** Quanto o pé sai do centro do tile, em tiles (sempre um número inteiro de pixels de arte). */
  dx: number;
  dz: number;
  /** O tom: multiplica a cor do bioma desta árvore. */
  tone: number;
  /** Quanto o quad AFUNDA no chão, em tiles (o sub-bosque: a copa enterrada é uma moita). */
  sink?: number;
  /** A arte espelhada (o sub-bosque: a mesma forma não se repete). */
  flip?: boolean;
}

/** O que a escolha precisa saber do mapa. */
export interface ForestContext {
  /** Há algo em pé neste tile (árvore, pedra, muro)? */
  solid(x: number, z: number): boolean;
  /** O tile fica fora do mundo autorado (a mata sob a névoa negra)? */
  outside(x: number, z: number): boolean;
}

type Weights = Partial<Record<TreeShape, number>>;
/** A MATA DE CADA BIOMA: o peso de cada forma (o que falta vale zero). */
const BIOME_FOREST: Readonly<Record<BiomeId, Weights>> = {
  // as cinzas: o pinheiro velho de galho aberto, ralo
  ash: { old: 40, classic: 26, spruce: 12, young: 10, saplings: 6, tallSpruce: 6 },
  // o prado: a cerejeira é árvore de copa redonda
  meadow: { round: 34, wide: 18, classic: 14, young: 8, saplings: 4, old: 4, spruce: 4, tallRound: 12, giant: 2 },
  // a geada: abetos, estreitos e altos
  stars: { spruce: 34, classic: 20, old: 12, young: 10, saplings: 4, tallSpruce: 16, giant: 4 },
  // a mata fechada: de tudo, e as gigantes
  woods: { classic: 30, spruce: 14, round: 10, wide: 8, old: 8, young: 6, saplings: 2, giant: 14, tallSpruce: 6, tallRound: 4 },
  // o musgo: copas largas e pinheiros velhos, úmido
  moss: { classic: 22, wide: 16, round: 12, old: 12, spruce: 8, young: 6, saplings: 4, giant: 12, tallRound: 6, tallSpruce: 2 },
  // o jardim: a mata cuidada, misturada
  garden: { classic: 30, round: 18, wide: 12, spruce: 10, young: 8, old: 6, saplings: 4, giant: 6, tallRound: 4, tallSpruce: 2 },
  // os campos: o pomar de outono, folha e agulha
  fields: { classic: 26, round: 22, wide: 14, young: 8, old: 8, spruce: 6, saplings: 4, giant: 6, tallRound: 6 },
};
const LEAFY: ReadonlySet<TreeShape> = new Set(['round', 'wide', 'tallRound']);
const NEEDLE: ReadonlySet<TreeShape> = new Set(['spruce', 'old', 'tallSpruce']);
const SMALL: ReadonlySet<TreeShape> = new Set(['young', 'saplings']);
const TALL: ReadonlySet<TreeShape> = new Set(TALL_SHAPES);
/** A mata de fora do mundo fica sob uma cortina de névoa da altura de uma árvore: só o que cabe debaixo dela. */
const UNDER_MIST: ReadonlySet<TreeShape> = new Set(['classic', 'spruce', 'young', 'old']);

/** Um inteiro embaralhado em [0, 1): o mesmo número para o mesmo tile e o mesmo sal. */
const hash = (x: number, z: number, salt: number): number => {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(salt, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Ruído de valor largo (as manchas da mata): `grain` tiles por célula. */
const patch = (x: number, z: number, grain: number, salt: number): number => {
  const fx = x / grain;
  const fz = z / grain;
  const cx = Math.floor(fx);
  const cz = Math.floor(fz);
  const tx = fx - cx;
  const tz = fz - cz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const top = hash(cx, cz, salt) * (1 - sx) + hash(cx + 1, cz, salt) * sx;
  const bottom = hash(cx, cz + 1, salt) * (1 - sx) + hash(cx + 1, cz + 1, salt) * sx;
  return top * (1 - sz) + bottom * sz;
};

const frameOf = (shape: TreeShape, baseFrame: number, dress: number): { frame: number; topFrame: number } => {
  const single = (SINGLE_SHAPES as readonly string[]).indexOf(shape);
  if (single >= 0) {
    const frame = FOREST_FIRST_FRAME + single * 4 + dress;
    return { frame, topFrame: frame };
  }
  const tall = (TALL_SHAPES as readonly string[]).indexOf(shape);
  if (tall >= 0) {
    // As altas têm três roupas (a de tronco escuro veste a lisa), em grupos de duas fileiras: topos, e os pés abaixo.
    const topFrame = FOREST_FIRST_FRAME + SINGLE_SHAPES.length * 4 + tall * 6 + (dress === 3 ? 0 : dress);
    return { frame: topFrame + ATLAS_COLUMNS, topFrame };
  }
  return { frame: baseFrame, topFrame: baseFrame };
};

/** A forma que este pinheiro veste: sorteada (pela coordenada) entre os pesos do bioma, das manchas e do lugar. */
const shapeAt = (x: number, z: number, edge: boolean, canTall: boolean, outside: boolean): TreeShape => {
  const biomes = biomeWeightsAt(x, z);
  const leafy = patch(x, z, 6, 31);
  const young = patch(x, z, 5, 57);
  let total = 0;
  const weights: number[] = [];
  for (const shape of ALL_SHAPES) {
    let w = 0;
    BIOME_IDS.forEach((id, i) => { w += (BIOME_FOREST[id][shape] ?? 0) * biomes[i]; });
    if (TALL.has(shape) && !canTall) w = 0;
    if (outside && !UNDER_MIST.has(shape)) w = 0;
    if (LEAFY.has(shape)) w *= 0.4 + 1.6 * leafy;
    if (NEEDLE.has(shape)) w *= 0.4 + 1.6 * (1 - leafy);
    // A árvore nova nasce na beira da mata e nas manchas de mata nova; a alta, no miolo e nas manchas de mata velha.
    // As MUDAS são a forma mais rala: na beira elas rareiam, senão o vão entre duas mudas promete uma passagem que a
    // colisão (da grade) não dá.
    if (SMALL.has(shape)) w *= (0.3 + 1.8 * young) * (edge ? (shape === 'saplings' ? 0.5 : 1.5) : 0.7);
    if (TALL.has(shape)) w *= 0.4 + 1.5 * (1 - young);
    weights.push(w);
    total += w;
  }
  if (total <= 0) return 'classic';
  let pick = hash(x, z, 7) * total;
  for (let i = 0; i < weights.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return ALL_SHAPES[i];
  }
  return 'classic';
};

/**
 * O desenho da árvore do tile (x, z), ou `null` se o tile em pé não é árvore (o túmulo, a cabeça na estaca: pedra e
 * osso ficam no centro, em fileira, que é como um cemitério é).
 */
export const treeLookAt = (frame: number, x: number, z: number, ctx: ForestContext): TreeLook | null => {
  const dress = PINE_DRESS[frame];
  if (dress === undefined && !OTHER_TREES.has(frame)) return null;
  const edge = !ctx.solid(x - 1, z) || !ctx.solid(x + 1, z) || !ctx.solid(x, z - 1) || !ctx.solid(x, z + 1);
  const outside = ctx.outside(x, z);
  const canTall = !outside && ctx.solid(x, z - 1) && ctx.solid(x, z - 2);
  const shape = dress === undefined ? 'classic' : shapeAt(x, z, edge, canTall, outside);
  // O pé, em pixels de arte: na beira ele fica bem dentro do tile que barra; no miolo anda mais.
  const side = edge ? 3 : 5;
  const back = edge ? 2 : 5;
  const front = edge ? 1 : 4;
  const dx = Math.round((hash(x, z, 101) * 2 - 1) * side) / 16;
  let dz = Math.round(-back + hash(x, z, 211) * (back + front)) / 16;
  // Fora do mundo a cortina de névoa fica no plano do tile: a árvore nunca vem para a frente dela.
  if (outside) dz = Math.min(dz, 0);
  const tone = (0.9 + 0.18 * hash(x, z, 307)) * (edge ? 1 : 0.94) * (0.96 + 0.08 * patch(x, z, 4, 83));
  return { shape, ...frameOf(shape, frame, dress ?? 0), tall: TALL.has(shape), dx, dz, tone };
};

// ── O SUB-BOSQUE (2026-11-11) ──────────────────────────────────────────────────────────────────────────────────────
// Pedido do autor: a mata fechada tinha o chão vazio ("parece que o herói passa"). A primeira resposta plantou o arbusto
// e a samambaia da DECORAÇÃO entre os troncos, e o autor reprovou: "o mato não combinou com as árvores, e ficou muito
// repetido". Combinar SEMPRE quer dizer: a mesma família de desenho, pela mesma malha, com a mesma cor de árvore do
// bioma, a mesma roupa e o tom da árvore do tile. Então o sub-bosque é feito das próprias árvores: as MUDAS e a JOVEM
// em pé, e as copas REDONDA, LARGA e de ABETO afundadas no chão (o chão esconde o tronco; sobra a moita da mesma folha
// da copa ao lado). Cada bioma tem a sua mistura, e cada planta varia o lugar no vão, o quanto afunda, o espelho, a
// roupa e o tom.

type Plant = 'saplings' | 'young' | 'bushRound' | 'bushWide' | 'bushSpruce';
const PLANTS: readonly Plant[] = ['saplings', 'young', 'bushRound', 'bushWide', 'bushSpruce'];
const PLANT_SHAPE: Readonly<Record<Plant, (typeof SINGLE_SHAPES)[number]>> = {
  saplings: 'saplings', young: 'young', bushRound: 'round', bushWide: 'wide', bushSpruce: 'spruce',
};
/** Quanto cada planta afunda, em pixels (de, até): a copa enterrada até o tronco sumir. */
const PLANT_SINK: Readonly<Record<Plant, readonly [number, number]>> = {
  saplings: [0, 1], young: [0, 2], bushRound: [6, 8], bushWide: [7, 9], bushSpruce: [5, 8],
};
/** A mistura de cada bioma (o que falta vale zero): a geada e as cinzas de agulha, o prado e o jardim de copa redonda. */
const BIOME_UNDERSTORY: Readonly<Record<BiomeId, Partial<Record<Plant, number>>>> = {
  ash: { bushSpruce: 40, saplings: 35, young: 15 },
  meadow: { bushRound: 40, bushWide: 20, saplings: 20, young: 20 },
  stars: { bushSpruce: 50, saplings: 30, young: 15 },
  woods: { bushRound: 25, bushWide: 20, bushSpruce: 20, saplings: 20, young: 15 },
  moss: { bushWide: 30, bushRound: 25, saplings: 20, young: 15, bushSpruce: 10 },
  garden: { bushRound: 35, bushWide: 20, saplings: 25, young: 20 },
  fields: { bushRound: 30, bushWide: 25, young: 25, saplings: 20 },
};

/** Uma planta do sub-bosque, sorteada pela coordenada entre os pesos do bioma (sem a que já está no tile). */
const plantAt = (x: number, z: number, salt: number, not?: Plant): Plant => {
  const biomes = biomeWeightsAt(x, z);
  const weights = PLANTS.map((p) => {
    if (p === not) return 0;
    let w = 0;
    BIOME_IDS.forEach((id, i) => { w += (BIOME_UNDERSTORY[id][p] ?? 0) * biomes[i]; });
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = hash(x, z, salt) * total;
  for (let i = 0; i < PLANTS.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return PLANTS[i];
  }
  return 'saplings';
};

/** O que uma planta veste: o quadro (com a roupa), onde fica, quanto afunda, o espelho e o tom. */
const plantLook = (plant: Plant, dress: number, dxPx: number, dzPx: number, x: number, z: number, salt: number, tone: number): TreeLook => {
  const [s0, s1] = PLANT_SINK[plant];
  return {
    shape: PLANT_SHAPE[plant],
    ...frameOf(PLANT_SHAPE[plant], 0, dress),
    tall: false,
    dx: Math.round(dxPx) / 16,
    dz: Math.round(dzPx) / 16,
    tone,
    sink: Math.round(s0 + hash(x, z, salt + 1) * (s1 - s0)) / 16,
    flip: hash(x, z, salt + 2) < 0.5,
  };
};

// ── NOS VÃOS, NUNCA COLADO (2026-11-11, o autor: "evite ficar colando uma árvore na outra, um arbusto, vários colados
// nas árvores, porque fica feio") ─────────────────────────────────────────────────────────────────────────────────────
// A segunda versão punha as plantas no tile de cada árvore, a poucos pixels do tronco: a moita nascia grudada na árvore,
// e a muda era uma árvore encostada noutra. Agora cada planta nasce num VÃO — no canto onde quatro tiles de mata se
// encontram, ou no meio da divisa entre duas árvores lado a lado (é o vão que as faixas finas de mata têm) — e só se
// achar, em volta dele, um ponto com FOLGA (TRUNK_ROOM) de todo tronco e (PLANT_ROOM) de toda outra planta: senão ela
// não nasce. Um vão é sempre entre tiles de mata, então nada nasce no chão onde se pisa.

/**
 * A FOLGA, em tiles, como a tela a vê: a câmera olha de cima a 45°, então o que gruda é o LADO — meio tile de fundo
 * encolhe e põe a moita encostada no tronco de trás (ou tapando o pé do da frente). A folga é uma elipse: larga de
 * lado, funda de fundo. Do tronco, seis pixels de lado; de outra planta, onze (a copa afundada tem uns doze de largura).
 */
export interface Room { x: number; z: number }
export const TRUNK_ROOM: Room = { x: 6 / 16, z: 12 / 16 };
export const PLANT_ROOM: Room = { x: 11 / 16, z: 14 / 16 };
/** Se a distância (dx, dz) já está fora da folga. */
export const roomy = (dx: number, dz: number, room: Room): boolean => (dx / room.x) ** 2 + (dz / room.z) ** 2 >= 1;
/** As posições que um vão tenta, em pixels, até achar folga: o ponto, e em volta dele cada vez mais longe. */
const NUDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [3, 2], [-3, 2], [3, -2], [-3, -2], [4, 0], [-4, 0], [0, 4], [0, -4],
];
/**
 * A mata de fora do mapa ganha plantas até aqui da borda do mundo, e capim só até FOREST_GRASS_REACH (o que se vê antes
 * da névoa negra fechar): uma faixa larga de capim por baixo da névoa é custo sem nada na tela.
 */
export const FOREST_FLOOR_REACH = 4;
export const FOREST_GRASS_REACH = 2;
/** Quantos dos vãos ganham planta: o canto entre quatro árvores, e o meio da divisa entre duas. */
const UNDER_KEEP_CORNER = 0.9;
const UNDER_KEEP_SIDE = 0.75;

/** Uma planta do sub-bosque já no mundo: o tile que a hospeda (a cor e o chão dela) e o que ela veste. */
export interface UnderstoryPlant { x: number; z: number; look: TreeLook }

/** Um vão: o ponto em meios-tiles (x2, z2), a chance de ganhar planta e os tiles de mata que ele exige. */
interface Gap { x2: number; z2: number; keep: number; tiles: ReadonlyArray<readonly [number, number]> }
/** Um tronco da mata: onde o pé dele está, e o desenho da árvore (a roupa e o tom que a planta ao lado herda). */
interface Foot { fx: number; fz: number; frame: number; look: TreeLook }

/**
 * O SUB-BOSQUE da mata: as plantas nos vãos entre as árvores (`trees`: cada tile de árvore com o desenho dele). `solid`
 * diz onde há MATA — a árvore da família ou a clareira da mata de fora, nunca o penhasco, a alvenaria ou a lápide, que
 * também barram (o chamador cuida disso): um canto só vale cercado dela pelos quatro lados, e o meio de uma divisa,
 * pelos dois; e a planta só fica num desses tiles. `clearings`: os tiles de mata sem árvore (as clareiras da mata de fora), cujo meio é o vão maior.
 * O meio da divisa de frente e de trás não é vão: na tela ele cai em cima do tronco. Determinístico.
 */
export const forestUnderstory = (
  trees: ReadonlyArray<{ x: number; z: number; frame: number; look: TreeLook }>,
  solid: (x: number, z: number) => boolean,
  clearings: ReadonlyArray<{ x: number; z: number }> = [],
): UnderstoryPlant[] => {
  const key = (x: number, z: number): number => (x + 4096) * 8192 + (z + 4096);
  const byTile = new Map<number, Foot>();
  for (const t of trees) byTile.set(key(t.x, t.z), { fx: t.x + t.look.dx, fz: t.z + t.look.dz, frame: t.frame, look: t.look });
  // os vãos, cada um uma vez: o meio das clareiras, e de cada árvore os quatro cantos e o meio da divisa da direita (a
  // da esquerda é a da vizinha)
  const gaps: Gap[] = [];
  const seen = new Set<number>();
  const add = (g: Gap): void => {
    if (seen.has(key(g.x2, g.z2))) return;
    seen.add(key(g.x2, g.z2));
    gaps.push(g);
  };
  for (const c of clearings) add({ x2: 2 * c.x, z2: 2 * c.z, keep: 1, tiles: [[c.x, c.z]] });
  for (const { x, z } of trees) {
    for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const tiles = [[x + ox - 1, z + oz - 1], [x + ox, z + oz - 1], [x + ox - 1, z + oz], [x + ox, z + oz]] as const;
      add({ x2: 2 * (x + ox) - 1, z2: 2 * (z + oz) - 1, keep: UNDER_KEEP_CORNER, tiles });
    }
    add({ x2: 2 * x + 1, z2: 2 * z, keep: UNDER_KEEP_SIDE, tiles: [[x, z], [x + 1, z]] });
  }
  const out: UnderstoryPlant[] = [];
  const placed = new Map<number, Array<readonly [number, number]>>(); // tile → as plantas já postas nele
  for (const g of gaps) {
    if (!g.tiles.every(([a, b]) => solid(a, b)) || hash(g.x2, g.z2, 601) > g.keep) continue;
    const ax = g.x2 / 2;
    const az = g.z2 / 2;
    // os troncos em volta (até dois tiles)
    const feet: Foot[] = [];
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const foot = byTile.get(key(Math.round(ax) + dx, Math.round(az) + dz));
        if (foot) feet.push(foot);
      }
    }
    if (feet.length === 0) continue;
    // o ponto do vão, com um pixel de acaso, e as tentativas em volta dele (a ordem gira pelo hash: nenhum lado é o de sempre)
    const bx = Math.round(ax * 16 + (hash(g.x2, g.z2, 602) * 2 - 1));
    const bz = Math.round(az * 16 + (hash(g.x2, g.z2, 603) * 2 - 1));
    const turn = Math.floor(hash(g.x2, g.z2, 604) * (NUDGES.length - 1));
    let spot: { px: number; pz: number; hx: number; hz: number } | null = null;
    for (let i = 0; i < NUDGES.length && !spot; i++) {
      const [nx, nz] = NUDGES[i === 0 ? 0 : 1 + ((i - 1 + turn) % (NUDGES.length - 1))];
      const px = (bx + nx) / 16;
      const pz = (bz + nz) / 16;
      const hx = Math.round(px);
      const hz = Math.round(pz);
      // num dos tiles de mata do vão, com folga de todo tronco e de toda planta já posta
      if (!g.tiles.some(([a, b]) => a === hx && b === hz)) continue;
      if (!feet.every((f) => roomy(px - f.fx, pz - f.fz, TRUNK_ROOM))) continue;
      let crowded = false;
      for (let dz = -1; dz <= 1 && !crowded; dz++) {
        for (let dx = -1; dx <= 1 && !crowded; dx++) {
          crowded = (placed.get(key(hx + dx, hz + dz)) ?? []).some(([qx, qz]) => !roomy(px - qx, pz - qz, PLANT_ROOM));
        }
      }
      if (!crowded) spot = { px, pz, hx, hz };
    }
    if (!spot) continue;
    const { px, pz, hx, hz } = spot;
    placed.set(key(hx, hz), [...(placed.get(key(hx, hz)) ?? []), [px, pz]]);
    // a forma do bioma do lugar; a roupa às vezes e o tom (um pouco mais escuro) da árvore mais perto
    const near = feet.reduce((a, f) => (Math.hypot(px - f.fx, pz - f.fz) < Math.hypot(px - a.fx, pz - a.fz) ? f : a));
    const plant = plantAt(g.x2, g.z2, 611);
    const dress = hash(g.x2, g.z2, 612) < 0.25 ? PINE_DRESS[near.frame] ?? 0 : 0;
    const tone = near.look.tone * (0.82 + 0.12 * hash(g.x2, g.z2, 613));
    out.push({ x: hx, z: hz, look: plantLook(plant, dress, (px - hx) * 16, (pz - hz) * 16, g.x2, g.z2, 620, tone) });
  }
  return out;
};

/** O capim baixo e o mato alto do mapa (os quadros de fio, grassBlades.BLADE_FRAMES). */
export const FOREST_SHORT_GRASS: readonly number[] = [0, 7, 8];
export const FOREST_TALL_GRASS: readonly number[] = [19, 20];
/**
 * A chance de cada tufo (o capim baixo, o mato alto, um segundo capim baixo de outro desenho). ABERTO: o tile da frente
 * (o do sul) não é mata, e o chão aparece; COBERTO: há mata na frente, e a copa dela tapa o chão (a câmera olha de cima
 * a 45°: uma árvore cobre o tile de trás inteiro) — ali só o que aparece pelos buracos da copa; DE FORA: a mata além da
 * borda, só capim, ralo. O tufo parado tem a altura do desenho (o pisável cresce no shader): é mais baixo, então vem
 * em maior número.
 */
const GRASS_CHANCE = { open: [0.9, 0.65, 0.5], covered: [0.5, 0.4, 0], outside: [0.35, 0, 0] } as const;

/**
 * O CHÃO DA MATA: o capim e o mato alto do próprio mapa (o mesmo do vale inteiro, e o mato alto é o que já barra a
 * passagem), até TRÊS tufos por tile — o capim baixo, o mato alto e outro capim baixo, cada um com a sua chance
 * (GRASS_CHANCE: muito onde o chão aparece, menos atrás das copas), nunca o mesmo desenho duas vezes no tile. Os tufos
 * do tile caem no mesmo espalhamento; os riscos de cada desenho ficam em colunas diferentes, então somados engrossam o
 * tufo. Nada passa do quadro do tile de mata.
 *
 * É PEÇA PARADA (`still`, 2026-11-11, o autor: "o capim no meio das árvores pode não ter a física nem o vento realista,
 * economizando, e não precisa ser individual"): o desenho inteiro num quad só, sem vento, sem pisão, sem margem de
 * balanço. Fio a fio, com física, ele pôs 7,7 a 14 mil fios (o vale inteiro tem 8 mil) e até meio milissegundo de GPU
 * num lugar em que ninguém pisa e que as copas quase tapam. Pega a sombra da mata do chão como toda a decoração.
 */
export const forestGrass = (
  tiles: ReadonlyArray<{ x: number; z: number }>,
  solid: (x: number, z: number) => boolean,
  outside: (x: number, z: number) => boolean = () => false,
): Array<{ x: number; z: number; frame: number; still: true }> => {
  const out: Array<{ x: number; z: number; frame: number; still: true }> = [];
  for (const { x, z } of tiles) {
    const [short, tall, short2] = GRASS_CHANCE[outside(x, z) ? 'outside' : solid(x, z + 1) ? 'covered' : 'open'];
    const pick = (list: readonly number[], salt: number): number => list[Math.floor(hash(x, z, salt) * list.length) % list.length];
    const first = pick(FOREST_SHORT_GRASS, 703);
    if (hash(x, z, 701) < short) out.push({ x, z, frame: first, still: true });
    if (hash(x, z, 702) < tall) out.push({ x, z, frame: pick(FOREST_TALL_GRASS, 704), still: true });
    if (hash(x, z, 705) < short2) out.push({ x, z, frame: pick(FOREST_SHORT_GRASS.filter((f) => f !== first), 706), still: true });
  }
  return out;
};
