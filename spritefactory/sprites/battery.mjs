// Bateria — o VASO PORTATIL da eletricidade, fechando o triangulo dos elementos: o graveto
// carrega fogo, o balde carrega agua, a bateria carrega corrente. Ancoras de estilo: a arte
// do balde (o recipiente com dois estados, vazio/cheio), o cabo de energia (o nucleo gold e a
// leitura de "corrente viva") e o visor da caldeira (janela K + conteudo = o par vazio/cheio).
//
// DOIS frames em linha, micro-variacao pura: so a JANELA muda.
//   0 = vazia (janela em ink escuro — o pedido visual de carga)
//   1 = carregada (a energia gold visivel dentro, com o miolo claro)
//
// Canister de ferro na rampa stone com tampas de ink, luz da esquerda como tudo; o borne no
// topo diz "eletrico" a 1x. Item de mao: flutua centrado com folga no tile.

const T = (w1, w2, w3, w4, w5) => [
  '................',
  '.......KK.......',
  '.....KKKKKK.....',
  '.....HSSSss.....',
  '.....HSKKss.....',
  `.....HS${w1}ss.....`,
  `.....HS${w2}ss.....`,
  `.....HS${w3}ss.....`,
  `.....HS${w4}ss.....`,
  `.....HS${w5}ss.....`,
  '.....HSKKss.....',
  '.....HSSSss.....',
  '.....KKKKKK.....',
  '................',
  '................',
  '................',
];

export default {
  name: 'battery',
  kind: 'item',
  layout: 'row',
  palette: {
    K: '#1d2b53', // ink — tampas, borne e moldura da janela
    k: '#141d38', // ink escuro — a janela VAZIA (o mesmo escuro do visor seco da caldeira)
    s: '#5d6165', // stone escura — lado da sombra do canister
    S: '#7c7e8b', // stone media — corpo
    H: '#989aa7', // stone clara — aresta sob a luz da esquerda
    g: '#f1cc36', // gold — a corrente dentro da janela (o nucleo do cabo)
    Y: '#f8e394', // gold claro — o miolo quente da carga
  },
  frames: [
    T('kk', 'kk', 'kk', 'kk', 'kk'), // 0 vazia
    T('gY', 'Yg', 'gY', 'Yg', 'gg'), // 1 carregada
  ],
  notes: 'Bateria em dois estados por micro-variacao (so a janela muda, como o balde vazio/cheio '
    + 'e o visor da caldeira). Canister stone com tampas e borne em ink navy, aresta H sob a luz '
    + 'da esquerda; a janela K emoldura ou o vazio ink escuro (pedido de carga) ou a corrente na '
    + 'rampa gold oficial do cabo, em xadrez com miolo claro. Item de mao: centrado com folga.',
};
