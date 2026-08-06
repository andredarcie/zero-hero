// A PÁ — a ferramenta que CAVA o buraco de plantio (plantSpot) em chão de terra.
//
// A silhueta tem que dizer "cava" a 1x, sem texto, e o que diz isso é o par
// empunhadura-em-T + lâmina LARGA apontando para BAIXO: o machado corta pro lado,
// a picareta morde pra frente, a pá entra no chão. Nenhum outro item do jogo tem
// cabeça embaixo.
//
// Família de material: a das ferramentas comuns (axe_icon/pickaxe_icon) — corpo em
// ferro fosco #3d3d3d com o fio de aço #989aa7 na aresta ILUMINADA (luz da esquerda,
// regra 5), nunca o aço claro do greatAxe (aquele é o tier de cima). O cabo repete
// exatamente o do machado (C escuro na col 7, D claro na col 8, contínuo do punho ao
// soquete — a lição do great-axe v3: um vão de 1px solta a cabeça do cabo).
//
// O T da empunhadura sombreia como o cabo: metade esquerda escura, metade clara à
// direita — o mesmo par de tons, então as duas peças de madeira leem como UMA peça.

export default {
  name: 'shovel-icon',
  kind: 'item',
  palette: {
    C: '#886644', // cabo, lado escuro (idêntico ao axe_icon)
    D: '#b7916a', // cabo, lado claro (idêntico ao axe_icon)
    S: '#989aa7', // aço polido — a mancha de luz do ombro esquerdo, afinando até a ponta
    M: '#5d6165', // stone escuro (o mesmo do great-axe) — a meia-luz entre o fio e a sombra
    I: '#3d3d3d', // ferro fosco — a massa na sombra (o mesmo do corpo do machado)
  },
  frames: [[
    '................',
    '.....CCCDDD.....',
    '.....CCCDDD.....',
    '.......CD.......',
    '.......CD.......',
    '.......CD.......',
    '.......CD.......',
    '.......CD.......',
    '.......CD.......',
    '....SSMIIIII....',
    '....SMMIIIII....',
    '....SMIIIIII....',
    '.....SMIIII.....',
    '......SMII......',
    '.......SI.......',
    '................',
  ]],
  notes: 'v3. A LAMINA GANHOU VOLUME: a v2 era so fio + massa (2 tons) e lia como papelao — a '
    + 'licao do barril (value-range). Agora sao tres: a mancha de luz S e mais GORDA no ombro '
    + 'superior-esquerdo (2px na linha 9, onde uma superficie levemente concava encara a luz da '
    + 'esquerda) e afina ate 1px na ponta; a meia-luz M desce em DIAGONAL acompanhando a curva '
    + '(2px no bojo, 1px no afunilamento); a massa I fica com a sombra. Mancha que segue a forma, '
    + 'nunca listra vertical — cluster shading, a regra do barril v3. '
    + 'v2. A LAMINA E UM TRAPEZIO COM PONTA, nunca um bojo: a v1 arredondava em cima E embaixo '
    + '(6-8-8-8-6-4) e lia como concha de sopa. O ombro abre LARGO direto do cabo (8px na linha 9 '
    + '— o contraste cabo-de-2px → lamina-de-8px e o que grita "pa"), os lados descem retos e o '
    + 'afunilamento 6-4-2 termina numa PONTA — a parte que entra no chao.',
};
