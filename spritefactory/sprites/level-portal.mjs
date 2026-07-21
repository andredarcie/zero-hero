// Portal de saida medieval: quatro frames de um arco de alvenaria fixo envolvendo um
// turbilhao roxo. A pedra nunca muda entre frames; somente a energia no vao e os pequenos
// motes externos avancam, preservando a silhueta e a leitura de prop solido do jogo.

const STONE_ROWS = [
  null,
  [6, 9],
  [4, 11],
  [3, 12],
  [2, 13],
  [2, 13],
  [2, 13],
  [2, 13],
  [2, 13],
  [2, 13],
  [2, 13],
  [2, 13],
  [2, 13],
  [1, 14],
  [1, 14],
  null,
];

const OPENING_ROWS = [
  null, null, null,
  [6, 9],
  [5, 10],
  [5, 10],
  [5, 10],
  [5, 10],
  [5, 10],
  [5, 10],
  [5, 10],
  [5, 10],
  [5, 10],
  [5, 10],
  null,
  null,
];

// Faixas curvas pre-autorizadas: desloca-las um pixel por frame da a leitura de um fluxo
// ascendente/helicoidal sem ruido aleatorio ou interpolacao subpixel.
const FLOW = [
  'phppdd',
  'hppddd',
  'ppdddp',
  'pdddph',
  'dddphp',
  'ddphpp',
  'dphppd',
  'phppdd',
  'hppddp',
  'ppddph',
  'pddphp',
];

const MOTES = [
  [[1, 5], [14, 9], [4, 1]],
  [[1, 8], [14, 5], [11, 1]],
  [[2, 3], [14, 11], [4, 12]],
  [[1, 11], [13, 2], [11, 12]],
];

const makeFrame = (phase) => {
  const pixels = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => '.'));
  const put = (x, y, c) => { pixels[y][x] = c; };

  // Arco de pedra: contorno ink, face clara no alto/esquerda e massa sombreada a direita.
  // A logica de vizinhanca cria dois contornos limpos: a silhueta externa e o batente do vao.
  for (let y = 0; y < 16; y += 1) {
    const stone = STONE_ROWS[y];
    if (!stone) continue;
    const opening = OPENING_ROWS[y];
    for (let x = stone[0]; x <= stone[1]; x += 1) {
      const inOpening = opening && x >= opening[0] && x <= opening[1];
      if (inOpening) continue;
      const exteriorEdge = x === stone[0] || x === stone[1]
        || !STONE_ROWS[y - 1] || x < STONE_ROWS[y - 1][0] || x > STONE_ROWS[y - 1][1];
      const interiorEdge = opening && (x === opening[0] - 1 || x === opening[1] + 1);
      if (y === 14) put(x, y, x <= 5 ? 'A' : x >= 11 ? 'N' : 'K');
      else if (exteriorEdge) put(x, y, x === stone[1] ? 'N' : 'K');
      else if (interiorEdge) put(x, y, x < 8 ? 'A' : 'N');
      else if (x <= 6 || y <= 3) put(x, y, 'L');
      else if (x >= 10) put(x, y, 'S');
      else put(x, y, 'M');
    }
  }

  // Juntas irregulares, grandes o bastante para ler como blocos de alvenaria a 1x.
  for (const [x, y] of [[3, 5], [4, 5], [11, 6], [12, 6], [2, 8], [3, 8],
    [11, 9], [12, 9], [3, 11], [4, 11], [11, 12], [12, 12]]) put(x, y, 'K');
  for (const [x, y] of [[4, 4], [3, 7], [12, 8], [4, 10], [12, 11], [6, 13], [10, 13]]) {
    if (pixels[y][x] !== '.') put(x, y, 'S');
  }
  // Pequenos lascados de highlight na face esquerda quebram a simetria artificial.
  for (const [x, y] of [[5, 2], [3, 4], [2, 6], [3, 9], [2, 12], [4, 13]]) {
    if (pixels[y][x] !== '.') put(x, y, 'L');
  }

  // Vortice roxo: o mesmo desenho corre pela abertura em quatro fases discretas.
  for (let y = 3; y <= 13; y += 1) {
    const opening = OPENING_ROWS[y];
    if (!opening) continue;
    const width = opening[1] - opening[0] + 1;
    const row = FLOW[y - 3];
    for (let localX = 0; localX < width; localX += 1) {
      const flowIndex = (localX - phase + row.length) % row.length;
      put(opening[0] + localX, y, row[flowIndex]);
    }
  }
  // Soleira de energia: uma linha luminosa separa o vao do bloco de base.
  for (let x = 5; x <= 10; x += 1) put(x, 13, x === 5 || x === 10 ? 'p' : 'h');

  // Particulas embutidas garantem vida ate no editor; o runtime acrescenta motes orbitais.
  for (const [x, y] of MOTES[phase]) put(x, y, phase % 2 === 0 ? 'h' : 'p');

  return pixels.map((row) => row.join(''));
};

export default {
  name: 'level-portal',
  kind: 'prop',
  layout: 'row',
  palette: {
    N: '#141d38', // ink profundo: lado direito e contato com o chao
    K: '#1d2b53', // ink: silhueta, juntas e rebaixo do arco
    A: '#324476', // ink iluminado: bevel interno e topo da soleira
    S: '#5d6165', // pedra em sombra
    L: '#a9abbe', // aresta de pedra iluminada pela esquerda
    d: '#39228b', // energia profunda, ja presente nos sprites do jogo
    p: '#882c98', // roxo vivo dos portais shipped
    h: '#af3fc3', // brilho/motes dos portais shipped
  },
  frames: [makeFrame(0), makeFrame(1), makeFrame(2), makeFrame(3)],
  allowOrphans: true,
  notes: 'Arco medieval de alvenaria em stone+ink envolvendo um vortice roxo animado em quatro '
    + 'fases. A pedra, a base e a silhueta permanecem byte-a-byte estaveis; somente as faixas de '
    + 'energia e tres motes mudam. Alpha binario, oito cores oficiais, luz dura da esquerda.',
};
