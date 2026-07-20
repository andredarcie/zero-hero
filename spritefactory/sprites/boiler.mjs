// Caldeira a vapor — o terceiro gerador, o que come FOGO. Ancoras de estilo: barrel.png (o
// cilindro com aros de ink e banda de brilho ~20% pra dentro da borda iluminada), water-wheel
// (o dinamo de pedra com a lampada verde da placa — a MESMA gramatica de "circuito fechou"),
// rock.png (a fornalha embaixo: luz/sombra chapada com aresta dura). Luz da esquerda, como tudo.
//
// Tres frames, micro-variacao pura (a silhueta nunca muda):
//   0 = fria (boca morta, lampada apagada)
//   1 = fornalha ACESA (brasas ember na boca — o termometro que se le de longe)
//   2 = GERANDO (brasas + lampada verde)

export default {
  name: 'boiler',
  kind: 'prop',
  layout: 'row',
  palette: {
    K: '#1d2b53', // ink — aros, moldura da boca, contato com o chao
    k: '#141d38', // ink escuro — cavidade morta da fornalha
    s: '#5d6165', // stone escura — lado da sombra
    S: '#7c7e8b', // stone media — massa do tanque e da fornalha
    H: '#989aa7', // stone clara — banda de brilho e aresta sob a luz
    R: '#a53030', // ember escuro — carvao em brasa
    E: '#e7462a', // ember vivo — o coracao do fogo
    G: '#7dde99', // lampada de energia (o verde ativo da placa e da roda)
  },
  frames: [
    [
      '................',
      '.....KK.........',
      '.....Hs.........',
      '.....Hs.........',
      '.....HSSSs......',
      '....KKKKKKKK....',
      '....SHHSSssk....',
      '....SHHKsssk....',
      '....SHHKsssk....',
      '....KKKKKKKK....',
      '....SHHSSssk....',
      '...sSSSSSsssk...',
      '...sKkkkkkKsk...',
      '...sKkskskKsk...',
      '...KKKKKKKKKK...',
      '................',
    ],
    [
      '................',
      '.....KK.........',
      '.....Hs.........',
      '.....Hs.........',
      '.....HSSSs......',
      '....KKKKKKKK....',
      '....SHHSSssk....',
      '....SHHKsssk....',
      '....SHHKsssk....',
      '....KKKKKKKK....',
      '....SHHSSssk....',
      '...sSSSSSsssk...',
      '...sKRERERKsk...',
      '...sKEREREKsk...',
      '...KKKKKKKKKK...',
      '................',
    ],
    [
      '................',
      '.....KK.........',
      '.....Hs.........',
      '.....Hs.........',
      '.....HSSSs......',
      '....KKKKKKKK....',
      '....SHHSSssk....',
      '....SHHKGssk....',
      '....SHHKGssk....',
      '....KKKKKKKK....',
      '....SHHSSssk....',
      '...sSSSSSsssk...',
      '...sKRERERKsk...',
      '...sKEREREKsk...',
      '...KKKKKKKKKK...',
      '................',
    ],
  ],
  notes: 'Caldeira em tres estados por micro-variacao (so a boca da fornalha e a lampada mudam). '
    + 'Tanque cilindrico na rampa stone com aros de ink navy (a linguagem do barril aplicada ao '
    + 'metal), banda de brilho H a ~20% da borda iluminada, chamine deslocada a esquerda, fornalha '
    + 'de pedra mais larga que o tanque para assentar no chao, contato inteiro em ink. Brasas na '
    + 'rampa ember em xadrez (speckle organico), lampada 2x2 K+G identica a do dinamo da roda.',
};
