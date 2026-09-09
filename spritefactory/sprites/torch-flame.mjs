// A CHAMA DA TOCHA DE PAREDE — e o fim de uma fogueirinha pregada na pedra.
//
// Ate aqui a tocha da masmorra queimava com `campfire-0..2`, que sao os PNGs `sprite_fire0..2`
// do jogo. Esses arquivos tem AS TORAS DESENHADAS na base: cada uma das 75 tochas do subterraneo
// era, literalmente, uma fogueira de acampamento de 0,42 tile pendurada numa parede — lenha
// inclusa. E 0,42 tile de uma arte de 16px e uma reducao de 2,4x: a arte chegava na tela
// serrilhada, com metade dos texeis jogados fora.
//
// Esta chama e desenhada para ser mostrada a UM TILE, texel a texel, sobre a face do cubo de
// alvenaria: o que define o tamanho dela e a margem dentro do frame, nunca um `setDisplaySize`
// menor que a arte.
//
// ── ALTA E ESTREITA, e o motivo e a leitura ─────────────────────────────────────────────────
// A v1 tinha 7px de largura por 8 de altura e lia como um BALAO: uma bolha de fogo, nao uma
// chama. Fogo de tocha e uma lingua — o que a identifica e a razao entre altura e largura, nao a
// cor. Esta versao tem 5 de largura por 9 de altura (~1,8:1) e afina para UM pixel no topo.
//
// ── ANIMACAO E MICRO-VARIACAO (regra 8 da fabrica) ──────────────────────────────────────────
// O CORPO da chama (as linhas 6 a 10) e IDENTICO nos quatro frames. O que muda sao duas coisas:
//
//   · a PONTA (linhas 1 a 5) — sobe, encolhe, deita para um lado, solta uma fagulha;
//   · o NUCLEO branco-quente (W) — ele RESPIRA, subindo e descendo uma linha entre os frames.
//
// Redesenhar a silhueta entre frames e o defeito classico do fogo em pixel art: vira uma mancha
// pulsando, e nao uma chama. Segurar o corpo e mexer so na ponta e no nucleo e o que da vida sem
// perder o objeto.
//
// A ponta e ASSIMETRICA nos quatro frames, e isso e lei da arte desta casa (ver `thought-torch`):
// fogo nao tem eixo de simetria, e uma cupula simetrica sobre um talo le como COGUMELO.
//
// ── As cores ────────────────────────────────────────────────────────────────────────────────
// Rampa `ember` de fora para dentro, rampa `gold` no nucleo — a mesma escada da esponja de ferro
// e da boca do forno, que e o que faz o fogo deste jogo parecer o mesmo fogo em toda parte.

const P = {
  d: '#a53030', // brasa funda — a beira fria da chama
  r: '#c83e3e', // brasa — so na base, onde a chama entra no copo
  E: '#e7462a', // brasa viva
  Y: '#f1cc36', // ouro — a transicao para o nucleo
  W: '#f8e394', // branco-quente: o nucleo, sempre 1px de largura
};

// O CORPO, fixo. A unica coisa que se escolhe aqui e em quais das tres linhas mora o nucleo
// branco (`W`): e a altura em que a chama esta mais quente naquele frame.
const HOT = '......dEWYd.....';
const DIM = '......dEYEd.....';
const FOOT = ['......drErd.....', '.......rEr......']; // assenta dentro do rim do copo
const EMPTY = '................';

const frame = (tip, [h6, h7, h8]) => [
  EMPTY,                                    // 0 — a linha do topo da parede fica livre
  ...tip,                                   // 1..5 — a ponta
  h6 ? HOT : DIM, h7 ? HOT : DIM, h8 ? HOT : DIM, ...FOOT, // 6..10 — o corpo
  EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,        // 11..15 — o copo do suporte mora aqui
];

export default {
  name: 'torch-flame',
  kind: 'effect',
  layout: 'row',
  palette: P,
  // A fagulha solta do frame C e um pixel isolado DE PROPOSITO — e a unica coisa nesta folha que
  // se desprende do corpo, e e ela que faz a animacao ler como fogo em vez de bandeira.
  allowOrphans: true,
  frames: [
    // A — a chama cheia: ponta reta de um pixel, nucleo alto.
    frame([
      EMPTY,
      '........d.......',
      '.......dE.......',
      '......dEYd......',
      '......dEYd......',
    ], [true, true, false]),
    // B — a chama BAIXA: a ponta encolheu duas linhas e deitou para a esquerda; o nucleo desceu
    //     para uma linha so. E o vale do ciclo.
    frame([
      EMPTY,
      EMPTY,
      EMPTY,
      '......dE........',
      '......dEYd......',
    ], [true, false, false]),
    // C — a chama ALTA: a ponta esticou para a direita e soltou uma fagulha; o nucleo enche as
    //     tres linhas do corpo. E o pico.
    frame([
      '.........d......',
      '........d.......',
      '.......dE.......',
      '......dEYd......',
      '......dEYd......',
    ], [true, true, true]),
    // D — a chama ASSENTA: a ponta virou um toco largo e o nucleo escorregou para baixo.
    frame([
      EMPTY,
      EMPTY,
      EMPTY,
      '......dEd.......',
      '......dEYd......',
    ], [false, true, true]),
  ],
  notes: 'Chama de TOCHA (5px de largura por 9 de altura, sem tora nenhuma) para o suporte de '
    + 'parede da masmorra — o lugar do sprite_fire0, que e uma fogueira de acampamento com lenha '
    + 'desenhada na base. A v1 tinha 7x8 e lia como BALAO: o que identifica fogo de tocha e a '
    + 'razao altura/largura. Quatro frames de MICRO-VARIACAO: o corpo (linhas 6-10) e identico '
    + 'nos quatro, e o que anima e a ponta e o nucleo branco-quente subindo e descendo uma linha. '
    + 'A ponta e assimetrica nos quatro para o desenho nao ler como cogumelo.',
};
