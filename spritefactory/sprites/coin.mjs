// A MOEDA — o objeto que o jogo mais mostra, e o único que ele desenhava sem pensar.
//
// A anterior era um quadrado de UMA cor (#f4a261 chapado, aro de 3px com um furo no meio), sem
// sombra, sem brilho e sem giro. Num jogo cuja lei de arte é "sombra chapada, luz da esquerda", ela
// era a única peça sem lado escuro — e como toda moeda do mundo usava o mesmo frame parado, um
// punhado delas no chão lia como azulejo, não como dinheiro.
//
// ── Por que quatro frames e não um ──────────────────────────────────────────────────────────────
// Moeda que gira é a coisa mais antiga do vocabulário de videogame (o anel do Sonic, a moeda do
// Mario), e ela não é enfeite: é o que separa "item pousado" de "prêmio esperando". O ciclo tem
// quatro poses — cara, três-quartos, FIO e três-quartos de volta — e a regra da casa vale dentro
// dele: a silhueta encolhe, mas a LUZ NÃO MUDA DE LADO. Espelhar o frame 1 para fazer o 3 seria
// inverter a luz junto, o mesmo defeito que o bestiário documenta ao proibir `setFlipX`.
//
// ── As três decisões desta silhueta ─────────────────────────────────────────────────────────────
//  1. ELA É REDONDA E GORDA. 10px de diâmetro num tile de 16, desenhada célula a célula (a lição
//     da engrenagem: silhueta a 16px se desenha, não se calcula). A moeda vive a 0,55 tile na
//     tela — cada pixel de largura conta, e um aro fino desapareceria no chão roxo.
//  2. O MIOLO É CHEIO, NÃO VAZADO. A antiga tinha um furo, o que a fazia ler como ARRUELA (e como
//     o furo de eixo da engrenagem, que é a peça vizinha no catálogo). O que marca o centro agora
//     é um brilho, não um buraco.
//  3. O FIO É CLARO NO TOPO. No quadro mais estreito (2px) não sobra espaço para modelar nada —
//     então o que conta a espessura é a quina de cima pegando luz sobre um corpo escuro. Sem isso
//     o frame de fio some, e o giro pisca em vez de girar.
//
// Rampa `gold` da casa (#c9c81b → #f1cc36 → #f8e394) mais o ink navy, e um realce quase branco no
// glint: o mesmo tratamento do núcleo da chama, porque moeda TEM de brilhar no escuro (ela é
// `emissive` no runtime, ver Coin.ts).

export default {
  name: 'coin',
  kind: 'item',
  palette: {
    K: '#1d2b53', // ink navy — a borda que vira as costas para a luz, e o pé da moeda
    D: '#c9c81b', // ouro na sombra (a metade de baixo-direita)
    M: '#f1cc36', // ouro base
    L: '#f8e394', // ouro na luz (o quadrante de cima-esquerda)
    W: '#f4f4f4', // o glint, um ponto só — o branco DA CASA (o linter recusa qualquer outro)
  },
  frames: [
    // ── 0. CARA: o disco inteiro, 10px de diâmetro, luz em cima-à-esquerda ──────────────────
    [
      '................',
      '................',
      '................',
      '.....KKKKKK.....',
      '....KLLLMMDK....',
      '...KLWLMMMDDK...',
      '...KLLMMMMDDK...',
      '...KLMMMMMDDK...',
      '...KMMMMMDDDK...',
      '...KMMMMDDDDK...',
      '....KMMDDDDK....',
      '.....KKKKKK.....',
      '................',
      '................',
      '................',
      '................',
    ],
    // ── 1. TRÊS QUARTOS: 6px de largura. O corpo estreita, a luz fica onde estava ───────────
    [
      '................',
      '................',
      '................',
      '.....KKKKKK.....',
      '....KLLLMMDK....',
      '....KLWLMMDK....',
      '....KLLMMMDK....',
      '....KLMMMDDK....',
      '....KMMMMDDK....',
      '....KMMMDDDK....',
      '....KMMDDDDK....',
      '.....KKKKKK.....',
      '................',
      '................',
      '................',
      '................',
    ],
    // ── 2. FIO: 2px. A quina de cima é clara sobre o corpo escuro — é ela que dá espessura ──
    [
      '................',
      '................',
      '................',
      '.......KK.......',
      '.......LL.......',
      '.......LM.......',
      '.......MM.......',
      '.......MM.......',
      '.......MD.......',
      '.......DD.......',
      '.......DD.......',
      '.......KK.......',
      '................',
      '................',
      '................',
      '................',
    ],
    // ── 3. TRÊS QUARTOS DE VOLTA: a mesma largura do frame 1, e a MESMA luz à esquerda —
    //      espelhar o 1 teria posto o brilho na direita, e neste jogo o sol não muda de lado.
    [
      '................',
      '................',
      '................',
      '.....KKKKKK.....',
      '....KLLMMMDK....',
      '....KLMMMMDK....',
      '....KLMMWMDK....',
      '....KLMMMDDK....',
      '....KMMMMDDK....',
      '....KMMMDDDK....',
      '....KMMDDDDK....',
      '.....KKKKKK.....',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
};
