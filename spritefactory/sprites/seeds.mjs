// Sementes de mato — o produto da foice. Um punhado de graos pequenos cor de palha, em monte baixo,
// com um germe verde num deles: o dourado cheio de antes lia como pepitas.
// Ancoras de estilo: wood_icon (item pequeno, silhueta legivel), rock (luz esquerda dura).

export default {
  name: 'seeds',
  kind: 'item',
  palette: {
    H: '#ccbd99', // a luz do grao, em cima e a esquerda
    B: '#b48c63', // a casca
    S: '#815938', // a sombra do grao
    D: '#63452c', // o escuro entre os graos, que os separa
    G: '#8a8d49', // o germe
  },
  frames: [[
    '................',
    '................',
    '................',
    '................',
    '..........G.....',
    '.........GG.....',
    '.....HB...BH....',
    '....HBBS.HBBS...',
    '....BBSSDBBSS...',
    '..HB.SSDHB.SSD..',
    '.HBBS..HBBS.....',
    '.BBSSD.BBSSD....',
    '..SSD...SSD.....',
    '................',
    '................',
    '................',
  ]],
  notes: 'Quatro graos em monte, cada um com luz NW, casca e sombra SE. Cor de palha para nao competir '
    + 'com as flores; o germe verde diz "isto brota".',
};
