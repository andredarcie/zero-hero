// Caixote empurravel — prop de puzzle. A silhueta quadrada precisa ser reconhecida antes do
// detalhe: aro estrutural em ink navy, face de madeira com a rampa completa e travessas em X.
// A tampa mostra uma faixa de topo iluminada, mas o objeto continua frontal o bastante para
// funcionar como billboard em qualquer ponto da camera HD-2D.

export default {
  name: 'wooden-crate',
  kind: 'prop',
  palette: {
    N: '#141d38', // contato com o chao / sombra estrutural
    K: '#1d2b53', // aro e pregos — o ink do jogo, nunca preto
    A: '#63452c', // madeira em sombra
    B: '#815938', // madeira base
    C: '#886644', // madeira recebendo luz
    L: '#b7916a', // highlight da esquerda / face superior
  },
  frames: [[
    '................',
    '................',
    '....LLLLLLLL....',
    '...LCCCCCCBBA...',
    '..KLLLLLLLLLLK..',
    '..KCCBBBBBBAAK..',
    '..KLLBBBBBBLLK..',
    '..KCLLBBBBLLAK..',
    '..KCBLLBBLLBAK..',
    '..KCBBLLLLBBAK..',
    '..KCBBLLLLBBAK..',
    '..KCBLLBBLLBAK..',
    '..KCLLBBBBLLAK..',
    '..NNNNNNNNNNNN..',
    '................',
    '................',
  ]],
  notes: 'Caixote v1 para puzzle walk-only. Usa toda a rampa wood para volume; luz da esquerda; '
    + 'tampa em cluster claro, lado direito em sombra, travessas em X com alternancia claro/escuro '
    + 'para passarem por cima das tabuas sem virar uma mancha; aro em ink navy e linha inferior '
    + 'ink-dark ancoram o peso. Margem de 2px respeita o tile 16x16 e deixa o prop respirar.',
};
