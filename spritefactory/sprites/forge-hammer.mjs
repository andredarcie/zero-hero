// O MARTELINHO DA BIGORNA (pedido do autor): fica encostado no toco da bigorna, e o herói o pega para malhar. Ao sair
// de perto, ele volta para o lugar — não vai junto: é da bigorna, não da bolsa.
//
// Um martelo de ferreiro pequeno, de pé: a cabeça de ferro em cima (a face de bater à direita, mais clara de uso),
// o cabo de madeira descendo. Mesma rampa de ink e mesma madeira da bigorna — as duas são a mesma oficina.
const PAL = {
  N: '#141d38', // ink escuro — o contorno
  K: '#1d2b53', // ink navy
  D: '#5d6165', // ferro na sombra
  M: '#7c7e8b', // ferro base
  L: '#989aa7', // ferro na luz
  A: '#a9abbe', // a face de bater, polida
  C: '#886644', // o cabo
  S: '#63452c', // o cabo na sombra
};

export default {
  name: 'forge-hammer',
  kind: 'item',
  palette: PAL,
  frames: [[
    '................',
    '................',
    '.....NNNNNN.....',
    '....NLLLMMAN....', // a cabeça: a face de bater à direita
    '....NLMMMDAN....',
    '.....NNNNNN.....',
    '.......NCN......', // o cabo
    '.......NCN......',
    '.......NCN......',
    '.......NCN......',
    '.......NSN......',
    '.......NCN......',
    '.......NSN......',
    '.......NCN......',
    '.......NSN......',
    '.......NNN......',
  ]],
  notes: 'Martelinho de ferreiro de pé (cabeça de ferro em cima, cabo de madeira), 16x16, 1 frame. Mesma rampa de '
    + 'ink e madeira da bigorna (altar.mjs).',
};
