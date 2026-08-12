// A VIGA E O MALHO do martinete — a metade que se MEXE, num quad de DOIS TILES de largura.
//
// Cada frame tem 32x16: a metade esquerda cai sobre o tile da MESA DE PEDRA e a direita sobre o do
// PILAR (ver trip-hammer.mjs). E por isso que esta arte mora num sheet proprio — o resto do jogo
// desenha em 16x16, e um frame de 32 num sheet de 16 seria dois frames que ninguem consegue manter
// alinhados.
//
// ── O QUE DOIS TILES COMPRARAM ──────────────────────────────────────────────────────────────────
// Comprimento. A viga tem 15px de vao livre entre o pivo e a ponta, contra os 7 que cabiam no tile
// unico, e comprimento e tudo aqui: o mesmo angulo de giro no mancal vira o DOBRO de deslocamento
// na ponta. E a cauda, que passa do outro lado do pivo, afunda quando o malho sobe — duas coisas
// se mexendo em sentidos opostos, que e literalmente o came empurrando.
//
// ── A LEI DESTE ARQUIVO ─────────────────────────────────────────────────────────────────────────
// O PIVO E SAGRADO: (PIVOT_X, PIVOT_Y) e o mesmo pixel nos seis frames, e e o mesmo pixel do
// MANCAL desenhado no pilar. Um frame que o desloque um pixel descola a viga da maquina, e o olho
// pega isso na hora mesmo sem saber nomear.

const PAL = {
  w: '#63452c', // a viga na sombra
  m: '#815938', // a viga base
  L: '#b7916a', // a viga no brilho
  G: '#5d6165', // ferro fundo — a FACE que bate e a bracadeira
  D: '#7c7e8b', // ferro na sombra
  C: '#989aa7', // ferro base
  P: '#a9abbe', // ferro no brilho
};

/** O mancal. Linha 5 = a linha do mancal desenhado no pilar; ver a lei acima. */
const PIVOT_X = 22;
const PIVOT_Y = 5;
/** A ponta (onde pendura o malho) e a cauda (o lado que o came empurra). A ponta esta em 8
 * para o malho de 8px cair CENTRADO no tile da mesa — e ai a carga, a escoria e o anel de choque
 * moram todos no centro do tile, sem um deslocamento a lembrar em cada efeito. */
const TIP_X = 8;
const TAIL_X = 29;
/** A ponta no fundo do curso, e quantos pixels ela sobe. */
const TIP_BOTTOM = 6;
const SWING = 5;

/**
 * O MALHO: 8 de largura por 5 de altura, o dobro da area do que cabia no tile unico — e essa e a
 * metade visivel do que dois tiles compraram. Ferro puro, sem um pixel de ink: a face que bate
 * precisa se ler contra o chao escuro do jogo, e ink no escuro e o escuro.
 */
const HEAD = [
  'GDDDDDDG', // a bracadeira que prende o malho na viga
  'PCCCCDDG',
  'PCCCCDDG',
  'PCCCDDDG',
  'GGGGGGGG', // a face que bate
];

export default {
  name: 'trip-hammer-beam',
  kind: 'prop',
  frameW: 32,
  frameH: 16,
  draw({ Pix, hexToRgb }) {
    const rgb = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, hexToRgb(v)]));

    /**
     * Um frame da viga. `tip` e a altura da ponta; o resto sai de uma reta so que passa pelo pivo
     * — e por isso a cauda desce sozinha quando a ponta sobe, sem nenhuma conta a mais.
     *
     * A viga tem 3px de espessura porque agora ela pode: e um madeiro, e madeiro fino le como
     * vara de pescar. Desenhada do pivo para fora, para o erro de arredondamento se acumular
     * longe do mancal, onde ninguem repara.
     */
    const beamFrame = (tip) => {
      const p = new Pix(32, 16);
      const slope = (tip - PIVOT_Y) / (TIP_X - PIVOT_X);
      for (let x = TAIL_X; x >= TIP_X; x -= 1) {
        const y = Math.round(PIVOT_Y + slope * (x - PIVOT_X));
        p.set(x, y, rgb.L);
        p.set(x, y + 1, rgb.m);
        p.set(x, y + 2, rgb.w);
      }
      // O malho pendura da ponta, entrando 1px por dentro da viga: sem essa sobreposicao a junta
      // le como dois objetos encostados, e nao como um pendurado no outro.
      HEAD.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx += 1) {
          p.set(TIP_X - 4 + rx, tip + 2 + ry, rgb[row[rx]]);
        }
      });
      return p;
    };

    const frames = [];
    for (let i = 0; i <= SWING; i += 1) frames.push(beamFrame(TIP_BOTTOM - i));
    return frames;
  },
  notes: 'A VIGA e o MALHO do martinete: 32x16 (DOIS tiles de largura), 6 frames do fundo do curso '
    + '(0) ao alto (5). Sheet proprio porque o resto do jogo e 16x16 e um frame de 32 partido em '
    + 'dois seria impossivel de manter alinhado. O PIVO (22,5) e o mesmo pixel nos seis frames E o '
    + 'mesmo do mancal desenhado no pilar — a lei deste arquivo. Angulo e FRAME e nao rotacao, '
    + 'porque prop neste jogo nao gira (setAngle gira no plano da camera). A viga tem 15px de vao '
    + 'contra os 7 do tile unico, e comprimento e o que faz o movimento: mesmo giro no mancal, o '
    + 'dobro de deslocamento na ponta.',
};
