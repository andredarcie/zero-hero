// A ESTEIRA — o transporte, que e a peca que faltava para "automacao" querer dizer alguma coisa.
//
// O braco robotico ja movia carga, mas move UM item UM tile e leva ~2,5s pra fazer isso: e uma
// junta, nunca uma linha. Enquanto ele foi o unico transporte, "producao" e "onde o heroi esta"
// eram a mesma coisa, porque nada podia percorrer distancia sozinho.
//
// A arte segue a lei do CABO, nao a dos props em pe: quad deitado no chao, FULL BLEED no eixo em
// que ela viaja (0..15), para que duas esteiras seguidas leiam como uma linha continua e nao
// como dois azulejos. Perpendicular ela tem trilhos, que sao o que diz de que lado a carga cai.
//
// A direcao e FRAME, nunca rotacao (a lei dos props deste jogo — setAngle gira no plano da
// camera). Sao 8 frames: `dir + 4 * fase`, na ordem N, L, S, O que o resto do jogo ja usa. As
// duas fases sao a MESMA silhueta com as setas 4px adiante — micro-variacao, como manda o
// padrao; redesenhar o leito entre frames faria a esteira piscar em vez de correr.

const INK = '#1d2b53'; // trilho
const INK_LIGHT = '#324476'; // aresta de cima do trilho — o unico volume que um chao pode ter
const BED = '#313638'; // o leito (rampa slate: e a unica superficie escura que nao e ink)
const BED_LIT = '#3a3f3f'; // o topo da rampa slate, na aresta que o trilho de cima ilumina
const BED_DARK = '#272b2d'; // o leito na sombra do trilho de baixo
const ARROW = '#7c7e8b'; // a seta — metal, a mesma familia do braco e da engrenagem

/** Uma seta apontando para LESTE, com a ponta em x0+3. Ela e a unica coisa que se move. */
const chevron = (p, x0, rgb) => {
  for (let i = 0; i < 4; i += 1) {
    p.set(x0 + i, 4 + i, rgb);
    p.set(x0 + i, 11 - i, rgb);
  }
};

/** Gira 90° no sentido horario. (x,y) -> (H-1-y, x). */
const rot90 = (Pix, src) => {
  const out = new Pix(src.height, src.width);
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      const c = src.get(x, y);
      if (c) out.set(src.height - 1 - y, x, c);
    }
  }
  return out;
};

export default {
  name: 'belt',
  kind: 'prop',
  draw({ Pix, hexToRgb }) {
    const ink = hexToRgb(INK); const inkLight = hexToRgb(INK_LIGHT);
    const bed = hexToRgb(BED); const bedLit = hexToRgb(BED_LIT); const bedDark = hexToRgb(BED_DARK);
    const arrow = hexToRgb(ARROW);

    /** A esteira apontando pra LESTE, na fase pedida. As outras tres saem daqui por rotacao. */
    const east = (phase) => {
      const p = new Pix(16, 16);
      p.fillRect(0, 3, 16, 10, bed); // o leito, de borda a borda no eixo da viagem
      p.hline(0, 15, 3, bedLit); // a aresta do leito que pega luz, colada no trilho de cima
      p.hline(0, 15, 12, bedDark); // a sombra que o trilho de baixo joga no leito
      p.hline(0, 15, 2, ink); // trilho de cima…
      p.hline(0, 15, 1, inkLight); // …com a aresta clara por cima dele
      p.hline(0, 15, 13, ink); // trilho de baixo
      p.hline(0, 15, 14, hexToRgb('#141d38')); // e o peso dele no chao
      // Duas setas por tile, 8px de passo, deslocadas 4px na segunda fase. Os indices fora do
      // tile sao de proposito: e o que faz a seta ENTRAR e SAIR pela borda em vez de piscar no
      // meio (Pix.set recorta sozinho, entao desenhar fora e barato e seguro).
      for (let k = -1; k <= 2; k += 1) chevron(p, phase * 4 + k * 8, arrow);
      return p;
    };

    const frames = [];
    for (let phase = 0; phase < 2; phase += 1) {
      const e = east(phase);
      const s = rot90(Pix, e); // L -> S
      const w = rot90(Pix, s); // S -> O
      const n = rot90(Pix, w); // O -> N
      frames.push(n, e, s, w); // a ordem N, L, S, O do resto do jogo
    }
    return frames;
  },
  notes: 'Esteira v1, 8 frames = dir(N,L,S,O) + 4*fase. Full bleed no eixo da viagem para duas '
    + 'esteiras seguidas lerem como uma linha (a lei do cabo, nao a dos props em pe); trilhos em '
    + 'ink com aresta clara em cima e peso ink-dark embaixo; setas de metal com passo de 8px e '
    + 'deslocamento de 4px entre as fases — micro-variacao, a silhueta nunca muda. As tres outras '
    + 'direcoes sao rotacoes exatas da de leste, entao nenhuma pode divergir das outras.',
};
