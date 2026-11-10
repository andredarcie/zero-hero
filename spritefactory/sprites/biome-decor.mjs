// A FLORA DOS BIOMAS — dez decorações rasteiras novas, uma família por bioma (world/biomes.ts), para
// cada lugar ter planta que só existe nele (pedido do autor: "matos diferentes, detalhes que agregam").
//
// O padrão é o da decoração que já estava no atlas (frames 0, 7, 10, 11 — dumpe-os para comparar):
// vista de cima, elementos pequenos de 2 a 5 px agrupados em tufos com respiro no tile, DUAS cores por
// elemento (corpo + sombra/acento) e um pixel preto de sombra no pé de cada um. Nada de contorno, nada
// de degradê, alpha binário. Instala no FIM do forest-tileset (frames 63..72): id de frame é posicional,
// e só acrescentar linhas mantém o que o mundo já guarda.
//
//   0 samambaia      (bosque do musgo)     5 campânulas azuis  (planalto das estrelas)
//   1 musgo florido  (bosque do musgo)     6 cristais          (planalto das estrelas)
//   2 trigo          (campos dourados)     7 brasas e carvão   (terras queimadas)
//   3 margaridas     (prado das flores)    8 folhas e pinha    (mata fechada)
//   4 papoulas       (prado das flores)    9 trevos            (jardim da fogueira)
//
// O que NÃO entra, de propósito: cogumelo (é item de quest neste jogo, e cogumelo desenhado que não se
// colhe mente) e graveto (é item também).

// A sombra de pé é a ARDÓSIA da decoração antiga (frames 0/7/8), não preto: o preto puro abria um furo no chão
// sob cada flor (2026-11-10, a paleta única — ver a nota no fim).
const S = '#3a3f3f';

