// OS PEDACOS — no que a caveira se parte ao morrer.
//
// Ela desmanchava com o gesto generico do `EnemyBase`: incha um pouco e some girando. Serve pra
// qualquer corpo justamente porque nao diz nada sobre nenhum — e num bestiario onde a gosma tem
// poca propria e o zora afunda, a especie mais vista do jogo era a que morria com menos frase.
//
// Um esqueleto tem a morte mais obvia que existe: ele DESMONTA. Entao a morte dela e a silhueta
// se partindo nas pecas que o jogador ja reconhece — a cabeca sai voando e os ossos se espalham.
//
// SAO DUAS FRAMES AQUI, e nao quatro, porque a terceira peca ja existe: o femur que ela empunha
// (`undead-bone`). O esqueleto se desmonta nos mesmos ossos com que batia, e essa rima sai de
// graca — nenhum pixel novo, e uma leitura a mais.
//
// As duas sao pequenas dentro do frame de proposito: elas voam a ~0,35 tile, e uma peca precisa
// ser menor que o corpo de onde saiu ou nao le como peca.

export default {
  name: 'undead-bits',
  kind: 'effect',
  layout: 'row',
  palette: {
    L: '#cdcdcd', // osso na luz
    B: '#b5b5b5', // osso base — o tom do corpo da caveira
    D: '#858585', // osso na sombra
    K: '#1d2b53', // ink navy — as orbitas vazias
  },
  frames: [
    // [0] A CABECA — a peca que o olho segue, e por isso a unica que precisa ser inconfundivel.
    //
    // As orbitas sao ink navy, e nao o #a53030 dos olhos do corpo vivo. E o instante em que a luz
    // que animava aquilo apaga — a unica coisa que este jogo tinha a dizer sobre a morte de um
    // morto-vivo, e ela cabe em quatro pixels. A ossada que fica no chao depois (a arte autorada do
    // jogo, "Caveira e Ossos") diz a mesma coisa com as orbitas escuras dela: a peca que voa e a
    // que assenta contam a mesma historia, cada uma na propria arte.
    [
      '................',
      '................',
      '................',
      '.....DDDDDD.....',
      '....DLLLLLLD....',
      '...DLLLLLLLLD...',
      '...DLKKLLKKLD...',
      '...DLKKLLKKLD...',
      '...DLLLLLLLLD...',
      '....DLLKKLLD....',
      '....DBBBBBBD....',
      '.....DKBBKD.....',
      '......DDDD......',
      '................',
      '................',
      '................',
    ],
    // [1] O OSSO QUEBRADO — um no so, e a outra ponta PARTIDA.
    //
    // A primeira tentativa foi o mesmo femur encurtado, e nao funcionou: com a haste espremida a
    // dois pixels os dois nos colam e a silhueta vira um X gordo — um borrao, nao um osso. O que
    // separa uma peca de uma versao pequena da arma nao e o tamanho, e a QUEBRA: com um no de um
    // lado e um toco irregular do outro, ela le como pedaco em qualquer angulo, que e o que ela
    // precisa fazer enquanto gira no ar.
    [
      '................',
      '................',
      '................',
      '.....LL..LL.....',
      '....LBBLLBBD....',
      '....LBBBBBBD....',
      '.....LBBBBD.....',
      '......LBBD......',
      '......LBBD......',
      '......LBBD......',
      '......DBBD......',
      '.......DD.......',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
  notes: 'Duas pecas do desmonte da caveira, 16x16 cada, empilhadas em linha: [0] a cabeca (o '
    + 'MESMO cranio da ossada de chao, para a peca que voa e a que assenta serem a mesma coisa) e '
    + '[1] um toco de osso (o femur de undead-bone quebrado curto — mesma gramatica, proporcao '
    + 'oposta). A terceira peca do desmonte e o proprio femur inteiro, que ja existe como a arma '
    + 'dela: o esqueleto se parte nos mesmos ossos com que batia. Orbitas em ink navy e nao no '
    + '#a53030 dos olhos vivos — e o instante em que a luz apaga.',
};
