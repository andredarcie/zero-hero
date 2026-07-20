// Caldeira a vapor — o terceiro gerador, o que come FOGO e bebe AGUA. Ancoras de estilo:
// barrel.png (o cilindro com aros de ink e banda de brilho ~20% pra dentro da borda iluminada),
// water-wheel (o dinamo de pedra com a lampada verde da placa — a MESMA gramatica de "circuito
// fechou"), rock.png (a fornalha embaixo: luz/sombra chapada com aresta dura). Luz da esquerda.
//
// CINCO frames, micro-variacao pura (a silhueta nunca muda — so boca, visor e lampada):
//   0 = fria e SECA      (boca morta, visor vazio, lampada apagada)
//   1 = fria com AGUA    (visor azul — o tanque esta cheio, falta fogo)
//   2 = acesa e SECA     (brasas na boca, visor vazio — fogo embaixo de tanque vazio nao gera)
//   3 = acesa com AGUA   (brasas + visor azul: fervendo, a pressao esta subindo)
//   4 = GERANDO          (brasas + agua + lampada verde)
//
// O VISOR DE NIVEL e o indicador de "precisa de agua": uma janelinha K+glass na base do tanque,
// vazia (ink escuro) quando seca, agua azul quando cheia — o mesmo par de leitura da lampada.

// A borda direita do tanque sombreia DENTRO da rampa stone (s), nunca em ink — o ink fica
// para estrutura (aros, molduras, contato) e para os DOIS vazios que pedem item: a boca fria
// (pede fogo) e o visor seco (pede agua). E o que mantem o stone dominante e cada frame <=8.
const T = (lamp, glass, mouthA, mouthB) => [
  '................',
  '.....KK.........',
  '.....Hs.........',
  '.....Hs.........',
  '.....HSSSs......',
  '....KKKKKKKK....',
  '....SHHSSsss....',
  `....SHHK${lamp}sss....`,
  `....SHHK${lamp}sss....`,
  '....KKKKKKKK....',
  `....SHHK${glass}sss....`,
  '...sSSSSSssss...',
  `...sK${mouthA}Kss...`,
  `...sK${mouthB}Kss...`,
  '...KKKKKKKKKK...',
  '................',
];

const DEAD_A = 'kkkkk';
const DEAD_B = 'ksksk';
const FIRE_A = 'RERER';
const FIRE_B = 'ERERE';

export default {
  name: 'boiler',
  kind: 'prop',
  layout: 'row',
  palette: {
    K: '#1d2b53', // ink — aros, moldura da boca/visor/lampada, contato com o chao
    k: '#141d38', // ink escuro — cavidade morta da fornalha e visor VAZIO
    s: '#5d6165', // stone escura — lado da sombra
    S: '#7c7e8b', // stone media — massa do tanque e da fornalha
    H: '#989aa7', // stone clara — banda de brilho e aresta sob a luz
    R: '#a53030', // ember escuro — carvao em brasa
    E: '#e7462a', // ember vivo — o coracao do fogo
    G: '#7dde99', // lampada de energia (o verde ativo da placa e da roda)
    W: '#27a9af', // agua no visor (a rampa water do rio)
  },
  frames: [
    T('s', 'k', DEAD_A, DEAD_B), // 0 coldDry
    T('s', 'W', DEAD_A, DEAD_B), // 1 coldWet
    T('s', 'k', FIRE_A, FIRE_B), // 2 hotDry
    T('s', 'W', FIRE_A, FIRE_B), // 3 hotWet
    T('G', 'W', FIRE_A, FIRE_B), // 4 on
  ],
  notes: 'Caldeira em cinco estados por micro-variacao (boca da fornalha, visor de agua e lampada '
    + '— a silhueta nunca muda). Tanque cilindrico na rampa stone com aros de ink navy (a '
    + 'linguagem do barril no metal), banda de brilho H a ~20% da borda iluminada, chamine a '
    + 'esquerda, fornalha de pedra mais larga assentando no chao, contato inteiro em ink. Brasas '
    + 'na rampa ember em xadrez; lampada 2x2 K+G do dinamo da roda; visor de nivel K+agua da '
    + 'rampa water do rio — vazio ele e o pedido visual de agua, como a boca fria e o de fogo.',
};
