// O PORTÃO DO JARDIM ALTO (pedido do autor): um portão de jardim clássico, de ferro batido, com arco e pontas, e a
// mata por cima — ramos subindo pelo pilar, correndo pelo arco e caindo pela grade. Fechado há muito tempo.
//
// O metal é o MESMO da porta trancada e da chave (A #a9abbe, B #989aa7, o preto da fechadura #1e1e1e), com o
// brilho e a sombra funda da chave — a chave e a fechadura são a mesma peça de ferraria. Três quadros: fechado
// (0), entreaberto (1) e aberto (2). O arco e os pilares ficam; as folhas giram para dentro do jardim.
export default {
  name: 'garden-gate',
  kind: 'prop',
  palette: {
    A: '#a9abbe', // o metal da porta
    B: '#989aa7', // a sombra sob cada trilho
    H: '#d9d9d9', // o brilho do metal (as pontas e o alto do arco)
    D: '#737784', // o pé da grade, onde a umidade escurece o ferro
    L: '#cdcdcd', // a placa da fechadura
    K: '#262626', // o buraco da chave
    G: '#5d8a3c', // folha
    g: '#39571c', // folha na sombra
    F: '#e3dad1', // uma florzinha do mato
  },
  // a folha da mata antiga: a paleta só tem verdes de bandeira ou de musgo seco, e a hera precisa de um verde vivo e fosco.
  allowNewColors: ['#5d8a3c'],
  frames: [
    [
      'H...FG.HH.g....H',
      'A...GHgAAGHGF..A',
      'A..g.AAAAAA.g..A',
      'A.GAAA.AA.AAAG.A',
      'gAA.A..AA..A.AGA',
      'AGA.A..AA..A.AgA',
      'AgAAAAAAAAAAAAFA',
      'G.A.A.LLLL.A.G.A',
      'AGA.A.LKKL.A.AgA',
      'gFAGA.LLLL.AGA.A',
      'AGg.A..AA..A.g.A',
      'G.A.A..AA..A.A.A',
      'AgAAAAAAAAAAAAAA',
      'G.B.B..BB..B.B.G',
      'AGA.AG.AA.gA.A.g',
      'g.D.D.gDDG.D.DGD',
    ],
    [
      'H...FG.HH.g....H',
      'A...GHgAAGHGF..A',
      'A..g.AAAAAA.g..A',
      'A.GAAA.AA.AAAG.A',
      'gAAA........AAGA',
      'AGAA........AAgA',
      'AgAA........AAFA',
      'G.AA........AA.A',
      'AGAA........AAgA',
      'gFAA........AA.A',
      'AGAA........AA.A',
      'G.AA........AA.A',
      'AgAA........AAAA',
      'G.BB........BB.G',
      'AGAA........AA.g',
      'g.DD........DDGD',
    ],
    [
      'H...FG.HH.g....H',
      'A...GHgAAGHGF..A',
      'A..g.AAAAAA.g..A',
      'A.GAAA.AA.AAAG.A',
      'gA............AA',
      'AA............AA',
      'AA............AA',
      'GA............AA',
      'AA............AA',
      'gA............AA',
      'AA............AA',
      'GA............AA',
      'AA............AA',
      'GB............BG',
      'AA............Ag',
      'gD............DD',
    ]
  ],
  notes: 'Portão de jardim clássico coberto de ramos. Metal da porta trancada e da chave; os ramos nas cores da '
    + 'mata. Edge-touch é o desenho (o portão vai de borda a borda do vão).',
};
