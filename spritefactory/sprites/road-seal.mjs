// O SELO DA ESTRADA — o lugar onde se compra o próximo pedaço do mundo.
//
// Ele era a arte da PLACA DE PRESSÃO com um banho de cor por cima: a peça mais parecida que
// existia, pintada de dourado quando dava para comprar e de cinza quando não. Isso é errado de
// duas maneiras ao mesmo tempo. Visualmente é um botão de máquina largado no meio do mato — nada
// no desenho diz "aqui termina a estrada e começa a terra de ninguém". E na gramática do jogo é
// pior: placa de pressão é uma peça de circuito, e reusar a arte dela ensina que este tile é uma
// máquina que alguém pode ligar. Ele não é.
//
// ── O que ele é: um SELO DE RUNAS ───────────────────────────────────────────────────────────────
// A primeira versão desta reforma desenhou uma pedra de limite cinza com uma moeda gravada — certa
// na leitura ("marco de fronteira") e errada no gênero: ficou uma tampa de bueiro dourada. O que
// este tile faz não tem explicação mundana. Ele faz um pedaço de mundo NASCER do escuro, o que é
// magia, e magia neste jogo é ROXA (a mortalha dos chunks não comprados, o gato, a flor da lua).
//
// Então ele é um disco de pedra violeta com uma runa em cruz gravada — a bússola do lugar, as
// quatro estradas que saem dali. Dormente, a runa é um sulco escuro na pedra fria. Desperta, ela
// ACENDE em orquídea com um núcleo branco, e o runtime põe um halo violeta respirando por baixo
// (ver ChunkGateMarker).
//
// ── As três decisões ────────────────────────────────────────────────────────────────────────────
//  1. É UM DISCO, e não um quadrado. Quadrado a 16px lê como azulejo ou como botão; o disco lê
//     como coisa POSTA, e a borda de ink separa a laje do chão sem precisar de sombra.
//  2. A MARCA É UMA CRUZ DE BRAÇOS SEPARADOS, não um símbolo qualquer: ela é as quatro estradas
//     que nascem de um chunk. A silhueta é simétrica, que é o que o olho lê como FEITIÇO em vez
//     de como sujeira na pedra.
//  3. OS DOIS ESTADOS SÃO A MESMA PEDRA COM LUZ DIFERENTE, nunca duas silhuetas — trocar a forma
//     faria o selo piscar de objeto no instante em que o jogador junta a moeda que faltava. E o
//     miolo aceso tem DOIS pixels de branco só: o mundo é iluminado por fogueira e passa por
//     bloom, e uma runa toda clara vira um ovo chapado (foi o que a versão dourada virou).
//
// Frame 0 = dormente, frame 1 = desperto. Luz da casa: vem de cima-esquerda, sombra chapada.

export default {
  name: 'road-seal',
  kind: 'prop',
  palette: {
    K: '#1d2b53', // ink navy — o rebaixo da laje contra o chão
    N: '#39228b', // violeta profundo — a pedra na sombra, e o sulco da runa apagada
    P: '#472ca9', // violeta base — o corpo da laje
    Q: '#882c98', // violeta claro — o quadrante que pega luz
    S: '#a9abbe', // cinza-lavanda: a QUINA POLIDA de cima-esquerda. É a única cor clara da pedra,
    //              e ela existe porque violeta sozinho não tem escada de valor — a laje saía
    //              chapada, e uma pedra chapada não parece pedra.
    R: '#af3fc3', // orquídea — a runa ACESA
    W: '#f4f4f4', // o núcleo do feitiço: dois pixels, e só no estado desperto
  },
  frames: [
    // ── 0. DORMENTE: a runa é um sulco escuro na pedra fria ─────────────────────────────────
    [
      '................',
      '.....KKKKKK.....',
      '...KKSSSSQQKK...',
      '..KSSPPPPPPQQK..',
      '.KSPPPPNNPPPPQK.',
      '.KSPPPPNNPPPPQK.',
      'KSPPPPPNNPPPPPQK',
      'KSPNNPNNNNPNNPQK',
      'KSPNNPNNNNPNNPNK',
      'KQPPPPPNNPPPPPNK',
      '.KQPPPPNNPPPPNK.',
      '.KQPPPPNNPPPPNK.',
      '..KQPPPPPPPPNK..',
      '...KKQPPPPNNK...',
      '.....KKKKKK.....',
      '................',
    ],
    // ── 1. DESPERTO: a MESMA pedra, e a runa acesa ──────────────────────────────────────────
    [
      '................',
      '.....KKKKKK.....',
      '...KKSSSSQQKK...',
      '..KSSPPPPPPQQK..',
      '.KSPPPPRRPPPPQK.',
      '.KSPPPPRRPPPPQK.',
      'KSPPPPPRRPPPPPQK',
      'KSPRRPRWWRPRRPQK',
      'KSPRRPRWWRPRRPNK',
      'KQPPPPPRRPPPPPNK',
      '.KQPPPPRRPPPPNK.',
      '.KQPPPPRRPPPPNK.',
      '..KQPPPPPPPPNK..',
      '...KKQPPPPNNK...',
      '.....KKKKKK.....',
      '................',
    ],
  ],
};
