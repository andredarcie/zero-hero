// MACHADO DE ACO — o irmao maior do machado. O machado comum so morde madeira MORTA
// (dryTree, dryShrub); este derruba qualquer arvore do jogo, inclusive o pinheiro vivo.
//
// A silhueta tem que dizer isso a 1x, sem texto: o machado comum tem UM gume (lamina
// horizontal a esquerda, cabo a direita — axe_icon.png); este e BIGORNA DUPLA, simetrico,
// dois gumes e o cabo passando pelo meio. Duas laminas nao e enfeite, e a leitura: uma
// ferramenta que corta para os dois lados corta tudo.
//
// A outra diferenca e o material, e ela e literal no nome. O corpo do machado comum e
// #3d3d3d (ferro fosco, quase o ink); este e a ramp `stone` clara + realce `bone` — ACO,
// que reflete. O cabo repete exatamente o do axe_icon (W escuro na col 7, L claro na col 8)
// porque os dois tem que ler como familia: mesma empunhadura, cabeca diferente.
//
// Luz da esquerda (regra 5) sobre uma silhueta simetrica: o gume esquerdo ganha a aresta
// clara (E, tres pixels conectados formando o fio iluminado), o direito fica na sombra (K).
// E o que impede o desenho de virar um carimbo espelhado sem volume.

export default {
  name: 'great-axe-icon',
  kind: 'item',
  palette: {
    E: '#cdcdcd', // bone — o fio do gume esquerdo, o unico ponto que "brilha"
    S: '#989aa7', // stone claro — a massa do aco
    K: '#5d6165', // stone escuro — sombra do gume direito e as pontas da cabeca
    W: '#886644', // cabo, lado escuro (identico ao axe_icon)
    L: '#b7916a', // cabo, lado claro (identico ao axe_icon)
  },
  frames: [[
    '................',
    '..E..........K..',
    '.EESS......SSKK.',
    '.ESSSSKWLKSSSSK.',
    '.ESSSSKWLKSSSSK.',
    '.ESSSSKWLKSSSSK.',
    '.EESS..WL..SSKK.',
    '..E....WL....K..',
    '.......WL.......',
    '.......WL.......',
    '.......WL.......',
    '.......WL.......',
    '.......WW.......',
    '.......WW.......',
    '.......WL.......',
    '................',
  ]],
  notes: 'v3. O CABO E CONTINUO. Na v2 ele existia nas linhas 3-5 (dentro da cabeca) e recomecava '
    + 'na linha 8, com as linhas 6-7 transparentes nas colunas 7-8: um buraco de 2px que soltava a '
    + 'cabeca do cabo — o machado lia como uma lamina flutuando acima de um cabo separado. A causa '
    + 'foi espelhar o afunilamento da cabeca de cima para baixo sem repor os pixels do cabo embaixo: '
    + 'em cima o vazio esta certo (o cabo morre no olho, nada sobra acima), embaixo ele e o defeito. '
    + 'O contraste de material piorava (cabo quente #886644/#b7916a contra aco frio), entao nao havia '
    + 'nem ponte de valor atravessando o vao. '
    + 'v2. A lamina ALARGA para fora: estreita junto ao olho (so as linhas 3-5 tocam o cabo) e '
    + 'cheia no fio (linhas 1-7 na coluna extrema). A primeira versao afinava para fora e lia '
    + 'como asa/nuvem, nao como machado — a flare e a silhueta inteira. O fio vira uma COLUNA '
    + 'de 7px: E na col 1 (luz da esquerda), K na col 14 (sombra), com o miolo S entre elas. '
    + 'Cabeca de 7 linhas, a mesma do axe_icon: o que cresce e a largura, nunca o sprite.',
};
