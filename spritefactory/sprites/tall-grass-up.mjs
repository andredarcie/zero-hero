// Mato alto EM PE — a versao billboard do tall grass, v3 PROCEDURAL apos estudo de referencias
// (SLYNYRD Pixelblog 33 "Wind Effects" + saint11 Vegetation). O que a pesquisa mudou aqui:
//
//   1. QUATRO frames, nao dois — uma brisa moderada pede 4 posicoes (SLYNYRD).
//   2. A onda VIAJA pela touceira: cada lamina mergulha UM FRAME depois da vizinha a oeste
//      ("when a leaf dips into the wind, the leaf nearest to it will dip on the next frame").
//      E isso — nao a amplitude — que separa vento organico de vai-e-vem mecanico; a v2
//      deslocava todas as pontas juntas e lia como um carimbo.
//   3. Cada lamina tem 3 poses no maximo (repouso / inclinada / mergulho), cicladas
//      N -> R -> W -> R; no mergulho a ponta CAI 1px alem de avancar ("up and right, down,
//      left" — o bob eliptico do tutorial, adaptado a lamina ancorada).
//   4. Alturas irregulares (13/11/11/9/8/6) em DUAS camadas de profundidade: laminas de tras
//      em sombra (D), frente em M com pontas L — a touceira ganha volume, nao vira leque.
//
// A base (torrao K + tocos curtos) e IDENTICA nos 4 frames: o vento move pontas, nunca raizes.
// Rasterizador conecta cada degrau da curva (L-steps) — nenhum pixel de lamina fica orfao.

const OLIVE_L = '#8a8d49'; // pontas ao luar — topo da rampa olive
const OLIVE_M = '#626439'; // o verde-base do mato (a identidade do grass_wind atual)
const OLIVE_D = '#4d4f2c'; // camada de tras / lado da sombra — fundo da rampa
const SOIL_K = '#3e2533'; // o torrao (nightsoil)

// Cada lamina: coluna da base (y=12), altura em px, curva de repouso (+E/-W, quadratica),
// camada ('front' = M com ponta L / 'back' = D), quantas linhas de ponta acendem, e a ORDEM
// na onda (0 = a primeira a sentir a rajada, vinda do oeste).
// v4: bases com VAO de 2 colunas entre as hastes da frente (5/8/11) — colunas adjacentes se
// fundiam num cacto — e as laminas de tras exatamente NAS colunas do vao (7/9), curtas: e pelo
// vao que a camada escura aparece e a touceira ganha profundidade em vez de virar massa.
const BLADES = [
  { baseX: 5, h: 8, rest: -1, layer: 'front', tipL: 1, wave: 0 },
  { baseX: 7, h: 6, rest: 0, layer: 'back', tipL: 0, wave: 1 },
  { baseX: 8, h: 12, rest: 0, layer: 'front', tipL: 2, wave: 1 },
  { baseX: 9, h: 8, rest: 1, layer: 'back', tipL: 0, wave: 2 },
  { baseX: 11, h: 10, rest: 1, layer: 'front', tipL: 1, wave: 3 },
];

// Pose por frame: cada lamina percorre N(0) -> R(1) -> W(2) -> R(1), defasada pela sua ordem
// na onda — em qualquer frame ha laminas em fases diferentes, e a rajada atravessa a touceira.
const POSE_CYCLE = [0, 1, 2, 1];
const BASE_Y = 12;

export default {
  name: 'tall-grass-up',
  kind: 'prop',
  layout: 'row',
  palette: { L: OLIVE_L, M: OLIVE_M, D: OLIVE_D, K: SOIL_K },
  draw({ Pix, hexToRgb }) {
    const rgb = { L: hexToRgb(OLIVE_L), M: hexToRgb(OLIVE_M), D: hexToRgb(OLIVE_D), K: hexToRgb(SOIL_K) };

    const drawBlade = (pix, blade, pose) => {
      const bend = pose; // 0 / 1 / 2 px de empurrao do vento na ponta
      const height = blade.h - (pose === 2 ? 1 : 0); // o mergulho DERRUBA a ponta 1px
      let prevX = blade.baseX;
      for (let i = 0; i < height; i += 1) {
        const t = i / (blade.h - 1); // 0 na base, ~1 na ponta
        const x = blade.baseX + Math.round(blade.rest * t * t + bend * t ** 1.6);
        const y = BASE_Y - i;
        const isTip = blade.layer === 'front' && i >= height - blade.tipL;
        const color = blade.layer === 'back' ? rgb.D : (isTip ? rgb.L : rgb.M);
        // L-step: conecta o degrau da curva na propria linha — lamina continua, sem orfaos.
        for (let xx = Math.min(prevX, x); xx <= Math.max(prevX, x); xx += 1) pix.set(xx, y, color);
        prevX = x;
      }
    };

    // A base, identica em TODO frame (vento e corte): o torrao que ancora a touceira no chao.
    const drawBase = (pix) => {
      pix.set(4, 13, rgb.M); // tocos curtos nas bordas do torrao (conectados a ele)
      pix.set(11, 13, rgb.M);
      pix.set(5, 13, rgb.M);
      pix.set(10, 13, rgb.M);
      for (let x = 6; x <= 9; x += 1) { pix.set(x, 13, rgb.K); pix.set(x, 14, rgb.K); }
    };

    const frames = [];
    for (let f = 0; f < 4; f += 1) {
      const pix = new Pix(16, 16);
      // Tras para frente: as laminas D primeiro, as M/L cobrem por cima onde cruzarem.
      const ordered = [...BLADES].sort((a, b) => (a.layer === 'back' ? -1 : 1) - (b.layer === 'back' ? -1 : 1));
      for (const blade of ordered) {
        drawBlade(pix, blade, POSE_CYCLE[(f + 4 - blade.wave) % 4]);
      }
      drawBase(pix);
      frames.push(pix);
    }

    // Frame 5 (indice 4): o TOQUINHO — a MESMA touceira depois da foice/fogo, nao uma arte
    // alheia. Cada haste vira um talo cortado de 1-3px na propria coluna da base; o pixel de
    // cima dos talos da frente e L, a face palida do corte (o que diz "isto foi CORTADO").
    const stump = new Pix(16, 16);
    stump.set(5, 12, rgb.M); stump.set(5, 11, rgb.L); // haste 1
    stump.set(7, 12, rgb.D); //                          haste de tras, rente
    stump.set(8, 12, rgb.M); stump.set(8, 11, rgb.M); stump.set(8, 10, rgb.L); // a haste alta
    stump.set(9, 12, rgb.D); stump.set(9, 11, rgb.D); // haste de tras
    stump.set(11, 12, rgb.M); stump.set(11, 11, rgb.L); // haste 5
    drawBase(stump);
    frames.push(stump);

    return frames;
  },
  notes: 'v4 procedural, pos-pesquisa (SLYNYRD Pixelblog 33 / saint11): frames 0-3 = onda de '
    + 'vento VIAJANDO oeste->leste (fase por lamina), 3 poses por lamina com queda de ponta no '
    + 'mergulho, alturas irregulares em 2 camadas de profundidade (tras em D). Frame 4 = o '
    + 'TOQUINHO pos-corte: os mesmos talos rentes com face de corte palida, mesmo torrao. Base '
    + 'identica em todos. Curvas quadraticas rasterizadas com L-steps — sem pixels orfaos.',
};
