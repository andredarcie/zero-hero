// A MATA — a família de árvores que tira a floresta da grade (pedido do autor, 2026-11-10: "as árvores quadradas foram
// a única coisa que sobrou estranha... muito mais naturais e diversificadas, assim como a floresta real").
//
// O atlas tinha UM pinheiro em seis versões quase iguais (4, 14..18: a mesma silhueta, com fruta, com flor, com o
// tronco escuro), todos da mesma altura. Uma mata de verdade tem idades e espécies: a muda, a árvore jovem, o abeto
// esguio, a árvore de folha de copa redonda, a velha de copa larga, o pinheiro velho de galho aberto, e as GIGANTES
// que passam das outras. São essas, no traço do pinheiro que já existia:
//
//   · o mesmo material: ruído esparso de oliva (#626439) e ardósia (#3a3f3f) com furos, a ardósia pesando embaixo e à
//     direita (a luz vem da esquerda e do alto), o tronco na madeira da casa (#815938) aparecendo entre as folhas — e,
//     nos troncos à mostra, o lado direito na madeira escura (#674325): é o que dá corpo ao tronco e o separa da copa;
//   · alpha binário, sem contorno, sem degradê, 16 px por tile — as altas são DUAS células empilhadas (16×32), não
//     arte ampliada;
//   · as mesmas três roupas do pinheiro: a fruta laranja (o 15), a flor lilás (o 16) e o tronco escuro (o 17). O bioma
//     escolhe a roupa (world/biomes) e a forma sai daqui: por isso cada forma existe nas quatro.
//
// A ORDEM É O CONTRATO (render3d/forest.ts indexa por ela), instalada a partir do frame 78:
//   24 células simples: forma × roupa (lisa, fruta, flor, tronco escuro), forma = abeto, jovem, mudas, redonda, larga, velha
//   18 células das altas, em grupos de duas FILEIRAS do atlas: os três topos (lisa, fruta, flor) e, logo abaixo na
//   mesma coluna, os três pés — o quad de dois tiles lê as duas células de uma coluna como uma arte só.
//
//   node spritefactory/factory.mjs build forest-trees
//   node spritefactory/install-tile.mjs forest-trees environment/tilesets/forest_tile_set.png 78

/** O abeto esguio: estreito, em saias, pontudo. */
const SPRUCE = [
  '.......A........',
  '.......AA.......',
  '......AAA.......',
  '.......ACA......',
  '.....AAAA.......',
  '......ABCAA.....',
  '.....A.ACA......',
  '....AAAABAA.....',
  '.....CA.AACA....',
  '....A.ACBCA.....',
  '...AAACAAACA....',
  '....CC.ABAC.C...',
  '...A.ACCAACAC...',
  '....CCACBACC....',
  '.......BB.......',
  '................',
];

/** A árvore jovem: o pinheiro com dois terços da altura. */
const YOUNG = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '........A.......',
  '.......AA.......',
  '......A.AA......',
  '.....AAACA......',
  '......ABAA.A....',
  '....A.ACCAA.....',
  '...AACABAACA....',
  '....CC.ACAC.C...',
  '...CCAC.BACCC...',
  '.......BB.......',
  '................',
];

/** As mudas: uma arvoreta e uma muda ao lado, de alturas diferentes. */
const SAPLINGS = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....A..........',
  '....AA..........',
  '...A.AA.........',
  '....ACAA...A....',
  '..AA.BAC..AA....',
  '...CABAA.A.AC...',
  '..C.CCBACCABA...',
  '...CC.B.C.CBC...',
  '......B....B....',
  '................',
];

/** A árvore de folha: copa redonda sobre um tronco à mostra. */
const ROUND = [
  '................',
  '......AA.AA.....',
  '....AAAAAA.AA...',
  '...A.AACAAAA.A..',
  '..AAAA.AAACAAA..',
  '..A.ACAAA.AACA..',
  '.AAAAA.ACAAC.AC.',
  '..ACA.AAACCAACC.',
  '..C.AACAC.ACCC..',
  '...CCA.CBCAC.C..',
  '....CCC.BFCC....',
  '.......BF.......',
  '.......BF.......',
  '.......BF.......',
  '......BBFF......',
  '................',
];

/**
 * A árvore velha de folha: copa larga e ALTA, em lóbulos, sobre um tronco grosso que abre em dois galhos. (A primeira
 * versão tinha a copa baixa e chata sobre um tronco fino: no outono dos campos, laranja, lia como cogumelo.)
 */
