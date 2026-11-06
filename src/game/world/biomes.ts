// OS BIOMAS DO VALE (pedido do autor: "cada parte do mapa reconhecível na hora").
//
// 90% do chão do mundo é o mesmo tile de grama e a decoração estava espalhada igual por todo canto, então
// longe das casas nenhum lugar tinha cara própria. Cada vizinho mora num canto e cada um tem um tema; o
// bioma é esse tema virando lugar:
//
//   ash     o noroeste da lava: terra queimada, pedregulho, árvore morta, nada florido
//   meadow  a Iris, a pintora: o prado de flores, a grama quente
//   stars   a Vega e o planalto do telescópio: campo alto e frio, pedra e flor roxa
//   woods   o Bram, o lenhador (e o leste): mata fechada, verde fundo
//   moss    a Hollis e os cogumelos: o bosque úmido, verde azulado de musgo
//   garden  o jardim da fogueira do fim, no centro: a grama cuidada, neutra
//   fields  o sul, onde a aventura chega: campo de palha dourada
//
// NADA DISTO É DADO DO MUNDO. O `world.json` continua guardando o mesmo chão e a mesma decoração (a lei
// do CLAUDE.md: script não reescreve `ground` nem o que o autor pôs). O bioma é decidido pela COORDENADA,
// na hora de desenhar, como as terras pintadas do `groundFrameAt`: a cor do chão, quanta terra aparece e
// qual decoração cada tile veste. O editor e o jogo perguntam aqui e dão a mesma resposta.
//
// As regiões são células de Voronoi em volta de sementes (as casas), com a distância entortada por um
// ruído suave: a fronteira serpenteia em vez de ser reta, e numa faixa de ~3 tiles um bioma se mistura
// com o vizinho (as cores se somam pelo peso de cada um), então nunca se vê uma emenda.

export type BiomeId = 'ash' | 'meadow' | 'stars' | 'woods' | 'moss' | 'garden' | 'fields';
export type Rgb = readonly [number, number, number];

interface BiomeDef {
  /**
   * Multiplica a cor do chão e da decoração (1 = a arte como ela é). A grama é verde e quase não tem
   * azul: baixar o azul não muda nada, e só um azul MAIOR que 1 puxa para o turquesa ou o prateado.
   */
  tint: Rgb;
  /** A mesma ideia nas árvores, mais fraca: o tronco e a copa não podem virar outra planta. */
  treeTint: Rgb;
  /**
   * Quanto chão vira terra nua (o corte do `groundEarthiness`, ver constants.ts): MENOR = mais terra.
   * O padrão do mundo era 0.66 (~19% de terra).
   */
  earthCut: number;
  /** O que a decoração rasteira (tufo, broto, folhas, pedrisco, flores) vira aqui. */
  small: readonly number[];
  /** O que o mato alto (19, 20) vira; ausente = fica mato. */
  tall?: readonly number[];
  /** O que os pinheiros viram (sempre outra árvore SÓLIDA: colisão não muda); ausente = ficam. */
  trees?: readonly number[];
}

// Os frames do `forest-tileset` (3 colunas, id = linha*3 + coluna): 0 moita, 1 arbusto florido,
// 3 árvore morta, 4 pinheiro, 7/8 tufos de capim, 10 florzinhas vermelhas, 11 florzinhas lilases,
// 12 pedregulho, 13 pedras, 14..18 pinheiros (com fruto, com flor…), 19/20 mato alto, 21 árvore morta
// pequena. O 2 e o 9 são GRAVETOS e ficam de fora de tudo: graveto é item neste jogo, e um graveto
// desenhado que não se pega ensina o jogador a parar de olhar para o chão.
/**
 * A FLORA PRÓPRIA de cada bioma (spritefactory/sprites/biome-decor.mjs, frames 63..72 do atlas): planta
 * que só existe num lugar é o que faz o lugar se reconhecer sem placa.
 */
export const BIOME_DECOR = {
  fern: 63, mossBloom: 64, wheat: 65, daisies: 66, poppies: 67,
  bluebells: 68, crystals: 69, cinders: 70, leaves: 71, clover: 72,
} as const;
/**
 * A MATA ANTIGA DO JARDIM ALTO (spritefactory/sprites/ancient-grove.mjs, frames 73..76): duas árvores anciãs (copa
 * larga, tronco torto, barba-de-velho), a moita velha e o capim antigo. Não é bioma — o bioma do jardim cobre o
 * centro inteiro do vale —: `scripts/jardim-no-alto.mjs` as põe só dentro do jardim e na sebe dele.
 */
export const ANCIENT_GROVE = { treeA: 73, treeB: 74, bush: 75, grass: 76 } as const;
const F = BIOME_DECOR;

