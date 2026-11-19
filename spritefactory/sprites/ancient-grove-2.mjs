// A MATA ANTIGA DO JARDIM ALTO, A SEGUNDA LEVA (pedido do autor, 2026-11-18: a sebe do jardim eram "as mesmas duas
// árvores anciãs, do mesmo tamanho, cada uma no centro do seu tile e em fileiras certinhas" — tirar da grade, com
// "alta qualidade"). Mais idades e mais jeitos da mesma árvore velha, no traço e na paleta das duas primeiras
// (ancient-grove.mjs, 73/74): copa larga e escura em lóbulos, a ardósia pesando embaixo e à direita, tronco grosso na
// madeira da casa, raízes à mostra e a barba-de-velho caindo dos galhos.
//
//   0 ANCIÃ LARGA     a copa mais baixa e mais larga do jardim, quase da largura do tile, tronco curto e grosso
//   1 ANCIÃ JOVEM     menor e mais alta de copa, tronco fino, quase sem barba: a que nasceu da semente de outra
//   2 ANCIÃ ALTA (topo)
//   3 ANCIÃ TORTA     o tronco inclinado para a direita, a copa deslocada, uma raiz grossa saindo pela esquerda
//   4 ANCIÃ GÊMEA     dois troncos saindo da mesma raiz, duas copas
//   5 ANCIÃ ALTA (pé)  a maior árvore do vale: duas células empilhadas (16×32), dois andares de copa, tronco largo e
//                     raízes em contraforte. O topo (2) e o pé (5) caem na MESMA coluna do atlas: instalada a partir
//                     do 135, a fileira é 135/136/137 e a de baixo 138/139/140.
//
//   node spritefactory/factory.mjs build ancient-grove-2
//   node spritefactory/install-tile.mjs ancient-grove-2 environment/tilesets/forest_tile_set.png 135

const E = '#272b2d';

export default {
  name: 'ancient-grove-2',
  kind: 'prop',
  layout: 'row',
  frames: [
    // 0 ANCIÃ LARGA
    [
      '................',
      '.....MM..MMM....',
      '..MMMDMMMDDMMM..',
      '.MDMDDCDMDCDDMM.',
      'MDDMDDMDDCDDMDCM',
      'MDCDDMDCDDMDDCDD',
      'DCDMDCCDMDCDDCKD',
      'CDCKDCKCDCKDCCKC',
      '.LKC.LCKPKCL.KL.',
      '.L.L..KPpK...L..',
      '.L....PPpP....L.',
      '......PpPPp.....',
      '.....pPPpPp.....',
      '....PpP.PpPp....',
      '..EEpEEEEpEEpE..',
      '...EEEEEEEEEE...',
    ],
    // 1 ANCIÃ JOVEM
    [
      '................',
      '.......MM.......',
      '.....MMDMMM.....',
      '....MDMDDCDM....',
      '...MDDMDCDDCM...',
      '...MDCDDMDDCD...',
      '...DCDMDDCDCD...',
      '....CKDCDKCD....',
      '....LKCPKCL.....',
      '....L..Pp.......',
      '.......Pp.......',
      '.......PpP......',
      '......pPPp......',
      '.....pP.Pp......',
      '.....EEpEEE.....',
      '......EEEE......',
    ],
    // 2 ANCIÃ ALTA — o topo: a copa de cima e o começo da de baixo
    [
      '................',
      '......MM.M......',
      '....MMDMMDMM....',
      '...MDDMDDCDDM...',
      '..MDCDDMDCDDDM..',
      '..DCDMDDCDDMDCD.',
      '.MDDCDDKDDCDDCDM',
      'MDCDDMDCDDMDCDDD',
      'DCDKCDDCKDCDDKCD',
      '.CKC.LCDCKCL.CK.',
      '.LMDM.L.L.MDDM..',
      'MDCDDM.L.MDCDDM.',
      'DCDMDDM.MDDMDCDM',
      'DDCDKCDMDCKDCDDC',
      '.CKDC.KCKC.CDKC.',
      '.L.LC.KPKC.LC.L.',
    ],
    // 3 ANCIÃ TORTA
    [
      '.......MM.MMM...',
      '.....MMDMMDDMM..',
      '....MDDCDMDDCDM.',
      '...MDCDDMDCDDDCM',
      '...DCDMDDCDDMDCD',
      '....CDDCKDCDDCD.',
      '....LCKC.KPCKCL.',
      '....L..L.PpK..L.',
      '.........PpP....',
      '........PpP.....',
      '.......PpP......',
      '......PpPp......',
      '.....pPPp.......',
      '..pPpP.PpP......',
      '.EEpEEEEpEE.....',
      '..EEEEEEEE......',
    ],
    // 4 ANCIÃ GÊMEA
    [
      '..MM.......MM...',
      '.MDDM.....MDDM..',
      'MDCDDM...MDDCDM.',
      'MDDCDDM.MDDCDDDM',
      'DCDMDCDMDCDMDCDD',
      '.CDDKCDCDKCDDKC.',
      '.LKC.KPCKP.CKCL.',
      '.L...PpK.Pp...L.',
      '.L...Pp...pP....',
      '......Pp.Pp.....',
      '......pPpPp.....',
      '.....pPPpPpP....',
      '....PpP..PpPp...',
      '...pP.....PpP...',
      '..EEEpEEEEEpEE..',
      '....EEEEEEEEE...',
    ],
    // 5 ANCIÃ ALTA — o pé: a barba da copa de baixo, o tronco largo e as raízes em contraforte
    [
      '.L..L.KPpK..L.L.',
      '.L...LPPpK....L.',
      '.L....PPpp......',
      '......PPpp......',
      '.....PPPpp......',
      '.....PPLpp......',
      '.....PPPpE......',
      '.....LPPpp......',
      '.....PPpPp......',
      '....PPPppEp.....',
      '....PP.PPpEp....',
      '...PPp.PPp.pp...',
      '..PPp..PPp..pp..',
      '.PP..EEPpEE..pp.',
      '.EEEEEEEEEEEEEE.',
      '...EEEEEEEEEE...',
    ],
  ],
  palette: {
    E,
    L: '#8a8d49', // musgo aceso / barba-de-velho
    M: '#626439', // a oliva da casa
    D: '#4d4f2c', // a folha na sombra
    C: '#3a3f3f', // o vão escuro da copa (slate)
    K: '#272b2d', // o fundo da copa da árvore anciã
    P: '#815938', p: '#63452c', // o tronco velho (wood)
  },
  // A barba-de-velho cai em fio de um pixel, solto da copa, como nas anciãs 73/74.
  allowOrphans: true,
  notes: 'A segunda leva da mata antiga do jardim alto: a larga, a jovem, a torta, a gêmea e a alta de dois tiles '
    + '(topo em 137, pé em 140), na paleta e no traço das anciãs 73/74. Instaladas em 135..140.',
};