const WIDE = [
  '......AA.A......',
  '....AAAAAAAA....',
  '..AAA.AACAAAAA..',
  '.AAAAAAA.AACAAA.',
  'AA.ACAAAAAA.AAAC',
  '.AAAA.AACAAACAA.',
  'AACAAAC.AAC.ACAC',
  '.CA.ACAACACCAACC',
  '..CCA.CCBC.CACC.',
  '....CCFB.BFCC...',
  '.......BBF......',
  '.......BBF......',
  '.......BBF......',
  '......BBBF......',
  '.....BBBBFF.....',
  '................',
];

/**
 * O pinheiro velho: o tronco inteiro à mostra e a folha em ALMOFADAS que se alternam dos dois lados, cada uma com o
 * topo em oliva e o lado de baixo em ardósia, presa ao tronco por um galho de madeira. (Revisão de arte, 2026-11-10:
 * a primeira versão tinha tufos soltos no ar, sem galho, e blocos de ardósia de 2×2 — lia como entulho em volta de
 * um poste. Pixel solto só na beira de uma massa; massa nenhuma flutua.)
 */
const OLD = [
  '.......AA.......',
  '......AACA......',
  '.....AABAAA.....',
  '......CBCC......',
  '.......B..AAA...',
  '..AAA..BBAACAA..',
  '.AACAABBF.CCC...',
  '..CCCC.BF.......',
  '.......BF..AAAA.',
  '.AAA...BFBAACAA.',
  '.AACAA.BF..CCCC.',
  '.CACCABBF.......',
  '..CCC..BF.......',
  '.......BF.......',
  '......BBFF......',
  '................',
];

/** O PINHEIRO GIGANTE (16×32): o pinheiro com o dobro da altura, a saia larga e o pé de tronco grosso. */
const GIANT = [
  '................',
  '.......A........',
  '.......AA.......',
  '......AA........',
  '......AACA......',
  '.....A.AAA......',
  '......ABAAA.....',
  '....AA.CAA.A....',
  '.....AAABCA.....',
  '...A.ACAAAAA....',
  '....CAA.BAAC.A..',
  '...AAACAAC.AA...',
  '..A.A.CABAACA...',
  '....CCAAACAA.AA.',
  '..AAA.ACBCAACA..',
  '.A.ACCA.AAAC.CA.',
  '...CAAACABAACA..',
  '..AA.CCAAAC.AAC.',
  '.A.AAAC.BAACACA.',
  '..CCA.AACA.CCAC.',
  '.AAACACABCAA.AAC',
  'A.ACC.CAAAC.ACC.',
  '.CAA.ACCBACAACAC',
  'AC.CCAC.AACC.CC.',
  '.CCAC.CABCA.CACC',
  'C.C.CCC.BAC.CC.C',
  '..CC...CBF.CC.C.',
  '.......BBF......',
  '.......BF.......',
  '.......BBF......',
  '......BBBFF.....',
  '................',
];

/** O ABETO ALTO (16×32): uma coluna estreita de saias, quase dois tiles. */
const TALL_SPRUCE = [
  '................',
  '................',
  '.......A........',
  '.......A........',
  '......AAA.......',
  '.......AC.......',
  '......AAAA......',
  '.....A.BA.......',
  '......AACAA.....',
  '.....AAABA......',
  '.......CAA.A....',
  '....AAAABCA.....',
  '.....C.AAAA.....',
  '......ACBAC.....',
  '....A.AAACAA....',
  '.....CAABAC.A...',
  '...AAACAAAC.....',
  '.....A.CBAAA....',
  '....ACAAAC.A....',
  '...A.CCABACA....',
  '....AAACAACC.A..',
  '..AA.C.ABCAAC...',
  '....CCAACAC.C...',
  '...AACCABACCA...',
  '..C.CA.CACA.CC..',
  '....CCCABCCC....',
  '...C.C.BFC.C....',
  '.......BF.......',
  '.......BF.......',
  '.......BF.......',
  '......BBFF......',
  '................',
];

/**
 * A ÁRVORE ALTA DE FOLHA (16×32): copa redonda grande no alto de um tronco comprido, com dois galhos baixos, um de
 * cada lado e em alturas diferentes. (Revisão de arte, 2026-11-10: era um galho só, que descia do tufo até o tronco
 * e lia como um gancho pendurado num poste. Galho sobe do tronco para a folha, e um tronco comprido pede mais de um.)
 */
