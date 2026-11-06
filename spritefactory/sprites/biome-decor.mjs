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

const S = '#000000'; // a sombra de pé, igual à da decoração antiga

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
  palette: {
    S,
    // samambaia: a oliva da decoração antiga (o bioma do musgo a puxa para o turquesa na hora de desenhar)
    L: '#8a8d49', M: '#626439', D: '#4d4f2c',
    W: '#cdcdcd', // branco das flores e do musgo florido (bone)
    Y: '#f1cc36', // miolo da margarida, grão aceso do trigo (gold)
    A: '#dd9118', // grão do trigo na sombra (lava, a mais quente da casa)
    T: '#826841', // talo do trigo (drywood)
    g: '#626439', // talinho das flores (olive)
    R: '#c83e3e', r: '#a53030', // papoula (ember)
    K: '#1d2b53', // ink: miolo da papoula, carvão, pé do cristal
    k: '#313638', // carvão, face acesa (slate)
    E: '#e7462a', // a brasa (ember)
    B: '#557998', b: '#3f607e', // campânula (deepblue)
    C: '#bbf2f4', c: '#27a9af', // cristal (water)
    O: '#dd9118', o: '#733e11', // folha seca (lava + drywood)
    P: '#815938', p: '#63452c', // pinha (wood)
    V: '#64b964', v: '#008751', N: '#027849', // trevo (meadow + heroGreen): o verde aceso do meadow lia neon no mundo
  },

  notes: 'Dez decorações rasteiras, uma família por bioma; padrão da decoração antiga (tufos pequenos, '
    + 'duas cores por elemento, pixel preto de sombra no pé). Instaladas em 63..72.',
};