export const BIOMES: Readonly<Record<BiomeId, BiomeDef>> = {
  // árvores: carvão
  ash: { tint: [0.86, 0.62, 0.52], treeTint: [0.74, 0.58, 0.52], earthCut: 0.4, small: [F.cinders, 13, F.cinders, 12, 13, F.cinders, 7], tall: [13, F.cinders], trees: [3, 21, 3] },
  // árvores: cerejeira rosada (o pinheiro de flor lilás, com o rosado por cima; o de fruto laranja
  // não vira rosa, a laranja da arte puxa tudo para o outono)
  meadow: { tint: [1.2, 1.12, 0.66], treeTint: [1.34, 0.96, 1.12], earthCut: 0.82, small: [F.daisies, F.poppies, 10, 11, F.daisies, 1, F.poppies, 10], trees: [16, 16, 15] },
  // árvores: azul de geada. Sem pedrinha no chão: as pedras moram no lago de lava (pedido do autor)
  stars: { tint: [0.95, 0.92, 1.7], treeTint: [0.9, 1, 1.62], earthCut: 0.5, small: [F.bluebells, F.crystals, 8, 11, F.bluebells, 7, F.crystals], tall: [8, F.bluebells], trees: [17, 4] },
  // árvores: verde-escuro de mata fechada
  woods: { tint: [0.6, 0.82, 0.55], treeTint: [0.6, 0.88, 0.54], earthCut: 0.72, small: [F.leaves, F.fern, 0, 8, F.leaves, 0] },
  // árvores: turquesa úmido
  moss: { tint: [0.62, 0.84, 1.6], treeTint: [0.6, 0.95, 1.5], earthCut: 0.76, small: [F.fern, F.mossBloom, F.fern, 1, 0, F.mossBloom], trees: [16, 4, 18] },
  // o gramado aparado: verde mais claro e vivo, quase sem terra à mostra; árvores no verde natural
  garden: { tint: [1.1, 1.2, 0.86], treeTint: [1.02, 1.1, 0.92], earthCut: 0.9, small: [F.clover, 0, 10, F.clover, 7, 11] },
  // árvores: ouro de outono
  fields: { tint: [1.3, 1.06, 0.52], treeTint: [1.46, 1.02, 0.46], earthCut: 0.58, small: [F.wheat, F.wheat, 8, F.daisies, 7, F.wheat], trees: [15, 4] },
};

/** As sementes: a casa (ou o marco) de cada bioma. Um bioma pode ter mais de uma. */
const SEEDS: ReadonlyArray<{ id: BiomeId; x: number; y: number }> = [
  { id: 'ash', x: 8, y: 4 },
  { id: 'meadow', x: 17, y: 18 },
  { id: 'stars', x: 41, y: 8 },
  { id: 'stars', x: 33, y: 17 },
  { id: 'woods', x: 53, y: 6 },
  { id: 'woods', x: 52, y: 27 },
  { id: 'moss', x: 7, y: 40 },
  { id: 'moss', x: 10, y: 53 },
  { id: 'garden', x: 30, y: 31 },
  { id: 'garden', x: 30, y: 26 },
  { id: 'fields', x: 30, y: 51 },
  { id: 'fields', x: 49, y: 50 },
];

/** Quão longe a fronteira entorta (tiles) e quão larga é a mistura entre dois biomas. */
const WARP_TILES = 4;
const WARP_GRAIN = 7;
const BLEND = 1.6;

// Ruído de valor determinístico (o mesmo hash de constants.ts/terrainVariant, copiado para este módulo
// não depender de quem depende dele).
const hash = (x: number, y: number): number => {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 1024) / 1023;
};
const valueNoise = (x: number, y: number, salt: number): number => {
  const fx = x / WARP_GRAIN; const fy = y / WARP_GRAIN;
  const cx = Math.floor(fx); const cy = Math.floor(fy);
  const tx = fx - cx; const ty = fy - cy;
  const sx = tx * tx * (3 - 2 * tx); const sy = ty * ty * (3 - 2 * ty);
  const at = (i: number, j: number): number => hash(i + salt, j - salt);
  const top = at(cx, cy) * (1 - sx) + at(cx + 1, cy) * sx;
  const bottom = at(cx, cy + 1) * (1 - sx) + at(cx + 1, cy + 1) * sx;
  return top * (1 - sy) + bottom * sy;
};

const IDS = Object.keys(BIOMES) as BiomeId[];
const cache = new Map<number, Float32Array>();

/**
 * O peso de cada bioma neste ponto (soma 1), na ordem de `IDS`. Aceita coordenada fracionária (o canto
 * de um tile, para a cor se misturar de canto a canto).
 */
