// O ALTAR — a bigorna que nao e maquina.
//
// A cadeia do ferro tem dois lugares onde a esponja vira barra: o MARTINETE (que precisa de roda
// d'agua, engrenagem e uma rede eletrica inteira antes de existir) e o chao, onde a peca cai e o
// jogador martela onde ela parou. O primeiro e caro demais para o comeco do jogo; o segundo nao e
// um LUGAR — e um acidente de onde a coisa rolou, e nada no mundo diz "trabalhe aqui".
//
// O altar e esse lugar: uma laje de pedra na altura da cintura onde se POE uma peca e se bate
// nela. Ele nao consome energia, nao tem direcao e nao faz nada sozinho — e por isso a silhueta
// dele foge de todas as tres familias que a fabrica ja tem (caixa de metal com aro de ink; a
// alvenaria em cone do forno; a armacao de madeira do martinete). O que ele parece e o que ele e:
// PEDRA BRUTA cortada em bloco, mais perto de um dolmen do que de uma maquina.
//
// ── A forma, e por que ela le a 1x ───────────────────────────────────────────────────────────
// Uma base larga, um pescoco estreito e um TAMPO que se projeta para os dois lados. A projecao e
// a peca inteira da leitura: e o degrau de sombra sob a mesa que diz "isto tem uma superficie em
// cima", que e a unica coisa que o jogador precisa entender antes de apertar o botao. Sem ela o
// sprite vira uma pedra qualquer — e o mundo ja tem 800 delas.
//
// O tampo fica na metade de cima do tile de proposito: o que for posto ali e desenhado como um
// billboard proprio na elevacao da mesa, e ele nao pode cobrir a silhueta da pedra.
//
// ── Os dois frames: fria e MARCADA ──────────────────────────────────────────────────────────
// [0] a laje limpa. [1] a mesma laje com o tampo em BRASA — o calor que uma pancada deixa na
// pedra, na rampa `ember`. Ele nao e um estado guardado: a peca acende por ~150ms a cada golpe e
// volta, que e o mesmo vocabulario do martinete (FRAME_HOT) e o que faz a batida ter peso sem
// nenhuma legenda. Duas artes, uma pancada.

// O CONTORNO NAO E CHAPADO: a rampa de ink inteira trabalha. Fio de cima claro (o ceu bate nele),
// lateral navy, e o que fica por baixo — a barriga do tampo, o contato com o chao — no ink mais
// escuro do jogo. E o mesmo raciocinio da pedra: um contorno de uma cor so le como adesivo.
const PAL = {
  J: '#324476', // ink claro — o fio de cima, onde a luz cai
  K: '#1d2b53', // ink navy — o aro lateral, como em toda peca deste jogo
  N: '#141d38', // ink escuro — a barriga do tampo, a sombra e o pe
  D: '#5d6165', // pedra na sombra (direita)
  M: '#7c7e8b', // pedra base
  L: '#989aa7', // pedra na luz (esquerda — a luz deste jogo vem sempre de la)
  A: '#a9abbe', // pedra no brilho: o fio do tampo
  e: '#a53030', // brasa funda
  E: '#e7462a', // brasa viva
};

// A laje. Colunas 2..13 no tampo (ele SE PROJETA), 4..11 no pescoco, 3..12 no pe.
const BODY = [
  '................',
  '................',
  '................',
  '..JJJJJJJJJJJJ..', // o fio do tampo, iluminado
  '..KAAALLLMMMDN..', // o TAMPO — a superficie onde a peca fica
  '..KLLLMMMDDDDN..',
  '..NNNNNNNNNNNN..', // a barriga da laje
  '...NN......NN...', // a sombra da projecao: o degrau que diz "ha uma mesa aqui"
  '....KLLMMDDN....', // o pescoco
  '....KLLMMDDN....',
  '....KLLMMDDN....',
  '...KKLLMMDDNN...',
  '...KLLLMMDDDN...', // o pe alarga de volta
  '...KKKKKNNNNN...',
  '....NNNNNNNN....', // o contato com o chao
  '................',
];

// O TAMPO EM BRASA: so as duas fileiras da mesa, do fio para dentro. A pedra em volta nao acende
// — o calor de uma pancada mora onde a peca esta, e nao no bloco inteiro.
const HOT = [
  { y: 4, xs: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], c: ['e', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'e'] },
  { y: 5, xs: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], c: ['e', 'e', 'E', 'E', 'E', 'E', 'E', 'e', 'e', 'e'] },
];

export default {
  name: 'altar',
  kind: 'prop',
  draw({ Pix, hexToRgb }) {
    const rgb = Object.fromEntries(
      Object.entries(PAL).map(([k, v]) => [k, hexToRgb(v)]),
    );
    const frames = [];
    for (let hot = 0; hot < 2; hot += 1) {
      const p = new Pix(16, 16);
      p.stampGrid(BODY, PAL);
      if (hot) {
        for (const row of HOT) row.xs.forEach((x, i) => p.set(x, row.y, rgb[row.c[i]]));
      }
      frames.push(p);
    }
    return frames;
  },
  notes: 'Altar de pedra 16x16, 2 frames — frio e com o TAMPO EM BRASA (o calor que a pancada '
    + 'deixa, ~150ms por golpe, o mesmo vocabulario do FRAME_HOT do martinete). Silhueta de laje: '
    + 'base larga, pescoco estreito e tampo PROJETADO para os dois lados, com o degrau de sombra '
    + 'embaixo — e essa projecao que diz "ha uma superficie aqui" a 1x e o que o separa das ~800 '
    + 'pedras do mundo. Foge das tres familias da fabrica (caixa de metal, alvenaria em cone, '
    + 'armacao de madeira) de proposito: ele nao e maquina, e um LUGAR de trabalho.',
};
