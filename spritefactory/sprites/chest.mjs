// O BAU — o estoque, e a peca que faz a fabrica valer a pena estar LONGE do heroi.
//
// Ate ele existir, o unico lugar onde um item podia esperar era o chao, um por tile: uma linha
// de producao rodando enquanto o jogador desce uma dungeon entupia no segundo item. O bau e o
// que transforma "a maquina anda sozinha" em "a maquina PRODUZ sozinha" — voltar e encontrar
// vinte blocos empilhados e a unica recompensa que uma automacao pode dar.
//
// A silhueta tem de se distinguir do CAIXOTE a 1x, porque os dois sao caixas de madeira e o
// caixote e uma peca de puzzle com regras opostas (ele se empurra, o bau nao). O caixote e um
// cubo com travessas em X; o bau e mais BAIXO, tem uma TAMPA abaulada separada por uma linha de
// ink e um ferrolho central. Sao tres diferencas, e nenhuma delas depende de cor.
//
// Dois frames de MICRO-VARIACAO (a lei da animacao deste jogo — a silhueta nunca muda entre
// frames): 0 = vazio, ferrolho apagado; 1 = com carga, ferrolho em ouro. A carga tinha de se ler
// sem abrir a tampa e sem numero na tela, e ouro e a cor que este jogo ja usa pra "isto esta
// vivo" (o filete do cabo, o selo de estrada).

const PAL = {
  N: '#141d38', // ink escuro — o contato com o chao
  K: '#1d2b53', // ink navy — aro, ferragens e a linha da tampa
  A: '#63452c', // madeira em sombra (direita)
  B: '#815938', // madeira base
  C: '#886644', // madeira pegando luz
  L: '#b7916a', // highlight da esquerda e o topo da tampa
  G: '#f1cc36', // ouro do ferrolho — SO no frame com carga
};

const BODY = [
  '................',
  '................',
  '................',
  '....LLLLLLLL....',
  '...LCCCCCCBBA...',
  '..KLLLLLLLLLLK..',
  '..KCCBBBBBBAAK..',
  '..KKKKKKKKKKKK..',
  '..KLCBBBBBBBAK..',
  '..KLCBB@@BBBAK..',
  '..KLCBB@@BBBAK..',
  '..KLCBBBBBBBAK..',
  '..KCCBBBBBBAAK..',
  '..NNNNNNNNNNNN..',
  '................',
  '................',
];

export default {
  name: 'chest',
  kind: 'prop',
  frames: [
    BODY.map((row) => row.replace(/@/g, 'K')), // vazio: o ferrolho e so mais uma ferragem
    BODY.map((row) => row.replace(/@/g, 'G')), // com carga: o mesmo ferrolho, aceso
  ],
  palette: PAL,
  notes: 'Bau v1, 2 frames (vazio / com carga). Distingue-se do caixote por tres coisas de FORMA, '
    + 'nao de cor: corpo mais baixo, tampa abaulada separada por uma linha de ink na altura do '
    + 'terco superior, e ferrolho central. A carga se le pelo ferrolho virando ouro — a mesma '
    + 'lingua de "isto esta vivo" do filete do cabo e do selo de estrada, e sem numero na tela.',
};
