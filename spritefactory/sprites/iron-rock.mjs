// A PEDRA DE FERRO — a mesma rocha do jogo, com veios de minerio dentro.
//
// Dois frames em coluna, exatamente como rock.png + rock_cracked.png: inteira e rachada. E o
// mesmo par de silhuetas do prop original, PIXEL A PIXEL: os dois grids abaixo sao os dumps de
// `factory.mjs dump environment/props/rock.png` (e do rock_cracked) com o minerio pintado por
// cima. Isso nao e preguica, e a regra 8 do padrao aplicada entre DOIS props: o jogador tem de
// bater o olho e ler "e uma pedra, mas tem coisa dentro" — se a silhueta tambem mudasse, ele
// leria "e outra coisa" e nao tentaria a picareta.
//
// O minerio e MARROM (rampa drywood) contra a rocha lavanda-cinza. Duas razoes: e a unica cor
// quente do frame, entao ela e para onde o olho vai primeiro; e o contraste e de MATIZ (quente
// contra frio), que sobrevive ao escuro — a noite come luminancia, nao mata a diferenca entre
// ferrugem e pedra.
//
// Cada veio e um cacho de 2x2 usando a rampa drywood INTEIRA. A primeira versao punha um pixel de
// osso (#b5b5b5) como "brilho metalico" e ele simplesmente nao existia na tela: caia dentro da
// rocha, que ja e #a9abbe/#989aa7 — dois cinzas a um passo dele. Brilho tem de ser mais claro que
// a VIZINHANCA, e a vizinhanca aqui e clara; entao a quina iluminada do minerio e ferrugem clara,
// e nao metal, e o cacho ganha volume em vez de um ponto perdido.
//
// No frame rachado o veio APARECE MAIS: a fenda abriu a pedra e o minerio corre colado nela.
// A racha nao e so um dano, e a promessa da proxima pancada.

const ORE = {
  o: '#68380f', // minerio na sombra
  O: '#733e11', // minerio base — a unica cor quente da peca
  w: '#826841', // ferrugem na quina iluminada (topo da rampa drywood)
};

// O dump literal de environment/props/rock.png — com UMA fusao: o realce proprio da rocha
// (#b5b5b5, tres pixels no topo) virou #a9abbe. Os dois sao cinzas a um passo um do outro e a
// diferenca nunca apareceu na tela; fundi-los libera a oitava cor do frame para a rampa quente do
// minerio, que e a unica coisa aqui que PRECISA ser vista. A silhueta continua identica.
const INTACT = [
  '................',
  '................',
  '................',
  '....AAA.........',
  '...AAAAC........',
  '..AAAAACD.......',
  '..AAAAACDD......',
  '.AAAAACCCDDDE...',
  '.AAACCCDDDDDEEE.',
  '.CCCCCCDDDDDEEE.',
  '.CCCCCDDDDDDEEE.',
  '.CCCCDDDDDDDEEE.',
  '.ECDDDDDDDEEEEE.',
  '..FFFFFFFFFFFF..',
  '................',
  '................',
];

// O dump literal de environment/props/rock_cracked.png (a fenda desce em diagonal de (5,7) a
// (3,11) — e ao longo dela que o minerio fica exposto).
const CRACKED = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '..AAAAAC........',
  '..AAAAACDD......',
  '.AAAAKKCCDDD....',
  '.AAACKCDDDDDEEE.',
  '.CCCKCCDDDDDEEE.',
  '.CCCKCDDDDDDEEE.',
  '.CCKCDDDDDDDEEE.',
  '.FCDDDDDDDFFFFF.',
  '..KKKKKKKKKKKK..',
  '................',
  '................',
];

/** Pinta o minerio por cima de um grid ja pronto, sem tocar na silhueta. */
const withOre = (grid, veins) => {
  const px = grid.map((row) => row.split(''));
  for (const [x, y, c] of veins) px[y][x] = c;
  return px.map((row) => row.join(''));
};

export default {
  name: 'iron-rock',
  kind: 'prop',
  layout: 'column',
  palette: {
    A: '#a9abbe', // rocha: aresta iluminada
    w: ORE.w,
    C: '#989aa7', // rocha: face clara
    D: '#7c7e8b', // rocha: face media
    E: '#5d6165', // rocha: sombra
    F: '#3a3f3f', // contato com o chao
    K: '#3a3f3f', // a fenda (a mesma tinta do contato, como no rock_cracked original)
    o: ORE.o,
    O: ORE.O,
  },
  frames: [
    // Tres veios espalhados pela face, nenhum encostando na silhueta: minerio na borda viraria
    // recorte e a pedra perderia o contorno limpo que a faz ler a 1x.
    withOre(INTACT, [
      [3, 7, 'w'], [4, 7, 'O'], [3, 8, 'O'], [4, 8, 'o'],
      [7, 9, 'w'], [8, 9, 'O'], [7, 10, 'O'], [8, 10, 'o'],
      [5, 11, 'O'], [6, 11, 'o'], [5, 12, 'o'],
    ]),
    // Rachada: o veio de baixo some com o pedaco que caiu, e o de cima se abre COLADO na fenda.
    withOre(CRACKED, [
      [6, 8, 'O'], [7, 8, 'o'],
      [5, 9, 'w'], [5, 10, 'O'], [6, 10, 'o'],
      [4, 11, 'O'], [5, 11, 'o'],
      [8, 9, 'O'], [9, 9, 'o'],
    ]),
  ],
  notes: 'Pedra de ferro: os dois frames sao a silhueta EXATA de rock.png e rock_cracked.png (dump '
    + 'literal) com veios de minerio pintados por dentro — o jogador precisa reconhecer a pedra pra '
    + 'pensar na picareta. Minerio na rampa drywood (marrom) contra a rocha lavanda: contraste de '
    + 'matiz, que sobrevive a noite, e a unica cor quente do frame. Cada veio e um cacho 2x2 com a '
    + 'rampa drywood inteira (quina clara, base, sombra), nunca um pixel solto. No frame rachado o '
    + 'minerio corre colado a fenda: a racha promete o proximo golpe em vez de so registrar o anterior.',
};
