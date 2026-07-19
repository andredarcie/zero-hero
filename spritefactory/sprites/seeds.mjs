// Sementes de mato — o produto da foice (substitui a palha). Um punhado de tres graos
// dourados em arranjo diagonal: a 1x le como "graozinhos", nao como uma bolota unica.
// Ancoras de estilo: wood_icon (item pequeno, silhueta legivel), rock (luz esquerda dura).
// Ramp gold inteira (sombra #c9c81b -> luz #f8e394) + a ponta do germe em wood escuro,
// presa ao grao (nada de pixel orfao).

export default {
  name: 'seeds',
  kind: 'item',
  palette: {
    H: '#f8e394', // highlight — topo-esquerda de cada grao
    B: '#f1cc36', // ouro base
    S: '#c9c81b', // sombra do grao (fundo da ramp gold)
    D: '#63452c', // a ponta do germe — wood escuro, o "ink" organico do grao
  },
  frames: [[
    '................',
    '................',
    '................',
    '....HBB.........',
    '...HBBBS........',
    '...BBBSS........',
    '....BSSD..HBB...',
    '.........HBBBS..',
    '.........BBBSS..',
    '...HBB....BSSD..',
    '..HBBBS.........',
    '..BBBSS.........',
    '...BSSD.........',
    '................',
    '................',
    '................',
  ]],
  notes: 'Tres graos (nao um) para ler como PUNHADO de sementes; cada um com a mesma anatomia '
    + '(highlight NW, base, sombra SE, germe na ponta) girada pelo arranjo diagonal. Ramp gold '
    + 'completa para nao ficar chapado; o germe #63452c e o unico escuro, preso a silhueta.',
};
