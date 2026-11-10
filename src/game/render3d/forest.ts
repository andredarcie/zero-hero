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
