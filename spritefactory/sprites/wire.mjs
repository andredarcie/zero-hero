// Cabo de energia — a corrente como GEOGRAFIA no chao. Ancoras de estilo: os aros do barril
// (o "preto" estrutural e o ink navy, SOMBREADO com a propria rampa ink: #324476 na aresta que
// pega luz, #141d38 na sombra), a placa de pressao (ferragem stone rente ao chao) e a rampa
// gold oficial para o nucleo energizado — nada de amarelo inventado.
//
// CATORZE frames em linha: 7 formas apagadas (v, h, ne, nw, se, sw, x) + as MESMAS 7 so com o
// filete gold do nucleo (frames 7..13). O runtime desenha a forma apagada como base e o nucleo
// por cima em aditivo quando a rede esta viva — por isso o banco aceso e so o filete.
//
// CONTINUIDADE E A REGRA DURA DESTE SPRITE: a capa corre de borda a borda do tile na mesma
// altura/largura em toda forma, entao dois tiles vizinhos emendam sem costura. As bordas
// ABERTAS (por onde o cabo continua) nao recebem aresta de luz — a luz so contorna onde a capa
// realmente termina. As bracadeiras de pedra vivem coladas nas bordas conectadas: quando dois
// tiles se encontram, as duas metades formam UMA bracadeira sobre a emenda.

const PAL = {
  E: '#324476', // ink claro — aresta da capa sob a luz (a linguagem dos aros do barril)
  K: '#1d2b53', // ink navy — o corpo da capa
  k: '#141d38', // ink escuro — a sombra da capa
  S: '#7c7e8b', // stone media — bracadeira presa ao chao
  s: '#5d6165', // stone escura — a metade na sombra da bracadeira
  g: '#f1cc36', // gold — o nucleo energizado
  Y: '#f8e394', // gold claro — o miolo quente no centro do tile
};

// Que lados cada forma conecta (n, e, s, w) — o espelho exato do runtime (wireShapes.ts).
const SHAPES = [
  ['v', { n: true, e: false, s: true, w: false }],
  ['h', { n: false, e: true, s: false, w: true }],
  ['ne', { n: true, e: true, s: false, w: false }],
  ['nw', { n: true, e: false, s: false, w: true }],
  ['se', { n: false, e: true, s: true, w: false }],
  ['sw', { n: false, e: false, s: true, w: true }],
  ['x', { n: true, e: true, s: true, w: true }],
];

// A capa ocupa a faixa 6..9 (4px). O nucleo energizado, 7..8 (2px).
const LO = 6;
const HI = 9;

export default {
  name: 'wire',
  kind: 'connector',
  layout: 'row',
  palette: PAL,
  draw({ Pix, hexToRgb }) {
    const c = Object.fromEntries(Object.entries(PAL).map(([key, hex]) => [key, hexToRgb(hex)]));

    // A regiao da capa: o bloco central + uma faixa ate cada borda conectada. Fora do tile
    // conta como capa quando aquele lado conecta — e o que impede a aresta de luz de fechar
    // as pontas abertas (a capa "continua" no vizinho, entao a emenda nao tem borda).
    const makeRegion = (dirs) => (x, y) => (
      (x >= LO && x <= HI && y >= LO && y <= HI)
      || (dirs.n && x >= LO && x <= HI && y < LO)
      || (dirs.s && x >= LO && x <= HI && y > HI)
      || (dirs.w && y >= LO && y <= HI && x < LO)
      || (dirs.e && y >= LO && y <= HI && x > HI)
    );

    const drawOff = (dirs) => {
      const pix = new Pix(16, 16);
      const has = makeRegion(dirs);
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 16; x += 1) {
          if (!has(x, y)) continue;
          // Aresta iluminada onde a capa termina pra cima/esquerda; sombra onde termina pra
          // baixo/direita; corpo ink no miolo — o cluster shading dos aros do barril.
          const litEdge = !has(x, y - 1) || !has(x - 1, y);
          const shadowEdge = !has(x, y + 1) || !has(x + 1, y);
          pix.set(x, y, litEdge ? c.E : (shadowEdge ? c.k : c.K));
        }
      }
      // Bracadeiras de pedra nas bordas conectadas: 1px na borda, cobrindo a capa e um dente
      // pra fora de cada lado, metade clara/metade sombra (a aresta dura do rock.png). Duas
      // metades vizinhas somam UMA bracadeira exatamente sobre a emenda.
      const span = [LO - 1, LO, LO + 1, HI - 1, HI, HI + 1];
      if (dirs.n) span.forEach((i) => pix.set(i, 0, i <= 7 ? c.S : c.s));
      if (dirs.s) span.forEach((i) => pix.set(i, 15, i <= 7 ? c.S : c.s));
      if (dirs.w) span.forEach((i) => pix.set(0, i, i <= 7 ? c.S : c.s));
      if (dirs.e) span.forEach((i) => pix.set(15, i, i <= 7 ? c.S : c.s));
      return pix;
    };

    const drawOn = (dirs) => {
      const pix = new Pix(16, 16);
      const core = (x, y) => pix.set(x, y, c.g);
      if (dirs.n) for (let y = 0; y <= 8; y += 1) { core(7, y); core(8, y); }
      if (dirs.s) for (let y = 7; y <= 15; y += 1) { core(7, y); core(8, y); }
      if (dirs.w) for (let x = 0; x <= 8; x += 1) { core(x, 7); core(x, 8); }
      if (dirs.e) for (let x = 7; x <= 15; x += 1) { core(x, 7); core(x, 8); }
      // O miolo do tile e o ponto mais quente do filete — o pulso do runtime respira sobre ele.
      pix.set(7, 7, c.Y); pix.set(8, 7, c.Y);
      pix.set(7, 8, c.Y); pix.set(8, 8, c.Y);
      return pix;
    };

    const offs = SHAPES.map(([, dirs]) => drawOff(dirs));
    const ons = SHAPES.map(([, dirs]) => drawOn(dirs));
    return [...offs, ...ons];
  },
  notes: 'Cabo de energia em 14 frames: 7 formas apagadas (v h ne nw se sw x) + os 7 filetes gold '
    + 'do banco aceso, que o runtime deita por cima em aditivo. Capa ink sombreada com a propria '
    + 'rampa ink (aresta #324476 na luz, #141d38 na sombra — os aros do barril), correndo de borda '
    + 'a borda para emendar entre tiles sem costura: as pontas abertas nao recebem aresta. '
    + 'Bracadeiras stone coladas nas bordas conectadas somam uma so sobre a emenda de dois tiles. '
    + 'Nucleo na rampa gold oficial com miolo claro no centro.',
};
