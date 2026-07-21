// A CAIXA DE FERRAMENTAS — a bancada do jogo: dois itens entram, um item novo sai.
//
// Seis frames numa fileira, e eles sao DUAS coisas:
//   0..3 — o corpo (billboard em pe): fechada, entreaberta, aberta, aberta FORJANDO.
//   4..5 — a bandeja (quad deitado no chao): vazia e carregada. E a marca de "poe algo aqui",
//          a mesma gramatica da bomba-fantasma no bombSpot — o jogo nao tem botao de largar.
//
// Tres decisoes de forma valem ser ditas:
//
// 1. A ALCA e a silhueta. Um caixote de madeira ja existe no jogo, e sem a alca em arco no topo
//    esta peca seria mais um retangulo no meio do mato. O arco tem um VAO transparente no meio:
//    e o buraco que faz o olho ler "alca", e nao "chapeu". As pernas encostam nas pontas da
//    barra — encostar na diagonal nao basta, a 16px isso le como duas pecas soltas.
// 2. A TAMPA AVANCA um pixel de cada lado sobre o corpo. Sem esse degrau, tampa e corpo tem a
//    mesma largura e a peca vira um armario de duas gavetas: a saliencia e o que diz qual metade
//    abre.
// 3. A base NUNCA muda entre os frames. Abrir e a tampa subindo/tombando pra tras e a cavidade
//    aparecendo; o corpo, a trava dourada e a linha de contato ficam byte a byte no lugar. E a
//    regra 8 do padrao (animacao e micro-variacao): redesenhar a silhueta inteira entre frames
//    faz a peca PISCAR em vez de se mover.
//
// Na forja (frame 3) as ferramentas viram SILHUETA contra o brilho — o mesmo desenho do frame 2,
// so que agora recortado no ouro. Um objeto quente nao ganha detalhe, ele perde: e a luz que
// esta atras dele.

const blank = () => Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => '.'));
const put = (p, x, y, c) => { if (x >= 0 && x < 16 && y >= 0 && y < 16) p[y][x] = c; };
const hline = (p, x0, x1, y, c) => { for (let x = x0; x <= x1; x += 1) put(p, x, y, c); };
const vline = (p, x, y0, y1, c) => { for (let y = y0; y <= y1; y += 1) put(p, x, y, c); };

// O corpo de baixo (x 2..13): identico nos quatro frames do prop. A boca (y=9) e o labio
// ILUMINADO da caixa — a aresta que separa "tem tampa em cima" de "esta aberta".
const drawBase = (p) => {
  put(p, 2, 9, 'K'); put(p, 13, 9, 'K'); hline(p, 3, 12, 9, 'L');
  for (let y = 10; y <= 12; y += 1) {
    put(p, 2, y, 'K'); put(p, 13, y, 'K');
    put(p, 3, y, 'H'); hline(p, 4, 11, y, 'M'); put(p, 12, y, 'D');
  }
  put(p, 2, 13, 'K'); put(p, 13, 13, 'K'); hline(p, 3, 12, 13, 'D');
  hline(p, 2, 13, 14, 'N'); // a ultima linha escura ancora a peca no chao
  // A trava: chapinha dourada com o rebaixo ink logo abaixo. E o unico ponto quente do frame
  // frio — o olho pousa nela e entende que a caixa ABRE.
  put(p, 7, 10, 'Y'); put(p, 8, 10, 'Y');
  put(p, 7, 11, 'K'); put(p, 8, 11, 'K');
};

// A tampa fechada/entreaberta (x 1..14, um pixel alem do corpo) e a alca que viaja com ela.
// `shift` = quantos pixels ela subiu.
const drawLid = (p, shift) => {
  const top = 5 - shift;
  put(p, 1, top, 'K'); put(p, 14, top, 'K'); hline(p, 2, 13, top, 'L');
  for (let y = top + 1; y <= top + 2; y += 1) {
    put(p, 1, y, 'K'); put(p, 14, y, 'K');
    put(p, 2, y, 'H'); hline(p, 3, 12, y, 'M'); put(p, 13, y, 'D');
  }
  put(p, 1, top + 3, 'K'); put(p, 14, top + 3, 'K'); hline(p, 2, 13, top + 3, 'D');

  // A alca: arco quadrado com o VAO aberto no meio (as tres linhas de baixo so tem as pernas).
  hline(p, 5, 10, top - 4, 'L');
  vline(p, 5, top - 3, top - 1, 'H');
  vline(p, 10, top - 3, top - 1, 'D');
};

// A tampa TOMBADA pra tras: uma faixa fina no alto, ja mostrando o lado de dentro (por isso ela
// e mais escura que a tampa fechada — a luz da esquerda bate na cara de fora, nao nesta).
const drawTippedLid = (p) => {
  put(p, 1, 1, 'K'); hline(p, 2, 13, 1, 'D'); put(p, 14, 1, 'K');
  put(p, 1, 2, 'K'); hline(p, 2, 13, 2, 'M'); put(p, 14, 2, 'K');
  hline(p, 1, 14, 3, 'K'); // a aresta da frente da tampa, em ink
};