export const biomeWeightsAt = (x: number, y: number): Float32Array => {
  const key = Math.round(x * 2) * 100003 + Math.round(y * 2);
  const hit = cache.get(key);
  if (hit) return hit;
  const wx = x + (valueNoise(x, y, 17) - 0.5) * 2 * WARP_TILES;
  const wy = y + (valueNoise(x, y, 491) - 0.5) * 2 * WARP_TILES;
  const best = new Float32Array(IDS.length).fill(Infinity);
  for (const s of SEEDS) {
    const d = Math.hypot(wx - s.x, wy - s.y);
    const i = IDS.indexOf(s.id);
    if (d < best[i]) best[i] = d;
  }
  const min = Math.min(...best);
  const w = new Float32Array(IDS.length);
  let sum = 0;
  for (let i = 0; i < IDS.length; i++) { w[i] = Math.exp(-(best[i] - min) / BLEND); sum += w[i]; }
  for (let i = 0; i < IDS.length; i++) w[i] /= sum;
  cache.set(key, w);
  return w;
};

/** O bioma que manda neste tile. */
export const biomeAt = (x: number, y: number): BiomeId => {
  const w = biomeWeightsAt(x, y);
  let best = 0;
  for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i;
  return IDS[best];
};

const mix = (x: number, y: number, pick: (b: BiomeDef) => Rgb): [number, number, number] => {
  const w = biomeWeightsAt(x, y);
  const out: [number, number, number] = [0, 0, 0];
  IDS.forEach((id, i) => {
    const c = pick(BIOMES[id]);
    out[0] += c[0] * w[i]; out[1] += c[1] * w[i]; out[2] += c[2] * w[i];
  });
  return out;
};

/** A cor do chão (e da decoração) neste ponto, já misturada com os biomas vizinhos. */
export const biomeTintAt = (x: number, y: number): [number, number, number] => mix(x, y, (b) => b.tint);
/** A mesma, nas árvores. */
export const biomeTreeTintAt = (x: number, y: number): [number, number, number] => mix(x, y, (b) => b.treeTint);

/** O corte de terra nua deste tile, misturado (ver `earthCut`). */
export const biomeEarthCutAt = (x: number, y: number): number => {
  const w = biomeWeightsAt(x, y);
  let cut = 0;
  IDS.forEach((id, i) => { cut += BIOMES[id].earthCut * w[i]; });
  return cut;
};

/** Árvore sem folha (a morta, a pequena morta, os tocos): o que o bioma veste com isto não solta folha. */
const BARE_TREES: ReadonlySet<number> = new Set([3, 21, 36, 37]);
export const isBareTreeAt = (frame: number, x: number, y: number): boolean => BARE_TREES.has(decorFrameAt(frame, x, y));

const SMALL_DECOR: ReadonlySet<number> = new Set([0, 7, 8, 10, 11, 13]);
const TALL_DECOR: ReadonlySet<number> = new Set([19, 20]);
const PINES: ReadonlySet<number> = new Set([4, 14, 15, 16, 17, 18]);

/**
 * O que a decoração guardada em (x, y) VESTE aqui. Só troca rasteiro por rasteiro, mato por rasteiro, e
 * árvore sólida por árvore sólida: a colisão e o que o jogo faz com cada tile não mudam. A escolha dentro
 * da lista do bioma sai de um hash da coordenada (determinística: o mesmo tile é sempre a mesma planta).
 */
export const decorFrameAt = (frame: number, x: number, y: number): number => {
  const pickFrom = (list: readonly number[] | undefined): number => {
    if (!list || list.length === 0) return frame;
    return list[Math.floor(hash(x * 3 + 7, y * 5 + 11) * list.length) % list.length];
  };
  if (!SMALL_DECOR.has(frame) && !TALL_DECOR.has(frame) && !PINES.has(frame)) return frame;
  const b = BIOMES[decorBiomeAt(x, y)];
  if (SMALL_DECOR.has(frame)) return pickFrom(b.small);
  if (TALL_DECOR.has(frame)) return pickFrom(b.tall);
  return pickFrom(b.trees);
};

/**
 * De que bioma é a PLANTA deste tile. Longe da fronteira é o bioma do lugar; na faixa de mistura cada
 * tile sorteia (hash fixo) pelo peso de cada bioma ali — a 60/40 do prado, seis de cada dez plantas são
 * do prado. Escolher sempre o que manda trocava a flora inteira de uma vez, numa linha.
 */
const decorBiomeAt = (x: number, y: number): BiomeId => {
  const w = biomeWeightsAt(x, y);
  let r = hash(x * 7 + 3, y * 11 + 5);
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return IDS[i];
  }
  return biomeAt(x, y);
};
