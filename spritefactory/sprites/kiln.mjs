// O FORNO DA VEGA — fixo, ao lado da nave, e por isso precisa ser bonito (pedido do autor). Substitui a
// arte do forno de alvenaria (environment/props/furnace.png): o jogador não constrói mais forno, este é
// o único do vale, e ele é o GUIA da quest (pede o próximo item, devolve o resultado).
//
// A forma: uma CÚPULA de pedras assentadas com argamassa (cada pedra é um cluster de luz, sombra e
// junta, luz da esquerda), a BOCA em arco embaixo, uma CHAMINÉ de tijolo no topo e uma pilha de LENHA
// encostada à direita — o que diz "aqui se faz fogo" antes de qualquer brasa. A última linha escura
// ancora o forno no chão.
//
// Dois frames, como o forno antigo (FurnaceObject usa 0 = frio, 1 = aceso): aceso, a boca vira fogo em
// camadas (brasa funda embaixo, chama no meio, miolo amarelo), as pedras da beira da boca pegam o
// reflexo laranja e a chaminé solta um pixel de brasa.

const COLD = [
  '................',
  '.......KK.......',
  '......KccK......',
  '......KcCK......',
  '.....KKccKK.....',
  '....KLLMMMDK....',
  '...KLAkMMkMDK...',
  '..KLLMMkMMMDDK..',
  '..KLkMMMMkMDDK..',
  '.KLLMMNNNNMMDDK.',
  '.KLMMNNNNNNMDDK.',
  '.KLkMNNNNNNMkDK.',
  '.KLMMNNNNNNMDDKw',
  '.KKKKNNNNNNKKKWw',
  '..SSSSSSSSSSSSww',
  '................',
];

// Aceso: a boca em fogo, a beira da boca refletindo laranja (o), brasa na chaminé
const LIT = [
  '................',
  '.......EK.......',
  '......KccK......',
  '......KcCK......',
  '.....KKccKK.....',
  '....KLLMMMDK....',
  '...KLAkMMkMDK...',
  '..KLLMMkMMMDDK..',
  '..KLkMMMMkMDDK..',
  '.KLLMooooMMDDK..',
  '.KLMoeeeeeoMDDK.',
  '.KLkoeEEEEeokDK.',
  '.KLMoEGYYGEoDDKw',
  '.KKKKeEGGEeKKKWw',
  '..SSSSSSSSSSSSww',
  '................',
];

export default {
  name: 'kiln',
  kind: 'prop',
  layout: 'row',
  frames: [COLD, LIT],
  palette: {
    K: '#1d2b53', // ink: contorno da sombra, juntas fundas
    N: '#141d38', // a boca fria, o escuro de dentro
    S: '#141d38', // a linha de chão que ancora
    L: '#989aa7', A: '#989aa7', // pedra na luz
    M: '#7c7e8b', // pedra base
    D: '#5d6165', k: '#5d6165', // pedra na sombra e a junta de argamassa
    c: '#826841', w: '#826841', // tijolo da chaminé e a casca da lenha (o mesmo barro seco)
    C: '#733e11', W: '#733e11', // tijolo na sombra e a ponta da tora
    o: '#a53030', e: '#a53030', // o reflexo do fogo na beira da boca é a própria brasa
    E: '#e7462a', // chama
    G: '#f8e394', Y: '#f8e394', // o miolo
  },

  notes: 'O forno fixo da Vega: cúpula de pedras com argamassa, boca em arco, chaminé de tijolo e lenha '
    + 'encostada. Frame 0 frio, frame 1 aceso. Substitui environment/props/furnace.png.',
};
