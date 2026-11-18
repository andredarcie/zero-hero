// A GRADE DO ACAMPAMENTO, DESENHADA NO CHÃO (pedido do autor, 2026-11-17: "a grid que aparece no cenário, faça ela
// seguir mais o tema geral do jogo e se encaixar mais naturalmente e claramente no cenário, ser mais bonita").
//
// A primeira grade era um desenho por cima da tela: quadriláteros chapados de verde e vermelho a 36%, de linha fina e
// lisa, na frente de tudo — do herói, das peças, do mato. Não estava NO chão, estava no vidro.
//
// Agora cada tile da grade é um quadradinho de PIXEL ART de 16×16, deitado no chão do mundo, na mesma escala de pixel
// do resto (16 por tile): o mato em pé e as peças ficam na frente dele, e ele some atrás deles. As cores são da paleta
// do tileset. A ideia é a de um CANTEIRO marcado no chão:
//   · LIVRE: um canteiro de cantos arredondados, recuado um pixel da beira (dois canteiros vizinhos ficam separados
//     por um vão, como lotes), com a borda em verde-claro, o miolo em verde-musgo translúcido e a luz da esquerda
//     de cima (a borda de cima e da esquerda mais clara, a de baixo e da direita mais escura) — parece afundado no
//     chão, pronto para receber;
//   · MATO: o vermelho em HACHURA diagonal de pena (o traço do papel do jogo), com a borda pontilhada — "isto aqui a
//     foice abre";
//   · FECHADO (o tile que trancaria o caminho, a coisa no chão, o herói): o mesmo vermelho, mais calmo, com um × no meio;
//   · PEÇA: só os quatro cantos em creme — dá para levantar e mudar de lugar;
//   · o CURSOR: cantos grossos em creme com contorno escuro (lê em qualquer chão), verdes ou vermelhos conforme o tile.

export const GRID_PX = 16;

type Rgba = readonly [number, number, number, number];
const C = {
  rim: [0xe1, 0xf7, 0xa6, 205],
  rimDark: [0x39, 0x57, 0x1c, 220],
  moss: [0x4a, 0x5e, 0x3a, 92],
  mossLight: [0x6f, 0x8a, 0x4c, 110],
  hatch: [0xc8, 0x3e, 0x3e, 100],
  redWash: [0xa5, 0x30, 0x30, 52],
  redSoft: [0xa5, 0x30, 0x30, 70],
  redLine: [0xe8, 0x3b, 0x3b, 225],
  redRim: [0xc8, 0x3e, 0x3e, 210],
  redDark: [0xa5, 0x30, 0x30, 200],
  cream: [0xe3, 0xda, 0xd1, 235],
  ink: [0x25, 0x24, 0x22, 235],
} as const satisfies Record<string, Rgba>;

export type GridArt = 'free' | 'grass' | 'blocked' | 'piece' | 'cursorOk' | 'cursorNo';

type Pixels = Uint8ClampedArray<ArrayBuffer>;
const canvas = (): Pixels => new Uint8ClampedArray(GRID_PX * GRID_PX * 4);
const put = (px: Uint8ClampedArray, x: number, y: number, c: Rgba): void => {
  if (x < 0 || y < 0 || x >= GRID_PX || y >= GRID_PX) return;
  px.set(c, (y * GRID_PX + x) * 4);
};

/** O contorno de cantos arredondados, recuado `inset` pixels da beira: os pixels dele, em volta. */
const roundRect = (inset: number): Array<{ x: number; y: number; side: 'top' | 'left' | 'bottom' | 'right' }> => {
  const a = inset;
  const b = GRID_PX - 1 - inset;
  const out: Array<{ x: number; y: number; side: 'top' | 'left' | 'bottom' | 'right' }> = [];
  for (let i = a + 1; i < b; i += 1) {
    out.push({ x: i, y: a, side: 'top' }, { x: i, y: b, side: 'bottom' });
    out.push({ x: a, y: i, side: 'left' }, { x: b, y: i, side: 'right' });
  }
  return out;
};

const free = (): Pixels => {
  const px = canvas();
  for (let y = 2; y < GRID_PX - 2; y += 1) for (let x = 2; x < GRID_PX - 2; x += 1) put(px, x, y, C.moss);
  // a luz da esquerda de cima: uma fileira mais clara junto da borda de cima e da esquerda, por dentro
  for (let i = 2; i < GRID_PX - 3; i += 1) {
    put(px, i, 2, C.mossLight);
    put(px, 2, i, C.mossLight);
  }
  for (const p of roundRect(1)) put(px, p.x, p.y, p.side === 'top' || p.side === 'left' ? C.rim : C.rimDark);
  return px;
};

const grass = (): Pixels => {
  const px = canvas();
  // o mesmo canteiro do livre, em vermelho: o miolo lavado e uma hachura de pena rala (uma diagonal a cada seis)
  for (let y = 2; y < GRID_PX - 2; y += 1) {
    for (let x = 2; x < GRID_PX - 2; x += 1) put(px, x, y, (x + y) % 6 === 0 ? C.hatch : C.redWash);
  }
  for (const p of roundRect(1)) put(px, p.x, p.y, p.side === 'top' || p.side === 'left' ? C.redRim : C.redDark);
  return px;
};

const blocked = (): Pixels => {
  const px = canvas();
  for (let y = 2; y < GRID_PX - 2; y += 1) for (let x = 2; x < GRID_PX - 2; x += 1) put(px, x, y, C.redSoft);
  for (const p of roundRect(1)) if ((p.x + p.y) % 2 === 0) put(px, p.x, p.y, C.redLine);
  // o × do meio, 5 pixels, com o contorno escuro só embaixo (a sombra dele no chão)
  for (let i = -2; i <= 2; i += 1) {
    put(px, 7 + i, 8 + i + 1, C.ink);
    put(px, 7 + i, 8 - i + 1, C.ink);
  }
  for (let i = -2; i <= 2; i += 1) {
    put(px, 7 + i, 8 + i, C.redLine);
    put(px, 7 + i, 8 - i, C.redLine);
  }
  return px;
};

/** Os quatro cantos em L, de `len` pixels, `w` de grossura, recuados `inset`. */
const corners = (px: Uint8ClampedArray, inset: number, len: number, w: number, c: Rgba): void => {
  const a = inset;
  const b = GRID_PX - 1 - inset;
  for (let t = 0; t < w; t += 1) {
    for (let i = 0; i < len; i += 1) {
      for (const [x, y] of [[a + i, a + t], [a + t, a + i], [b - i, a + t], [b - t, a + i], [a + i, b - t], [a + t, b - i], [b - i, b - t], [b - t, b - i]]) {
        put(px, x, y, c);
      }
    }
  }
};

const piece = (): Pixels => {
  const px = canvas();
  corners(px, 1, 4, 1, C.cream);
  return px;
};

const cursor = (ok: boolean): Pixels => {
  const px = canvas();
  // o contorno escuro primeiro (um pixel para fora), depois o canto claro por cima
  corners(px, 0, 6, 3, C.ink);
  corners(px, 0, 5, 2, ok ? C.cream : C.redLine);
  return px;
};

/** Os pixels (RGBA, 16×16, fileira 0 = o norte) de cada desenho da grade. */
export const paintGridArt = (art: GridArt): Pixels => {
  switch (art) {
    case 'free': return free();
    case 'grass': return grass();
    case 'blocked': return blocked();
    case 'piece': return piece();
    case 'cursorOk': return cursor(true);
    case 'cursorNo': return cursor(false);
  }
};
