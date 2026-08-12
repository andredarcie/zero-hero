// O MARTINETE, agora em DOIS TILES — e a arte que este arquivo faz sao as duas metades PARADAS.
// A viga e o malho, que sao a parte que se mexe, moram em `trip-hammer-beam.mjs`, num quad de dois
// tiles de largura que passa na frente destes dois.
//
// ── POR QUE DOIS TILES ──────────────────────────────────────────────────────────────────────────
// Num tile so nao cabia, e nao por falta de talento: por aritmetica. Dentro de 16px de altura
// tinham de caber travessa, curso do malho, malho, peca e bigorna — a soma ingenua da 18 —, e cada
// pixel dado ao curso era um pixel tirado da bigorna. Tres reformas seguidas negociaram esses
// pixels e nenhuma resolveu, porque nao havia o que resolver.
//
// Com dois tiles a conta abre: a MESA DE PEDRA fica sozinha no tile dela, com a altura inteira para
// ser uma mesa; o PILAR fica sozinho no dele, com a altura inteira para ser um pilar; e a viga
// ganha 32px de comprimento, que e o que ela sempre precisou para parecer uma viga. E o curso do
// malho deixou de disputar espaco com a bigorna: eles estao em tiles diferentes.
//
// Frames: 0 = MESA · 1 = mesa em BRASA · 2 = PILAR · 3 = RETRATO (o icone do item).

const STONE = {
  N: '#141d38', // ink — nunca no corpo da pedra, so onde a peca encosta no chao
  F: '#3a3f3f', // a sombra que ancora (a mesma do pe da rocha do jogo)
  E: '#5d6165', // pedra fundo
  D: '#7c7e8b', // pedra sombra
  C: '#989aa7', // pedra base
  A: '#a9abbe', // pedra clara
  B: '#b5b5b5', // o TAMPO — a superficie que recebe a peca, e a coisa mais clara do par
  L: '#b7916a', // madeira brilho (o pilar mora no mesmo sheet)
  m: '#815938', // madeira base
  w: '#63452c', // madeira sombra
  G: '#5d6165', // ferro do mancal (mesmo tom da pedra fundo — e ferro fosco)
};

// A MESA DE PEDRA. Ela e a metade BAIXA do tile de proposito: os oito pixels de cima sao o ar por
// onde o malho desce, e nao ha nada mais importante para o desenho desta peca do que esse ar.
// Ela e larga, macica e cresce para baixo — uma bigorna que parece que aguenta.
const TABLE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..BBBBBBBBBBBB..', // o TAMPO: onde a peca pousa e onde o malho bate
  '..AACCCCCCCDDD..', // a espessura dele, com a luz vindo da esquerda
  '...CCDDDDDDEE...', // o corpo estreita — e isso que faz uma MESA e nao um caixote
  '...FFFFFFFFFF...', // a sombra que ancora
  '................',
];

// O PILAR DE MADEIRA. Um poste inteiro, do chao ao capitel, com o MANCAL de ferro na altura em que
// a viga gira — e essa altura nao e escolha de desenho: e a linha 5, a mesma do pivo no frame da
// viga. Se as duas discordarem, a viga gira no ar ao lado do poste.
const PILLAR = [
  '................',
  '...LLLLLLLLL....', // o capitel, que da um topo a peca (poste sem topo le como tabua)
  '...mmLLmmwwww...',
  '.....mLLmww.....',
  '.....mLLmww.....',
  '...GGGGGGGGGG...', // o MANCAL: o ferro em que a viga gira (linha 5, ver acima)
  '.....mLLmww.....',
  '.....mLLmww.....',
  '.....mLLmww.....',
  '.....mLLmww.....',
  '...GGGGGGGGGG...', // a CINTA de baixo: ferragem repetida e o que le MAQUINA
  '.....mLLmww.....',
  '.....mLLmww.....',
  '....mmLLmwww....', // o pe alarga, senao o poste parece espetado no chao
  '...NNNNNNNNNN...',
  '................',
];

// O RETRATO (frame 3) — o icone do item no chao, na mochila e na paleta do editor.
//
// Ele NAO e uma das duas metades: uma mesa sozinha nao e um martinete e um poste sozinho e um
// poste. Entao o icone e a maquina inteira ESPREMIDA num tile — a unica arte deste arquivo que
// existe so para ser olhada de perto, e a unica que pode mentir sobre escala, porque icone nao
// tem vizinho com quem se alinhar.
const ICON = [
  '................',
  '................',
  '.........LLLLL..',
  '.wwww....mLLmw..',
  '.wCCCw...mLLmw..',
  'wCCCCCwwwGGGGG..',
  '.wCCCw...mLLmw..',
  '..www....mLLmw..',
  '.........mLLmw..',
  '..BBBBBB.mLLmw..',
  '..ACCCDD.mLLmw..',
  '...CDDE..mLLmw..',
  '...FFFF..mLLmw..',
  '.........mLLmw..',
  '........NNNNNN..',
  '................',
];

export default {
  name: 'trip-hammer',
  kind: 'prop',
  draw({ Pix, hexToRgb }) {
    const ember = hexToRgb('#e7462a');
    const emberHot = hexToRgb('#f8e394');

    const table = new Pix(16, 16);
    table.stampGrid(TABLE, STONE);

    // A MESA ACESA: o calor de uma forja mora no CONTATO, e nao no ar em volta. A chapa quente e o
    // que conta que ali houve pancada — duas fagulhas desenhadas seriam enfeite.
    const hot = new Pix(16, 16);
    hot.stampGrid(TABLE, STONE);
    [ember, ember, emberHot, ember, ember, ember, emberHot, ember, ember, ember, ember, ember]
      .forEach((c, i) => hot.set(2 + i, 11, c));
    for (let x = 4; x <= 11; x += 1) hot.set(x, 12, ember);

    const pillar = new Pix(16, 16);
    pillar.stampGrid(PILLAR, STONE);

    const icon = new Pix(16, 16);
    icon.stampGrid(ICON, STONE);

    return [table, hot, pillar, icon];
  },
  notes: 'Martinete, metade PARADA — 16x16, 4 frames: MESA DE PEDRA (0), mesa em BRASA (1), PILAR '
    + 'DE MADEIRA (2) e o RETRATO que serve de icone (3). A viga e o malho estao em '
    + 'trip-hammer-beam (32x16), num quad de dois tiles que passa na frente destes. A peca virou '
    + 'de dois tiles por aritmetica e nao por gosto: em um so, travessa + curso + malho + peca + '
    + 'bigorna somam 18 linhas dentro de 16, e cada pixel dado ao curso saia da bigorna. O MANCAL '
    + 'do pilar esta na linha 5 porque o pivo do frame da viga esta na linha 5 — as duas artes se '
    + 'alinham por esse numero, e se ele mudar num lado a viga passa a girar no ar.',
};
