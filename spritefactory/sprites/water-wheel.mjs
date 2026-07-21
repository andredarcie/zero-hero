// Roda d'agua + dinamo — uma maquina completa dentro de UM tile 16x16.
//
// Dois bancos de oito frames preservam a pose exata quando a tensao muda:
//   0..7   = rotor sem energia, lampada apagada;
//   8..15  = as mesmas poses, lampada verde.
//
// A revisao v2 abandona a leitura clara/limpa demais do primeiro aro. A roda agora segue os
// props shipped: silhueta em ink navy, tres degraus duros de madeira sob luz da esquerda,
// carcaca de pedra em dois valores, e clusters de agua na base. Nada e degradê, outline preto,
// anti-aliasing ou ruido de um pixel. A estrutura fica legivel a 1x e assenta DENTRO do rio.

const PAL = {
  K: '#1d2b53', // ink — silhueta, ferragens, cavidades e tomada apagada
  D: '#63452c', // wood escuro — pas e lado de sombra
  M: '#815938', // wood medio — massa estrutural
  L: '#b7916a', // wood claro — aresta sob a luz da esquerda
  S: '#7c7e8b', // stone media — carcaca do dinamo
  H: '#989aa7', // stone clara — bevel e eixo
  G: '#7dde99', // energia — mesma lampada da placa, caldeira e portao
  W: '#557998', // agua fria — cluster na linha de imersao
};

const PHASES = 8;
const CX = 6;
const CY = 6.5;

const line = (pix, x0, y0, x1, y1, rgb) => {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - x);
  const sx = x < tx ? 1 : -1;
  const dy = -Math.abs(ty - y);
  const sy = y < ty ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pix.set(x, y, rgb);
    if (x === tx && y === ty) break;
    const beforeX = x;
    const beforeY = y;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    // Toda diagonal vira uma escada 4-neighbour; nenhum raio e uma corrente de pixels soltos.
    if (x !== beforeX && y !== beforeY) pix.set(x, beforeY, rgb);
  }
};

const woodAt = (dx, dy, c) => {
  if (dx < -1.8 || dy < -3.5) return c.L;
  if (dx > 2.4 || dy > 3.4) return c.D;
  return c.M;
};

export default {
  name: 'water-wheel',
  kind: 'prop',
  layout: 'row',
  palette: PAL,
  draw({ Pix, hexToRgb }) {
    const c = Object.fromEntries(Object.entries(PAL).map(([key, hex]) => [key, hexToRgb(hex)]));

    const drawFrame = (phase, powered) => {
      const pix = new Pix(16, 16);
      const angle = phase * (Math.PI / 16); // oito poses fecham o periodo de 90 graus dos raios

      // Agua presa ao pe do sprite: dois clusters largos, nunca pontilhado. A agua real do mundo
      // corta a base no runtime; estes pixels deixam a mesma instalacao inequivoca no editor.
      pix.hline(0, 8, 14, c.W);
      pix.hline(2, 13, 15, c.W);
      pix.hline(9, 15, 14, c.W);

      // Cavalete atras do rotor. Ink e a ferragem estrutural; a luz so alcanca a face esquerda.
      line(pix, 4, 7, 2, 14, c.K);
      line(pix, 8, 7, 10, 14, c.K);
      line(pix, 4, 8, 3, 13, c.L);
      line(pix, 8, 8, 9, 13, c.D);
      pix.hline(2, 10, 14, c.K);

      // Raios primeiro, para o aro realmente passar POR CIMA das pontas. Quatro barras tem
      // periodo de 90 graus, mas a luz fixa no mundo muda o valor de cada barra ao girar.
      for (let i = 0; i < 4; i += 1) {
        const a = angle + i * Math.PI / 2;
        const ex = CX + Math.cos(a) * 4.45;
        const ey = CY + Math.sin(a) * 4.45;
        line(pix, CX, CY, ex, ey, woodAt(Math.cos(a) * 4, Math.sin(a) * 4, c));
      }

      // Contorno estrutural navy + face de madeira por dentro. O aro antigo era quase todo bege
      // e lia como vetor liso; esta dupla faixa segue caixa/vaso: silhueta escura, massa chapada.
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 13; x += 1) {
          const dx = x + 0.5 - CX;
          const dy = y + 0.5 - CY;
          const d = Math.hypot(dx, dy);
          if (d >= 5.15 && d <= 5.85) pix.set(x, y, c.K);
          else if (d >= 4.25 && d < 5.15) pix.set(x, y, woodAt(dx, dy, c));
        }
      }

      // Oito pas tangenciais, com uma raiz ink ligada ao aro e uma face de madeira de dois pixels.
      // A raiz evita que as extremidades virem ruido ao trocar de frame.
      for (let i = 0; i < 8; i += 1) {
        const a = angle + i * Math.PI / 4;
        const rootX = Math.round(CX + Math.cos(a) * 5.15);
        const rootY = Math.round(CY + Math.sin(a) * 5.15);
        const tx = Math.round(-Math.sin(a));
        const ty = Math.round(Math.cos(a));
        const face = woodAt(Math.cos(a) * 5, Math.sin(a) * 5, c);
        pix.set(rootX, rootY, c.K);
        pix.set(rootX + tx, rootY + ty, face);
        // A pa no semicirculo baixo carrega um segundo pixel: volume onde a agua faz trabalho.
        if (Math.sin(a) > 0.2) pix.set(rootX + tx, rootY + ty + 1, face);
      }

      // Cubo metalico 3x3: o highlight ocupa o quadrante alto/esquerdo e a sombra e o proprio ink.
      pix.set(5, 5, c.H); pix.set(6, 5, c.H); pix.set(7, 5, c.K);
      pix.set(5, 6, c.H); pix.set(6, 6, c.S); pix.set(7, 6, c.K);
      pix.set(5, 7, c.K); pix.set(6, 7, c.K); pix.set(7, 7, c.K);

      // Dinamo no primeiro plano, preso ao eixo. O cabo do runtime termina sob esta caixa; a
      // lampada em G confirma que a corrente entrou de fato no fio, nao apenas que a roda girou.
      pix.hline(8, 12, 8, c.K); // eixo ate a carcaca
      pix.fillRect(10, 9, 5, 5, c.K);
      pix.hline(11, 14, 9, c.H);
      pix.fillRect(11, 10, 3, 3, c.S);
      pix.set(11, 10, c.H);
      pix.set(12, 11, c.K);
      pix.set(13, 11, powered ? c.G : c.K);
      pix.set(13, 12, powered ? c.G : c.K);
      pix.hline(10, 15, 14, c.K); // pe/tomada assentado na margem do canal

      return pix;
    };

    return [
      ...Array.from({ length: PHASES }, (_, phase) => drawFrame(phase, false)),
      ...Array.from({ length: PHASES }, (_, phase) => drawFrame(phase, true)),
    ];
  },
  notes: 'Roda d agua v2: billboard 16x16 coerente com os props shipped. Aro com silhueta ink e '
    + 'cluster shading wood, oito pas tangenciais conectadas, cubo stone, agua na linha de imersao '
    + 'e dinamo com lampada verde. Oito poses discretas em bancos off/on preservam o momento sem '
    + 'rotacao subpixel; alpha binario e somente oito cores canonicas por frame.',
};
