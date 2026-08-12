// A ENGRENAGEM — o primeiro bem INTERMEDIARIO do jogo.
//
// Ela existe pelo mesmo motivo que o bloco de ferro existiu: nao servir pra nada sozinha. O ferro
// entrou porque a caixa de ferramentas precisava de um insumo cuja unica razao de ser fosse ela; a
// engrenagem entra porque a FABRICA precisava de um degrau entre "material bruto" e "maquina".
//
// A liga e a MESMA do bloco de ferro (rampa stone + ink navy), de proposito: ela tem de ler como
// "ferro que passou por uma bancada", nunca como material novo. O que a distingue e a FORMA.
//
// ── Por que a v1 foi jogada fora ──────────────────────────────────────────────────────────────
// A primeira versao desenhava os dentes com trigonometria: oito blocos 2x2 em `cos/sin` de um raio
// 6. A 16px isso nao produz dentes — produz oito nubs de tamanhos e distancias DIFERENTES, porque
// cada angulo arredonda para um lugar diferente da grade. Metade encostava no aro, metade
// flutuava, e o conjunto lia como serrilha acidental. Pior: o aro de ink saiu grosso e o furo do
// eixo largo, entao a peca virava um OLHO — uma iris escura dentro de uma esclera clara.
//
// O conserto nao foi ajustar numeros: foi trocar de formato de autoria. Silhueta a 16px se
// DESENHA, celula a celula; nao se calcula. (A regra da casa, no README da fabrica: "o formato de
// autoria primario e o text grid".)
//
// ── As tres decisoes desta silhueta ───────────────────────────────────────────────────────────
//  1. DENTES DE 2px COM VALES DE 2px. E o unico ritmo que sobrevive a 16px: um dente de 1px vira
//     ruido e um vale de 1px fecha visualmente, devolvendo o circulo. Sao 8 dentes — 4 nos eixos
//     (que saem 2px alem do corpo) e 4 nas diagonais (que saem ~1,5px, o que a 45 graus da o mesmo
//     avanco aparente). Todos ancorados no corpo: nenhum dente flutua.
//  2. O CORPO E CLARO, NAO UM ARO ESCURO. O ink entra so onde a forma vira as costas para a luz —
//     a beirada de baixo e da direita — e o metal ocupa o resto. Uma coroa de ink fechada engolia
//     a peca a 1x, que e a distancia em que ela vive (na bandeja, na carta do catalogo).
//  3. O FURO E 2x2. E o que impede a leitura de MOEDA (o objeto redondo que este jogo mais mostra)
//     sem virar pupila: pequeno o bastante para ser um eixo, grande o bastante para existir a 1x.
//
// A luz e a da casa: vem da esquerda-acima, sombra chapada, sem degrade e sem dithering.

export default {
  name: 'gear',
  kind: 'item',
  palette: {
    N: '#141d38', // ink escuro — o furo do eixo e o contato com o chao
    K: '#1d2b53', // ink navy — a beirada que vira as costas pra luz
    D: '#5d6165', // metal na sombra
    M: '#7c7e8b', // metal base
    L: '#989aa7', // metal recebendo luz
    A: '#a9abbe', // metal no brilho (o quadrante de cima-esquerda)
  },
  // O mapa. Os quatro dentes de eixo estao em x7-8 (N e S) e y7-8 (L e O); os quatro diagonais
  // sao os blocos 2x2 nos cantos de y3-4 e y11-12. Os vales — as colunas x4-5 e x10-11 nas linhas
  // de dente, e as linhas y5-6 e y9-10 nas colunas — tem 2px em toda a volta.
  //
  // O TERMINADOR E UM ARCO, e nao uma reta de 45 graus. As faixas de tom saem da DISTANCIA ate a
  // luz (que mora fora da peca, em cima e a esquerda), entao elas acompanham a curva do disco. A
  // versao com corte reto foi desenhada e descartada lado a lado com esta: um disco partido por
  // uma diagonal chapada nao le como redondo, le como chapa DOBRADA — e a dobra passava bem em
  // cima do furo do eixo, que e o unico detalhe interno que a peca tem.
  frames: [[
    '................',
    '.......AL.......',
    '.......AL.......',
    '..AA..AALL..MD..',
    '..AAAAAALLMMMD..',
    '...AAAALLLMMM...',
    '...AAALLLLMMD...',
    '.LLLLLLNNMMMDDD.',
    '.LLLLLLNNMMDDDD.',
    '...MMMMMMMDDD...',
    '...MMMMMMDDDD...',
    '..MMMMMDDDDDDD..',
    '..DD..DDDD..DD..',
    '.......DD.......',
    '.......DD.......',
    '................',
  ]],
  notes: 'Engrenagem 16x16, v2 — silhueta AUTORADA celula a celula (a v1 calculava os dentes com '
    + 'cos/sin e a 16px isso da oito nubs desiguais, metade solta do aro). Oito dentes de 2px com '
    + 'vales de 2px: quatro nos eixos, quatro nas diagonais, todos ancorados no corpo. Corpo CLARO '
    + 'na rampa stone com luz da esquerda-acima e sombra chapada; o ink so na beirada que vira as '
    + 'costas pra luz, nunca como coroa fechada (era o que engolia a peca a 1x). Furo de eixo 2x2 '
    + 'para nao ler como moeda sem virar pupila. Mesma liga do bloco de ferro de proposito: le '
    + 'como ferro trabalhado, nao como material novo.',
};
