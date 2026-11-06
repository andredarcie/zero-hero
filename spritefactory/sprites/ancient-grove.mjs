// A MATA ANTIGA DO JARDIM ALTO (pedido do autor: "árvores, arbustos e gramas um pouco diferentes, dando a entender
// que o jardim alto é um lugar mais antigo, a floresta mais antiga"). Quatro peças, só para o jardim:
//
//   0 ÁRVORE ANCIÃ        copa larga e baixa e ESCURA (não o triângulo claro do pinheiro), tronco grosso e torto com raízes à
//   1 ÁRVORE ANCIÃ, outra  mostra, e barba-de-velho pendurada dos galhos — a árvore que já estava aqui antes.
//   2 MOITA VELHA          um tufo baixo de folha escura, com musgo por cima.
//   3 CAPIM ANTIGO         capim comprido e alto, já pálido, entre tufinhos de musgo.
//
// O padrão é o do atlas: ruído esparso de 3 a 5 cores, luz da esquerda, alpha binário, sombra preta no pé, as
// cores da casa (a oliva, a madeira, a ardósia). Instala no FIM do forest-tileset (frames 73..76).

const E = '#000000';

export default {
  name: 'ancient-grove',
  kind: 'prop',
  layout: 'row',
  frames: [
    // 0 ÁRVORE ANCIÃ — copa larga em três lóbulos, tronco grosso abrindo em raízes, barba-de-velho caindo
    [
      '.....MM.MM......',
      '...MMDDMDDM.M...',
      '..MDDCDDMDDCMM..',
      '.MDCDDMDCDDDCDM.',
      'MDCCDMDDDCDMDCDM',
      'DCDMDCCDMDCDDCDD',
      '.CDDCKCDDCKDCCD.',
      '.LCCK.CDCKPCKCL.',
      '.L.KLCPPpCKL..L.',
      '.L..L.PpP..L....',
      '......PpPp......',
      '.....pPPpP......',
      '....PpPpPpP.....',
      '...pP.PPp.pP....',
      '..EEpEEPpEEpEE..',
      '....EEEEEEEE....',
    ],
    // 1 ÁRVORE ANCIÃ, outra — dois lóbulos, o tronco torto para a direita, um nó no meio
    [
      '......MMM.......',
      '..MM.MDDDM.MM...',
      '.MDDM.DCDDMDDM..',
      'MDCDDMDCCDDCDDM.',
      'DCDDCDDMDCDDDCDM',
      '.DCKCDCDDCKCDDC.',
      '.MKC.KCDCKPK.CM.',
      '.L.L..KPPpK..L..',
      '.L....PpPp...L..',
      '.......PEpP.....',
      '.......pPpP.....',
      '......PpPPpP....',
      '.....pPp.PpPp...',
      '....pP...pP.pP..',
      '...EEEEEpEEEEEE.',
      '.....EEEEEEEE...',
    ],
    // 2 MOITA VELHA — folha escura em almofada, musgo claro por cima, duas florzinhas de osso
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '......LW.L......',
      '....LMLMMLML....',
      '...LMDMMDMMDL...',
      '..LMDDMLMDDMML..',
      '..MDCDMDMDCDMD..',
      '...DCDDCDDCDD...',
      '....EEEEEEEE....',
      '................',
      '................',
      '................',
      '................',
    ],
    // 3 CAPIM ANTIGO — hastes altas e pálidas, curvadas, com tufinho de musgo no pé
    [
      '................',
      '................',
      '....T.......T...',
      '....T..T....T...',
      '...T...T...T....',
      '...T..T....T.T..',
      '..TT..T...TT.T..',
      '..T..TT...T..T..',
      '..T..T...TT.T...',
      '..LT.T...T..T...',
      '..LMT.T..LMT....',
      '..MDE.E..MDE....',
      '...E......E.....',
      '................',
      '................',
      '................',
    ],
  ],
  palette: {
    E,
    L: '#8a8d49', // musgo aceso / barba-de-velho
    M: '#626439', // a oliva da casa
    D: '#4d4f2c', // a folha na sombra
    C: '#3a3f3f', // o vão escuro da copa (slate)
    K: '#272b2d', // o fundo da copa da árvore anciã: mais funda que a do pinheiro (slate escuro)
    P: '#815938', p: '#63452c', // o tronco velho (wood)
    W: '#cdcdcd', // florzinha (bone)
    T: '#826841', // o capim pálido (drywood)
  },
  notes: 'A mata antiga do jardim alto: duas árvores anciãs (copa larga, tronco torto, barba-de-velho), uma moita '
    + 'velha e o capim antigo. Instaladas em 73..76.',
};
