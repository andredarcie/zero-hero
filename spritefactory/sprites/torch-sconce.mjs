// O SUPORTE DA TOCHA DE PAREDE — a peca que responde "o que segura essa chama?".
//
// Ate aqui a tocha da masmorra nao tinha suporte nenhum: o frame 48 do atlas trazia um graveto
// PINTADO na alvenaria e o jogo desenhava por cima dele uma fogueirinha de acampamento (o
// `sprite_fire0`, toras e tudo). Eram duas chamas no mesmo tile e zero objetos.
//
// ── Por que um COPO DE FERRO e nao um graveto ────────────────────────────────────────────────
// A tocha de parede desta masmorra queima para sempre — ela e um MARCO, e o jogador navega por
// ela. Um graveto que arde eternamente e uma promessa quebrada; um copo de ferro com piche e um
// objeto que explica a propria permanencia. E a silhueta de um copo le a 16px, a de um graveto
// atras de uma chama nao le nada.
//
// A LEITURA DO COPO SE PERDE POR SIMETRIA, e foi o que aconteceu na v2: labio largo em cima,
// placa igualmente larga embaixo e um talo fino no meio desenham uma AMPULHETA — de longe, uma
// bigorna. O copo so volta a ser copo quando a placa da parede e MENOR que o labio (uma placa
// vista de frente e pequena) e quando o DENTRO dele existe: a linha de piche queimado logo
// abaixo do labio e o que da fundo a peca, e e ela que diz ha quanto tempo isto arde.
//
// ── A fuligem e um RISCO, nunca uma pluma ────────────────────────────────────────────────────
// Duas versoes tentaram uma pluma de fumaca subindo da chama, e as duas leram como CAPUZ: uma
// mancha escura com silhueta propria por cima do fogo vira objeto, nao sujeira. A licao e que
// nao ha espaco — a chama ja ocupa os dois tercos de cima de uma parede de 16px. O que sobra e o
// que de fato existiria numa masmorra: um RISCO horizontal rente ao teto, onde a fumaca se
// espalha ao bater nele. Uma linha nao tem silhueta para ser confundida com nada.

export default {
  name: 'torch-sconce',
  kind: 'prop',
  palette: {
    N: '#1d2b53', // ink navy — o risco de fuligem no teto e o piche queimado no fundo do copo
    D: '#5d6165', // ferro na sombra (o lado direito)
    M: '#7c7e8b', // ferro
    L: '#989aa7', // ferro na luz (o lado esquerdo)
  },
  // O copo ocupa as linhas 10-14 e a chama sobe das 2 as 10 (elas se encontram no labio, linha
  // 10 — a chama nasce DENTRO do copo). Sobre a face de um cubo de um tile isso da ao fogo os
  // dois tercos de cima da parede, que e o que uma tocha de masmorra ocupa.
  frames: [[
    '................',
    '.....NNNNN......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '....LMMMMMD.....',
    '....LNNNNND.....',
    '.....LMMMD......',
    '......LMD.......',
    '.....LMMMD......',
    '................',
  ]],
  notes: 'Copo de ferro de parede — labio, piche queimado no fundo, bojo, haste e placa — mais um '
    + 'risco de fuligem rente ao teto. O copo e nao um graveto porque esta tocha queima para '
    + 'sempre e precisa explicar isso. A placa e MENOR que o labio: na v2 as duas tinham a mesma '
    + 'largura e a peca lia como ampulheta/bigorna. E a fuligem e uma LINHA e nao uma pluma: as '
    + 'duas versoes de pluma leram como capuz sobre a chama, porque uma mancha escura com '
    + 'silhueta propria por cima do fogo vira objeto em vez de sujeira.',
};