// As ferramentas dentro: uma chave em T e uma chave-de-fenda de cabo dourado. Duas, nunca tres —
// a terceira vira ruido a 16px. `flat` = a versao em contraluz (tudo ink) do frame quente.
const drawTools = (p, flat) => {
  hline(p, 4, 6, 5, flat ? 'K' : 'H'); vline(p, 5, 6, 8, flat ? 'K' : 'H');
  hline(p, 9, 10, 5, flat ? 'K' : 'Y');
  vline(p, 9, 6, 8, flat ? 'K' : 'D');
  vline(p, 10, 6, 8, flat ? 'K' : 'M');
};

const closed = () => { const p = blank(); drawLid(p, 0); drawBase(p); return p.map((r) => r.join('')); };

const ajar = () => {
  const p = blank();
  drawLid(p, 1);
  // A fresta: uma linha do escuro de dentro entre a tampa levantada e a boca da caixa.
  put(p, 2, 8, 'K'); put(p, 13, 8, 'K'); hline(p, 3, 12, 8, 'N');
  drawBase(p);
  return p.map((r) => r.join(''));
};

const open = (hot) => {
  const p = blank();
  drawTippedLid(p);
  for (let y = 4; y <= 8; y += 1) { put(p, 2, y, 'K'); put(p, 13, y, 'K'); }
  if (hot) {
    // O calor SOBE: escuro no alto da cavidade, ouro no meio, nucleo claro no fundo.
    hline(p, 3, 12, 4, 'N');
    hline(p, 3, 12, 5, 'Y');
    hline(p, 3, 12, 6, 'Y'); hline(p, 5, 10, 6, 'F');
    hline(p, 3, 12, 7, 'F');
    hline(p, 3, 12, 8, 'F');
  } else {
    // A parede do FUNDO pega a luz que entra pela boca aberta; o chao da caixa e o mais escuro.
    // Sem essa escadinha a cavidade e um buraco chapado, e um buraco nao tem volume.
    hline(p, 3, 12, 4, 'I');
    hline(p, 3, 12, 5, 'K');
    for (let y = 6; y <= 8; y += 1) { hline(p, 3, 12, y, 'N'); put(p, 3, y, 'K'); }
  }
  drawTools(p, hot);
  drawBase(p);
  return p.map((r) => r.join(''));
};

// A BANDEJA. Deitada no chao, quatro CANTONEIRAS e o miolo vazado: o item de verdade descansa
// dentro dela, entao qualquer coisa desenhada no meio brigaria com ele — e um aro fechado leria
// como moldura de quadro, nao como encaixe de maquina. Carregada, ela so troca de cor: mesma
// silhueta, mesma sombra (regra 8) — o slot ACENDE, ele nao vira outro objeto.
const tray = (edge, face, inner, shade) => [
  '................',
  '................',
  `..${edge.repeat(5)}..${edge.repeat(5)}..`,
  `..${face}${inner.repeat(4)}..${inner.repeat(4)}${face}..`,
  `..${face}${inner}........${inner}${face}..`,
  `..${face}${inner}........${inner}${face}..`,
  `..${face}${inner}........${inner}${face}..`,
  `..${face}..........${face}..`,
  `..${face}..........${face}..`,
  `..${face}${inner}........${inner}${face}..`,
  `..${face}${inner}........${inner}${face}..`,
  `..${face}${inner}........${inner}${face}..`,
  `..${face}${inner.repeat(4)}..${inner.repeat(4)}${face}..`,
  `..${face.repeat(5)}..${face.repeat(5)}..`,
  `..${shade.repeat(5)}..${shade.repeat(5)}..`,
  '................',
];

export default {
  name: 'toolbox',
  kind: 'prop',
  layout: 'row',
  palette: {
    N: '#141d38', // o escuro do fundo da caixa / linha de contato com o chao
    K: '#1d2b53', // ink — contorno, rebaixos e as ferramentas em contraluz
    I: '#324476', // ink claro — a parede do fundo da cavidade pegando a luz da boca
    D: '#5d6165', // metal em sombra (lado direito, avesso da tampa)
    M: '#7c7e8b', // metal base
    H: '#989aa7', // metal recebendo a luz da esquerda
    L: '#a9abbe', // aresta de cima: o labio da boca e o topo da tampa
    A: '#c9c81b', // ouro em sombra — a sombra da bandeja carregada
    Y: '#f1cc36', // a trava, o cabo da chave-de-fenda, o aro carregado
    F: '#f8e394', // o nucleo da forja / a aresta alta da bandeja carregada
  },
  frames: [
    closed(), ajar(), open(false), open(true),
    tray('L', 'H', 'K', 'D'),
    tray('F', 'Y', 'K', 'A'),
  ],
  notes: 'Caixa de ferramentas em 6 frames: 4 poses do corpo (fechada / entreaberta / aberta / '
    + 'forjando) e 2 da bandeja de entrada (vazia / carregada). A alca em arco com vao vazado e a '
    + 'tampa avancando 1px sobre o corpo sao o que separa a silhueta do caixote de madeira; a base, '
    + 'a trava dourada e a linha de contato sao identicas nos quatro frames do corpo, entao abrir le '
    + 'como movimento e nao como troca de objeto. Metal na rampa stone inteira (5d6165 -> a9abbe) com '
    + 'luz dura da esquerda; ouro so na trava, no cabo de uma ferramenta e na forja. Aberta e fria a '
    + 'cavidade tem escadinha (fundo em ink claro, chao em ink escuro) e as ferramentas sao metal; '
    + 'aberta e quente elas viram silhueta ink contra o nucleo claro — o quente perde detalhe.',
};
