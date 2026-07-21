// Portao eletronico fail-safe — sprite 2D 16x16 do runtime E do editor. O corpo inteiro vive em
// um Billboard3D, como os outros props do jogo; abrir e uma animacao de quatro poses pixeladas,
// nunca escala suave nem geometria 3D.
//
// Dois bancos preservam o estado eletrico em qualquer pose:
//   frames 0..3 = sem energia (lampada apagada; fechamento por gravidade)
//   frames 4..7 = energizado (lampada verde; motor erguendo/segurando a grade)

const makeFrame = (phase, powered) => {
  const pixels = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => '.'));
  const put = (x, y, c) => { pixels[y][x] = c; };
  const hline = (x0, x1, y, c) => { for (let x = x0; x <= x1; x += 1) put(x, y, c); };

  // Batentes de pedra/metal: claro a esquerda, sombra a direita, pes navy ancorando no chao.
  for (let y = 3; y <= 13; y += 1) {
    put(1, y, 'K'); put(2, y, y % 3 === 0 ? 'H' : 'S');
    put(13, y, 'S'); put(14, y, 'K');
  }
  hline(1, 3, 14, 'K');
  hline(12, 14, 14, 'K');

  // Travessa/motor: um arco pesado com faixa de risco gold e lampada do circuito embutida.
  hline(3, 12, 1, 'I');
  hline(2, 13, 2, 'K');
  hline(2, 5, 3, 'H');
  hline(6, 10, 3, 'S');
  hline(11, 13, 3, 'S');
  put(3, 3, powered ? 'G' : 'k');
  put(5, 3, 'Y'); put(7, 3, 'A'); put(9, 3, 'Y'); put(11, 3, 'A');
  put(12, 3, 'k'); // cavidade do tambor mantem a rampa ink completa mesmo energizado
  hline(2, 13, 4, 'K');

  // A grade sobe ATRAS da travessa. O topo some dentro do motor; so a borda inferior recua.
  const lift = [0, 3, 6, 9][phase];
  const bottom = 13 - lift;
  if (bottom >= 5) {
    for (const x of [4, 7, 10, 12]) {
      for (let y = 5; y <= bottom; y += 1) put(x, y, x === 4 ? 'H' : 'S');
    }
    // Trilhos que ainda estao abaixo da caixa do motor. A ultima barra marca o pe da grade.
    for (const baseRail of [5, 9, 13]) {
      const y = baseRail - lift;
      if (y >= 5 && y <= bottom) hline(3, 12, y, y === bottom ? 'K' : 'A');
    }
    hline(3, 12, bottom, 'K');
  }

  return pixels.map((row) => row.join(''));
};

export default {
  name: 'electronic-gate',
  kind: 'prop',
  layout: 'row',
  palette: {
    k: '#141d38', // cavidade/lampada apagada
    K: '#1d2b53', // ink — contorno, barras e contato
    A: '#243669', // ink medio — trilhos recebendo luz
    I: '#324476', // ink claro — topo da caixa do motor
    S: '#7c7e8b', // metal base
    H: '#a9abbe', // aresta iluminada pela esquerda
    Y: '#f1cc36', // faixa de risco, o gold do fio energizado
    G: '#7dde99', // lampada de circuito, mesma gramatica de roda/caldeira/placa
  },
  frames: [
    makeFrame(0, false), makeFrame(1, false), makeFrame(2, false), makeFrame(3, false),
    makeFrame(0, true), makeFrame(1, true), makeFrame(2, true), makeFrame(3, true),
  ],
  notes: 'Portao eletronico 2D em oito frames: quatro alturas da grade em bancos sem/com energia. '
    + 'Silhueta fixa de batentes, travessa e motor; apenas a grade sobe atras do arco e a lampada '
    + 'muda. Paleta oficial ink+stone+gold+meadow, luz dura da esquerda, alpha binario.',
};