export default {
  name: 'biome-decor',
  kind: 'prop',
  layout: 'row',
  frames: [
    // 0 SAMAMBAIA — duas frondes abertas em leque, verde-azulado de sombra úmida
    [
      '................',
      '................',
      '................',
      '....L.....L.....',
      '...LM.L..ML.L...',
      '..M.MLM..MLM.M..',
      '...MDM....MDM...',
      '..LMDML..LMDML..',
      '...MDM....MDM...',
      '....D......D....',
      '....S......S....',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    // 1 MUSGO FLORIDO — almofadas de musgo com florzinhas brancas de pontinha
    [
      '................',
      '................',
      '................',
      '................',
      '....MWM.........',
      '...MDMMM........',
      '...DMDMW....WM..',
      '....DDD....MDMM.',
      '....SSS....DMDM.',
      '............DD..',
      '............SS..',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    // 2 TRIGO — três espigas de grão em zigue-zague (2 px), talos finos e secos
    [
      '................',
      '................',
      '....Y.......Y...',
      '...YA...Y..YA...',
      '...AY..YA..AY...',
      '...YA..AY..YA...',
      '....T..YA...T...',
      '....T...T...T...',
      '....T...T...T...',
      '....S...T...S...',
      '........S.......',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    // 3 MARGARIDAS — três florzinhas brancas de miolo amarelo
    [
      '................',
      '................',
      '................',
      '....W...........',
      '...WYW......W...',
      '....Wg.....WYW..',
      '.....S......Wg..',
      '.............S..',
      '................',
      '.......W........',
      '......WYW.......',
      '.......Wg.......',
      '........S.......',
      '................',
      '................',
      '................',
    ],
    // 4 PAPOULAS — três vermelhas de miolo escuro
    [
      '................',
      '................',
      '................',
      '................',
      '...RR......RR...',
      '..RKRr....RKRr..',
      '...rrg.....rrg..',
      '.....S.......S..',
      '................',
      '.......RR.......',
      '......RKRr......',
      '.......rrg......',
      '.........S......',
      '................',
      '................',
      '................',
    ],
    // 5 CAMPÂNULAS — sininhos azul-claros pendurados em talos finos
    [
      '................',
      '................',
      '................',
      '.....g....g.....',
      '....gB...gB.....',
      '....BB...BB..g..',
      '....bS...bS.gB..',
      '............BB..',
      '...g........bS..',
      '..gB.....g......',
      '..BB....gB......',
      '..bS....BB......',
      '........bS......',
      '................',
      '................',
      '................',
    ],
    // 6 CRISTAIS — duas lascas de quartzo frio saindo do chão, luz da esquerda
    [
      '................',
      '................',
      '................',
      '................',
      '.....W..........',
      '....WC..........',
      '....WCc....W....',
      '....WCc...WC....',
      '...KWCcK..WCc...',
      '....SSS..KWCcK..',
      '..........SSS...',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    // 7 BRASAS E CARVÃO — torrões queimados, um ainda com brasa por dentro
    [
      '................',
      '................',
      '................',
      '................',
      '....KK..........',
      '...KEkK.....K...',
      '...kKkk....KkK..',
      '....SSS....kkk..',
      '............SS..',
      '................',
      '......KK........',
      '.....KkEK.......',
      '......SSS.......',
      '................',
      '................',
      '................',
    ],
    // 8 FOLHAS E PINHA — folhas secas caídas e uma pinha
    [
      '................',
      '................',
      '................',
      '................',
      '...OO...........',
      '..OoO.......P...',
      '...oS......PpP..',
      '...........pPp..',
      '.......OO...PS..',
      '......OoO.......',
      '.......oS.......',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    // 9 TREVOS — trevinhos de três folhas, verde vivo de grama aparada
    [
      '................',
      '................',
      '................',
      '................',
      '....V.V.........',
      '....vVv.....V.V.',
      '.....N......vVv.',
      '.....S.......N..',
      '.............S..',
      '................',
      '.......V.V......',
      '.......vVv......',
      '........N.......',
      '........S.......',
      '................',
      '................',
    ],
  ],
  // Cada letra é UMA cor em todo o sheet (o formato de grade usa uma paleta só); por isso as famílias
  // dividem letras parecidas com cores próprias.
  // A PALETA ÚNICA (2026-11-10, pedido do autor: "melhorar o que já tem"): a primeira versão desta flora pegou cores
  // das peças de interface e de item (o ouro da moeda, o vermelho de perigo, a água ciano, o verde do herói) e as pôs
  // no chão de um tileset apagado — oliva, ardósia, terra. Cada flor gritava mais que o herói. Agora toda cor aqui é
  // uma cor que o forest_tile_set.png já usa (dump: `node spritefactory/factory.mjs palette`), e a flor ainda se
  // distingue pela FORMA e pelo matiz, não pela saturação.
  palette: {
    S,
    // samambaia: a oliva da decoração antiga (o bioma do musgo troca a rampa dela na hora de desenhar)
    L: '#8a8d49', M: '#626439', D: '#4d4f2c',
    W: '#e3dad1', // branco das flores e do musgo florido: o osso quente do tileset, não o prata de interface
    Y: '#f2d36b', // miolo da margarida, grão aceso do trigo: o amarelo da florzinha do tileset (frame 10)
    A: '#d9b453', // grão do trigo na sombra: o mesmo amarelo, um degrau abaixo (frame 10)
    T: '#826841', // talo do trigo (drywood)
    g: '#626439', // talinho das flores (olive)
    R: '#c83e3e', r: '#a53030', // papoula: os dois vermelhos que o tileset já tinha (poucos pixels, de propósito)
    K: '#363432', // miolo da papoula, carvão, pé do cristal: o escuro da terra, não o navy de interface
    k: '#5d6165', // carvão, face acesa: a pedra mais escura da casa
    E: '#e8964a', // a brasa: o laranja da fruta do pinheiro (o vermelho-fogo lia alarme no chão)
    B: '#557998', b: '#3f607e', // campânula (deepblue, já no tileset)
    C: '#a9abbe', c: '#7c7e8b', // cristal: o quartzo lilás-acinzentado da pedra da casa, não a água ciano
    O: '#e8964a', o: '#875717', // folha seca: o laranja da fruta e o ocre escuro do tileset
    P: '#815938', p: '#63452c', // pinha (wood)
    V: '#8a8d49', v: '#4f5129', N: '#39571c', // trevo: a oliva clara, a oliva funda e o verde fundo do tileset
  },

  // Cores do forest_tile_set.png que o censo do linter não lista (ele mede os PNGs soltos, e o atlas do chão as usa em
  // poucos pixels): os dois amarelos da florzinha (frame 10), a fruta do pinheiro, o ocre escuro e a oliva funda.
  allowNewColors: ['#f2d36b', '#d9b453', '#e8964a', '#875717', '#4f5129'],

  notes: 'Dez decorações rasteiras, uma família por bioma; padrão da decoração antiga (tufos pequenos, '
    + 'duas cores por elemento, sombra de ardósia no pé). Toda cor sai do forest_tile_set.png. Instaladas em 63..72.',
};
