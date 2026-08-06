// A PLANTA CARNÍVORA — a barreira de defesa que se PLANTA (CarnivorousPlantObject).
//
// Uma cabeça-bocarra num talo, com folhas na base: a fauna do jogo em versão flora. O corpo
// é a ramp olive inteira (a família do mato e das folhagens — ela pertence ao canteiro), as
// PRESAS são bone e o interior da bocarra é ember: o vermelho só aparece quando ela abre, e
// essa é a leitura do perigo — fechada, ela é quase mato; aberta, ela é uma boca.
//
// SEIS frames em coluna, e cada um é um TEMPO da mesma cabeça (a lição da flor-da-lua):
//   0 fechada  — a espera: lábios selados numa serra de presas (B/K alternados).
//   1 ABERTA   — o bote: as duas mandíbulas afastadas, o ember escancarado entre presas.
//   2 engolida — a bocarra fechada e INCHADA (o corpo está lá dentro): +2px de largura.
//   3 mastiga A — o bojo desloca pra ESQUERDA (a presa se debate).
//   4 mastiga B — o bojo desloca pra DIREITA.
//   5 murcha   — o talo venceu: a cabeça pende, sem cor de ember, sem presa erguida — o
//                estado morto (foice ou fogo), não-bloqueante, na camada do chão.
//
// Luz da esquerda (regra 5): flanco L (olive claro) à esquerda, sombra D à direita, em todos.

export default {
  name: 'carnivorous-plant',
  kind: 'prop',
  layout: 'column',
  palette: {
    K: '#1d2b53', // ink — o vinco da boca fechada e o escuro da murcha
    D: '#4d4f2c', // olive escuro — o lado da sombra
    G: '#626439', // olive médio — a massa da cabeça e do talo
    L: '#8a8d49', // olive claro — o flanco iluminado e as folhas
    B: '#cdcdcd', // bone — as PRESAS
    R: '#c83e3e', // ember — o interior da bocarra aberta
    E: '#a53030', // ember escuro — a goela
  },
  frames: [
    [
      '................',
      '................',
      '....LGGGGD......',
      '...LGGGGGGD.....',
      '...LGGGGGGD.....',
      '...LBKBKBKD.....',
      '...LGGGGGGD.....',
      '....LGGGGD......',
      '......GD........',
      '......GD........',
      '......GD........',
      '......GD........',
      '...L..GD..D.....',
      '..LLLLGGDDDD....',
      '...LL..GG..D....',
      '................',
    ],
    [
      '................',
      '....LGGGD.......',
      '...LGGGGGD......',
      '...LGGGGGD......',
      '...LBRRRBD......',
      '....ERRRRE......',
      '...BRRRRB.......',
      '...LGGGGGD......',
      '....LGGGD.......',
      '......GD........',
      '......GD........',
      '......GD........',
      '...L..GD..D.....',
      '..LLLLGGDDDD....',
      '...LL..GG..D....',
      '................',
    ],
    [
      '................',
      '................',
      '...LGGGGGGGD....',
      '..LGGGGGGGGGD...',
      '..LGGGGGGGGGD...',
      '..LBKBKBKBKGD...',
      '..LGGGGGGGGGD...',
      '...LGGGGGGGD....',
      '......GD........',
      '......GD........',
      '......GD........',
      '......GD........',
      '...L..GD..D.....',
      '..LLLLGGDDDD....',
      '...LL..GG..D....',
      '................',
    ],
    [
      '................',
      '................',
      '..LGGGGGGD......',
      '.LGGGGGGGGD.....',
      '.LGGGGGGGGD.....',
      '.LBKBKBKBGD.....',
      '.LGGGGGGGGD.....',
      '..LGGGGGGD......',
      '......GD........',
      '......GD........',
      '......GD........',
      '......GD........',
      '...L..GD..D.....',
      '..LLLLGGDDDD....',
      '...LL..GG..D....',
      '................',
    ],
    [
      '................',
      '................',
      '.....LGGGGGGD...',
      '....LGGGGGGGGD..',
      '....LGGGGGGGGD..',
      '....LGBKBKBKBD..',
      '....LGGGGGGGGD..',
      '.....LGGGGGGD...',
      '......GD........',
      '......GD........',
      '......GD........',
      '......GD........',
      '...L..GD..D.....',
      '..LLLLGGDDDD....',
      '...LL..GG..D....',
      '................',
    ],
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '..DDDDD.........',
      '.DDKKKDD........',
      '..DDDDDGD.......',
      '......GD........',
      '......GD........',
      '......GD........',
      '...L..GD..D.....',
      '..LLLLGGDDDD....',
      '...LL..GG..D....',
      '................',
    ],
  ],
  notes: 'A cabeca fechada e uma serra BKBKBK entre labios olive — presas a mostra mesmo em '
    + 'repouso, que e o aviso honesto da peca. No bote (frame 1) as mandibulas se afastam uma '
    + 'linha para cada lado e o ember ocupa o vao com presas B nas beiradas. Engolida (2) a '
    + 'cabeca alarga 2px simetrica; a mastigacao (3/4) desloca o MESMO bojo para os lados em '
    + 'vez de redesenhar a cabeca — micro-variacao, nunca silhueta nova (regra 8). A murcha '
    + '(5) derruba a cabeca ao pe do talo com a boca num vinco K frouxo: sem ember e sem presa '
    + 'erguida, o corpo diz "desligada" sem legenda nenhuma.',
};
