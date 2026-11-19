// A DECORAÇÃO DA PRAIA DO NORTE (pedido do autor, 2026-11-19: a praia de fora a fora, "com alta qualidade de pixel
// art"). Nove peças rasteiras, no padrão da decoração do atlas (biome-decor.mjs): elementos pequenos agrupados com
// respiro no tile, duas ou três cores por elemento, luz da esquerda, sombra de ardósia no pé, alpha binário. Toda cor
// sai do forest_tile_set.png.
//
//   0 CAPIM-DA-PRAIA    três touceiras de fio comprido e arqueado, deitado pelo vento para leste
//   1 AVEIA-DO-MAR      o capim alto da duna, com a espiga de palha caindo da ponta
//   2 SALSA-DA-PRAIA    a rama rasteira de folha redonda e flor lilás (a ipomeia das dunas)
//   3 CONCHAS           um búzio com a boca alaranjada e uma vieira
//   4 ESTRELA-DO-MAR    cinco braços, laranja, e uma conchinha ao lado
//   5 MADEIRA DO MAR    um galho branqueado pelo sal, com a forquilha e os nós
//   6 COCOS             um coco inteiro e um partido, com a polpa à mostra
//   7 PEDRAS DA MARÉ    dois seixos rolados, na pedra da serra
//   8 SARGAÇO           a alga que a maré deixou, com as boias claras
//
// OS DOIS CAPINS SÃO FIOS (render3d/grassBlades.ts): cada risco tem um pé escuro (a ardósia) e toda corrida de coluna
// encosta na vizinha que desce mais, então o jogo os põe de pé fio a fio, cada um no seu lugar do chão. O resto fica em
// pé como peça inteira; a salsa balança, o que é duro fica parado.
//
//   node spritefactory/factory.mjs build beach-decor
//   node spritefactory/install-tile.mjs beach-decor environment/tilesets/forest_tile_set.png 145

const S = '#3a3f3f';

export default {
  name: 'beach-decor',
  kind: 'prop',
  layout: 'row',
  frames: [
    // 0 CAPIM-DA-PRAIA
    [
      '................',
      '................',
      '......L.........',
      '.....L....L.....',
      '.....M...L..L...',
      '..L..M...M..M...',
      '..M.M...M...M.L.',
      '..M.M...M..M..M.',
      '.M..M..M...M..M.',
      '.M.M...M..M..M..',
      '.D.M...D..M..D..',
      '.S.D...S..D..S..',
      '...S......S.....',
      '................',
      '................',
      '................',
    ],
    // 1 AVEIA-DO-MAR
    [
      '................',
      '....T....TT.....',
      '...TT....TT...T.',
      '...TM.....TM.TT.',
      '....M......M.TM.',
      '....M......M..M.',
      '...M...M...M..M.',
      '...M...M..M...M.',
      '...M..M...M..M..',
      '...D..M...D..M..',
      '...S..D...S..D..',
      '......S......S..',
      '................',
      '................',
      '................',
      '................',
    ],
    // 2 SALSA-DA-PRAIA
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '....VV..........',
      '...VYVv....gG...',
      '..gGvv..gG.GVV..',
      '.gGGg.gGGgGVYVv.',
      '..gg.gGGg.gGvv..',
      '...S..gg...gg...',
      '.......S....S...',
      '................',
      '................',
      '................',
      '................',
    ],
    // 3 CONCHAS
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '.....WW.........',
      '....WwWw........',
      '...WwWwOO...WW..',
      '....wwOO...WwwW.',
      '.....SSS....wWw.',
      '.............SS.',
      '................',
      '................',
      '................',
      '................',
    ],
    // 4 ESTRELA-DO-MAR
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '......O.........',
      '......Oe........',
      '..OOeOOOeOO.....',
      '...eeOYOee......',
      '....OOeOO...Ww..',
      '...Oe...eO...S..',
      '...S.....S......',
      '................',
      '................',
      '................',
      '................',
    ],
    // 5 MADEIRA DO MAR
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '..........b.....',
      '.........Bb.....',
      '..B.....Bb......',
      '.BBbBBBBbBBBb...',
      '..bbbSbbbbbSbb..',
      '...SSSSSSSSSS...',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    // 6 COCOS
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '....pp..........',
      '...pPPp....pp...',
      '...PPcp...pWWp..',
      '...pPpp...pWwp..',
      '....SSS....pp...',
      '...........SS...',
      '................',
      '................',
      '................',
      '................',
    ],
    // 7 PEDRAS DA MARÉ
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '.....rr.........',
      '....rRRr....rr..',
      '...rRRqRr..rRRr.',
      '...qRrRRq..qRrq.',
      '....qqqq....qq..',
      '....SSSS....SS..',
      '................',
      '................',
      '................',
      '................',
    ],
    // 8 SARGAÇO
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '....n..n........',
      '..nNnnNn.n...n..',
      '.nNdNNdNNnn.nNn.',
      '..ndnnNdnn...n..',
      '...SSSSSS.......',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
  // Uma letra, uma cor, no sheet inteiro. Tudo do forest_tile_set.png (dump: `node spritefactory/factory.mjs palette`).
  palette: {
    S,
    L: '#8a8d49', M: '#626439', D: '#4d4f2c', // os capins: a oliva da casa (o bioma troca a rampa dela)
    T: '#d9b453', // a espiga da aveia-do-mar: a palha do trigo
    G: '#8a8d49', g: '#626439', // a folha da salsa
    V: '#a884f3', v: '#8d6cd1', // a flor: o lilás das florzinhas do tileset
    Y: '#f2d36b', // o miolo da flor e o da estrela
    W: '#e3dad1', w: '#d4c2b1', // concha e polpa de coco: o osso quente do tileset
    O: '#e8964a', e: '#875717', // a estrela e a boca do búzio: o laranja da fruta do pinheiro e o ocre escuro
    B: '#8e897d', b: '#7b776d', // a madeira branqueada: a pedra clara do calçamento (os nós são a ardósia do pé)
    P: '#815938', p: '#63452c', c: '#b7916a', // o coco: a madeira da casa
    R: '#82837d', r: '#6c6f6c', q: '#434748', // os seixos: a rocha da serra
    N: '#39571c', n: '#42441f', d: '#58553c', // o sargaço: o verde fundo e a oliva escura
  },
  // Cores do forest_tile_set.png que o censo do linter não lista (ele mede os PNGs soltos).
  allowNewColors: [
    '#f2d36b', '#d9b453', '#e8964a', '#875717', '#a884f3', '#8d6cd1', '#8e897d', '#7b776d', '#82837d',
    '#6c6f6c', '#434748', '#42441f', '#58553c',
  ],
  // As pontas soltas do capim (o último pixel de um fio arqueado, na diagonal) são de propósito.
  allowOrphans: true,
  notes: 'A decoracao da praia do norte: capim-da-praia e aveia-do-mar (fios), salsa-da-praia, conchas, estrela-do-mar, '
    + 'madeira do mar, cocos, pedras da mare e sargaco. Toda cor sai do forest_tile_set.png. Instaladas em 145..153.',
};