const TALL_ROUND = [
  '................',
  '................',
  '......AAA.AA....',
  '....AAAAAAA.A...',
  '...AA.AACAAAAA..',
  '..AAAAAA.AAACA..',
  '.AA.ACAAAAA.AAA.',
  '.AAAAA.AACAAAC.A',
  'AA.AAAACAA.ACAA.',
  '.AACA.AAAAACAACA',
  'AAA.AACA.ACAAC.C',
  '.ACAAA.AAAC.ACAC',
  'A.AACACCA.ACACC.',
  '.CA.AAC.ACCAC.CC',
  '..CCA.CAAC.CACC.',
  '.C.CACC.BCACC.C.',
  '...C.CCCBFC.CC..',
  '.....C..BF.C....',
  '........BF......',
  '.......BBF......',
  '.......BF.......',
  '..AAA..BF.......',
  '.AACAA.BF.......',
  '..CCCB.BF.......',
  '.....BBBF.......',
  '.......BF.AA....',
  '.......BFBACA...',
  '.......BBF.CC...',
  '.......BF.......',
  '......BBF.......',
  '.....BBBBFF.....',
  '................',
];

const SINGLES = [SPRUCE, YOUNG, SAPLINGS, ROUND, WIDE, OLD];
const TALLS = [GIANT, TALL_SPRUCE, TALL_ROUND];

for (const grid of [...SINGLES, ...TALLS]) {
  for (const row of grid) if (row.length !== 16) throw new Error(`forest-trees: linha com ${row.length} colunas: "${row}"`);
}

/** Um embaralho fixo por célula: a fruta de cada forma cai sempre nos mesmos pixels. */
const hash = (x, y, salt) => {
  let h = (x * 374761393 + y * 668265263 + salt * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * A ROUPA. A fruta e a flor trocam alguns pixels de FOLHA CLARA do miolo da copa (com folha dos quatro lados, para a
 * fruta nunca ficar solta no ar), longe umas das outras: cinco no pinheiro original, uma a cada ~28 pixels de copa
 * aqui. O tronco escuro troca a madeira inteira.
 */
const dress = (grid, kind, salt) => {
  if (kind === 'plain') return grid;
  const rows = grid.map((r) => r.split(''));
  if (kind === 'dark') return rows.map((r) => r.map((c) => (c === 'B' ? 'F' : c)).join(''));
  const leaf = (x, y) => rows[y]?.[x] === 'A' || rows[y]?.[x] === 'C';
  const spots = [];
  let canopy = 0;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < 16; x++) {
      if (leaf(x, y)) canopy++;
      if (rows[y][x] === 'A' && leaf(x - 1, y) && leaf(x + 1, y) && leaf(x, y - 1) && leaf(x, y + 1)) {
        spots.push({ x, y, order: hash(x, y, salt) });
      }
    }
  }
  spots.sort((a, b) => a.order - b.order);
  const want = Math.max(2, Math.round(canopy / 28));
  const placed = [];
  for (const s of spots) {
    if (placed.length >= want) break;
    if (placed.some((p) => Math.abs(p.x - s.x) + Math.abs(p.y - s.y) < 4)) continue;
    placed.push(s);
    rows[s.y][s.x] = kind === 'fruit' ? 'D' : 'E';
  }
  return rows.map((r) => r.join(''));
};

const frames = [];
SINGLES.forEach((grid, i) => {
  for (const kind of ['plain', 'fruit', 'flower', 'dark']) frames.push(dress(grid, kind, 11 + i));
});
TALLS.forEach((grid, i) => {
  const dressed = ['plain', 'fruit', 'flower'].map((kind) => dress(grid, kind, 41 + i));
  for (const g of dressed) frames.push(g.slice(0, 16)); // os três topos numa fileira do atlas…
  for (const g of dressed) frames.push(g.slice(16)); // …e os três pés na fileira de baixo
});

export default {
  name: 'forest-trees',
  kind: 'prop',
  layout: 'row',
  frames,
  palette: {
    A: '#626439', // a oliva da copa (a mesma do pinheiro)
    C: '#3a3f3f', // a ardósia: a folha na sombra
    B: '#815938', // a madeira do tronco
    F: '#674325', // a madeira escura (a roupa do pinheiro 17)
    D: '#e8964a', // a fruta (a do pinheiro 15)
    E: '#a884f3', // a flor (a do pinheiro 16)
  },
  // A copa é ruído esparso de propósito: os pixels soltos na beira são o desenho da folhagem, como no pinheiro.
  allowOrphans: true,
  // As três cores das roupas não estão no censo do linter (ele não lê o atlas do terreno), mas são do próprio
  // forest_tile_set.png: a fruta do pinheiro 15, a flor do 16 e a madeira escura do 17, lidas pixel a pixel.
  allowNewColors: ['#e8964a', '#a884f3', '#674325'],
  notes: 'A mata: seis formas simples (abeto, jovem, mudas, redonda, larga, velha) nas quatro roupas do pinheiro, e '
    + 'três árvores altas de duas células (gigante, abeto alto, alta de folha) em três roupas. Instaladas em 78..119; '
    + 'quem escolhe a forma de cada tile é render3d/forest.ts.',
};
