/**
 * AS RELÍQUIAS ENTERRADAS (pedido do autor, 2026-11-18): coisas que marcaram a vida de quem fez o jogo, enterradas no
 * vale. Onde a terra está trincada, a pá da Sisi cava, e a coisa pula do buraco para a mão do Zero. Cada uma ganha a
 * página dela no caderno de campo (runtime/notebook, seção Relíquias).
 *
 * Dois jogos do autor (Brian's Mansion, o primeiro que ele terminou; Zero To One, o jogo azul) e a engine dele (Tiny RPG
 * Studio), os jogos, os livros e o filme que ele pediu, e coisas da biografia dele (o diploma de Ciência da Computação,
 * o clube de leitura que fundou e o ano de 2024 subindo o litoral).
 *
 * O LUGAR de cada uma: espalhadas pelo vale (oito das nove regiões do vale em 3×3 têm uma, nenhuma fica perto de outra,
 * e o cartão de 2024 mora na areia da praia do norte), em tiles de chão livre, alcançáveis a pé desde o começo, longe das casas, das trilhas, da
 * estrada antiga e do acampamento. Algumas ficaram de propósito perto do que lembram: a fita de 2001 perto da
 * astronauta, Journey ao pé do jardim alto (a montanha com a luz no alto), Zero To One onde o Zero chega ao vale, Gone
 * Home perto da casa dele, o diploma perto da Shui (a cientista dos fungos). A prova é `relics.test.ts` (o mapa) e
 * `relicDig.test.ts` (o jogo montado).
 */

export const RELIC_KINDS = [
  'briansMansion',
  'zeroToOne',
  'tinyRpgStudio',
  'journey',
  'goneHome',
  'discoElysium',
  'book1984',
  'odyssey2001',
  'diploma',
  'bookClub',
  'nomadPostcard',
] as const;

export type RelicKind = (typeof RELIC_KINDS)[number];

export const isRelicKind = (kind: unknown): kind is RelicKind => (RELIC_KINDS as readonly unknown[]).includes(kind);

/** Onde cada uma está enterrada (o tile da trinca). */
export const RELIC_SPOTS: Readonly<Record<RelicKind, { x: number; y: number }>> = {
  briansMansion: { x: 18, y: 1 },
  book1984: { x: 15, y: 23 },
  // O ANO DE 2024 SUBINDO O LITORAL mora na PRAIA (pedido do autor, 2026-11-19: "coloque essa surpresa em algum lugar
  // escondido na areia da praia"): logo ao norte de um coqueiro, atrás das folhas dele para quem olha da câmera. Na areia
  // não há trinca: aparece só a pontinha do cartão (render3d/relicArt, SAND_HINT_ART).
  nomadPostcard: { x: 15, y: -15 },
  bookClub: { x: 33, y: 18 },
  journey: { x: 36, y: 36 },
  zeroToOne: { x: 26, y: 55 },
  odyssey2001: { x: 41, y: 13 },
  discoElysium: { x: 50, y: 32 },
  goneHome: { x: 45, y: 46 },
  tinyRpgStudio: { x: 48, y: 17 },
  diploma: { x: 11, y: 38 },
};

/** A relíquia enterrada neste tile, se houver. */
export const relicAt = (x: number, y: number): RelicKind | undefined =>
  RELIC_KINDS.find((kind) => RELIC_SPOTS[kind].x === x && RELIC_SPOTS[kind].y === y);
