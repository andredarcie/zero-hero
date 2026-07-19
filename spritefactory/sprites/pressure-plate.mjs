// Placa de pressao — dois ESTADOS empilhados: 0 levantada, 1 pressionada. A base e byte-a-byte
// igual; apenas o miolo afunda e revela o circuito verde. Assim a troca le como movimento fisico,
// nao como um objeto diferente aparecendo no tile.

const PALETTE = {
  N: '#141d38', // contato inferior
  K: '#1d2b53', // rebaixo/circuito estrutural
  D: '#5d6165', // metal em sombra
  M: '#7c7e8b', // metal base
  L: '#989aa7', // bevel iluminado
  g: '#008751', // circuito ativo
  G: '#7dde99', // nucleo ativo / leitura no escuro
};

const UP = [
  '................',
  '................',
  '..LLLLLLLLLLLD..',
  '..LMMMMMMMMMDD..',
  '..LMKMMMMMMKDD..',
  '..LMMLLLLLLMDD..',
  '..LMMLMMMMDMDD..',
  '..LMMLMMMMDMDD..',
  '..LMMLMMMMDMDD..',
  '..LMMLMMMMDMDD..',
  '..LMMDDDDDDMDD..',
  '..LMKMMMMMMKDD..',
  '..LDDDDDDDDDDD..',
  '..NNNNNNNNNNNN..',
  '................',
  '................',
];

const DOWN = [
  '................',
  '................',
  '..LLLLLLLLLLLD..',
  '..LMMMMMMMMMDD..',
  '..LMKMMMMMMKDD..',
  '..LMMKKKKKKMDD..',
  '..LMMKggggKMDD..',
  '..LMMKgGGgKMDD..',
  '..LMMKgGGgKMDD..',
  '..LMMKggggKMDD..',
  '..LMMKKKKKKMDD..',
  '..LMKMMMMMMKDD..',
  '..LDDDDDDDDDDD..',
  '..NNNNNNNNNNNN..',
  '................',
  '................',
];

export default {
  name: 'pressure-plate',
  kind: 'prop',
  layout: 'column',
  palette: PALETTE,
  frames: [UP, DOWN],
  notes: 'Dois frames 16x16, coluna: levantada e pressionada. Metal segue a rampa stone inteira '
    + 'com bevel duro e luz da esquerda; o estado UP tem um pad central alto (aresta clara + face '
    + 'media), o DOWN troca so o miolo por um rebaixo ink e circuito hero-green. A base, a sombra '
    + 'e a silhueta nao mudam entre estados, garantindo micro-variacao e zero flicker visual.',
};
