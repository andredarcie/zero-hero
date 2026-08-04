// A TEIA — o rastro que a aranha deixa por onde passa.
//
// Ela e a unica especie do bestiario que nao deixava NADA no mundo. A caveira racha o chao e deixa
// ossada, a gosma deixa a poca que seca, o zora abre esteira na agua — e a aranha, que e o corpo
// mais movel do jogo (o bote atravessa cinco tiles em 360ms), passava sem marca nenhuma. O jogador
// nao tinha como saber que aquele corredor tem aranha antes de uma pular nele.
//
// ── O QUE ELA DIZ, E O QUE ELA NAO FAZ ─────────────────────────────────────
//
// Ela e LEITURA, nao trava: nao bloqueia, nao prende, nao fere. E um rastro — "passou coisa por
// aqui" —, e a informacao esta em quantas ha e quao juntas: uma teia solta e uma aranha que
// cruzou, um punhado no mesmo corredor e uma que MORA ali. Nenhuma legenda diz isso e nenhuma
// precisa, que e a lei da casa.
//
// ── A FORMA, E AS DUAS QUE FORAM DESCARTADAS ───────────────────────────────
//
// Uma teia ORBICULAR: dois aneis concentricos claros com os raios escuros por baixo. A geometria
// nao foi desenhada a mao — foi gerada (raios de 45 em 45 graus, arcos em r=3,4 e r=6,0) e depois
// congelada aqui, porque simetria radial e a unica coisa que um olho reconhece como teia a 16
// pixels, e mao livre nao acerta simetria nessa escala.
//
// A primeira tentativa foi uma teia de CANTO — dois fios ancorados e arcos entre eles. Ela lia
// como duas diagonais paralelas, porque sem o centro nao ha nada dizendo que aquilo e radial. A
// segunda foi a mesma coisa com mais fios, e virou um borrao. O que faz uma teia ser uma teia sao
// os ANEIS: os raios sozinhos sao um asterisco, e os aneis sozinhos sao um alvo — juntos, e teia.
//
// E ela e CENTRADA e nao ancorada num canto de propósito: uma teia de canto pressupoe um vao onde
// se prender, e esta cai em chao aberto, onde nao ha canto nenhum.
//
// Ela e PALIDA (#cdcdcd sobre #858585) para ler no chao escuro sem virar um objeto: teia e quase
// branca no mundo real, e aqui ela e a coisa mais clara de um mundo noturno — o que a faz ser
// notada de longe justamente como um aviso deve ser.

export default {
  name: 'spider-web',
  kind: 'prop',
  palette: {
    L: '#cdcdcd', // o fio na luz — a face de cima de cada arco
    D: '#858585', // o fio na sombra, e as ancoras
  },
  // Os fios diagonais sao 1px e se tocam pelo CANTO, entao o linter os conta como pixels orfaos.
  // Sao pontas de fio, que e literalmente o caso que a valvula existe para cobrir: seda arrastada
  // termina em fio solto, e engrossar as pontas para calar o aviso transformaria os fios em riscos.
  allowOrphans: true,
  frames: [[
    '................',
    '................',
    '.......L........',
    '.......L........',
    '.......L....L...',
    '...LL..L...L....',
    '.....LLL..L.....',
    '.......LLLLLLL..',
    '..LLLLLLLLLD....',
    '..DD..L.L..LL...',
    '.....L..L.......',
    '....L...L.......',
    '........L.......',
    '........LD......',
    '................',
    '................',
  ]],
  notes: 'Um EMARANHADO de seda 16x16, deitado no chao onde a aranha passou — nao uma teia '
    + 'orbicular. Tres tentativas de orbe foram descartadas antes: de canto, os fios leem como '
    + 'diagonais paralelas; centrada com aneis grossos, le como ALVO; e com raios finos, o '
    + 'arredondamento quebra cada raio num tracejado. E a forma orbicular era errada de qualquer '
    + 'modo — uma aranha ANDANDO nao fia um orbe, ela arrasta seda. Os fios sao cordas continuas '
    + '(Bresenham, nada de buraco de arredondamento) cruzando perto do centro: no denso no meio, '
    + 'pontas abrindo, assimetrico de proposito. Palido (a coisa mais clara de um mundo noturno) '
    + 'porque ele e o aviso de que aquele corredor tem aranha.',
};
