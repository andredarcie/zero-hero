// O BLOCO DE FERRO — o produto da pedra de ferro, e o segundo material bruto do jogo.
//
// Ele tem UM trabalho na tela: nao ser confundido com a pedra. A `stone` usa a arte do proprio
// rock.png — um calhau redondo, palido e frio. Entao o ferro e o oposto em tudo que o olho ve a
// 16px: silhueta ANGULAR (um bloco fundido, base larga e topo chanfrado, com aresta reta em vez
// de contorno bolhudo), e ferrugem quente encravada no metal. Redondo e frio = pedra; anguloso e
// quente = ferro. Isso tem de funcionar tambem nas duas bandejas da caixa de ferramentas, onde os
// dois ficam lado a lado a meio tile de distancia.
//
// A ferrugem e a MESMA rampa drywood dos veios de iron-rock.png, de proposito: e o fio que liga o
// item a pedra de onde ele saiu, sem nenhuma legenda dizendo isso.

export default {
  name: 'iron',
  kind: 'item',
  palette: {
    N: '#141d38', // contato com o chao
    K: '#1d2b53', // ink — a aresta do bloco
    D: '#5d6165', // metal na sombra (lado direito)
    M: '#7c7e8b', // metal base
    L: '#989aa7', // metal recebendo a luz da esquerda
    A: '#a9abbe', // a face de cima, chanfrada
    o: '#68380f', // ferrugem na sombra
    O: '#733e11', // ferrugem — a mesma do minerio na pedra
  },
  // A GRAMATICA DE CAIXA DA CASA, a mesma do wooden-crate: faixa de topo iluminada sem contorno
  // por cima, uma aresta horizontal dura separando topo e frente, e laterais VERTICAIS retas.
  //
  // Duas tentativas anteriores morreram tentando ser um lingote trapezoidal. O chanfro em escada
  // de 45 graus com o ink por cima nao le como trapezio a 16px — le como CURVA, e o bloco virava
  // um domo, exatamente a silhueta da pedra de que ele precisa se separar. O que separa de
  // verdade nao e a inclinacao, e o CANTO RETO: pedra nao tem aresta.
  //
  // A ferrugem sao dois riscos na diagonal, nunca dois quadrados simetricos: a 16px, duas manchas
  // escuras pareadas no meio de uma forma clara nao leem como minerio, leem como OLHOS.
  frames: [[
    '................',
    '................',
    '................',
    '................',
    '....AAAAAAAA....',
    '...AAAAAAAAAA...',
    '..KLLLLLLLLLLK..',
    '..KLLLLLLMMMDK..',
    '..KLOOLLLMMMDK..',
    '..KLLOLLMMMMDK..',
    '..KLLLLMMMMMDK..',
    '..KLLMMMOOMMDK..',
    '..KLMMMMMMoMDK..',
    '..KDDDDDDDDDDK..',
    '..NNNNNNNNNNNN..',
    '................',
  ]],
  notes: 'Bloco de ferro 16x16: trapezio de base larga com topo chanfrado — silhueta ANGULAR pra '
    + 'nunca ser lido como a pedra (que e a arte redonda do rock.png). Metal na rampa stone inteira '
    + 'com luz dura da esquerda: face de cima em a9abbe, lado esquerdo claro, lado direito em '
    + 'sombra, aresta em ink navy e a ultima linha escura ancorando no chao. Duas manchas de '
    + 'ferrugem na rampa drywood, as MESMAS dos veios de iron-rock.png — e o unico elo visual entre '
    + 'o item e a pedra de onde ele saiu.',
};
