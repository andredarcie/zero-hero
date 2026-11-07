// A BIGORNA — o lugar fixo de martelar ferro, ao lado do forno da Vega (pedido do autor: "fiel como na vida real").
//
// Uma bigorna de ferreiro de verdade, de perfil: o CHIFRE cônico para a esquerda (onde se curva o ferro), a MESA
// plana em cima (onde se malha), a cintura estreita e os pés que abrem — assentada num TOCO de madeira, que é
// onde toda bigorna de oficina mora (a madeira amortece a pancada e põe a mesa na altura da mão).
//
// O ferro usa a rampa de ink do jogo (o contorno que já trabalha em toda peça) com a pedra-metal clara no topo,
// onde a luz cai; a madeira do toco é a mesma da bancada antiga. A peça a malhar é desenhada por cima da MESA, como
// um billboard próprio (AltarObject.LOAD_ELEV) — a mesa fica na fileira 5, e nada da arte a cobre.
//
// ── Os dois frames: fria e EM BRASA ───────────────────────────────────────────────────────────
// [0] a bigorna fria. [1] a mesma com a MESA em brasa — o calor que a pancada deixa onde a peça está, por um
// instante (AltarObject.HOT_MS). O chifre e o corpo não acendem: o calor mora na mesa.
//
// O martelinho que fica ao lado é outra peça (forge-hammer.mjs): ele sai da bigorna para a mão do herói.

const PAL = {
  J: '#324476', // ink claro — o fio de cima, onde a luz cai
  K: '#1d2b53', // ink navy — o aro lateral
  N: '#141d38', // ink escuro — a barriga, a sombra e o pé
  D: '#5d6165', // ferro na sombra (direita)
  M: '#7c7e8b', // ferro base
  L: '#989aa7', // ferro na luz (esquerda)
  A: '#a9abbe', // a MESA polida pelo uso
  S: '#63452c', // toco na sombra
  B: '#815938', // toco base
  C: '#886644', // toco pegando luz
  T: '#b7916a', // o topo do toco, cortado
  e: '#a53030', // brasa funda
  E: '#e7462a', // brasa viva
};

const COLD = [
  '................',
  '................',
  '................',
  '................',
  '....JJJJJJJJJ...', // o fio da mesa
  '.JJKAAAAAAAAAN..', // o CHIFRE (à esquerda) e a MESA
  '..KKLLLLMMMMDN..',
  '....KLLMMMMDN...',
  '......KLMDN.....', // a cintura
  '......KLMDN.....',
  '.....KLLMDDN....', // os pés abrem
  '....NNNNNNNNN...', // assentada no toco
  '...TTTTTTTTTT...', // o topo do toco
  '...KCCBBBBBSN...',
  '...KCBBBBBBSN...',
  '....NNNNNNNN....', // o contato com o chão
];

/** A mesa em brasa: só a fileira da mesa e a de baixo, do meio para as pontas. */
const HOT = COLD.map((row, y) => {
  if (y === 5) return '.JJKeEEEEEEEeN..';
  if (y === 6) return '..KKLeEEEEeMDN..';
  return row;
});

export default {
  name: 'altar',
  kind: 'prop',
  palette: PAL,
  frames: [COLD, HOT],
  notes: 'Bigorna de ferreiro de perfil (chifre à esquerda, mesa plana, cintura, pés) sobre um toco de madeira, '
    + '16x16, 2 frames: fria e com a MESA em brasa (o calor de cada pancada). Ferro na rampa de ink do jogo; o toco '
    + 'na madeira da bancada antiga. A mesa fica na fileira 5: a peça a malhar é um billboard por cima dela.',
};
