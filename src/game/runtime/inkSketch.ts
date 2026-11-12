import { createCanvas } from '@/game/platform/platform';

/**
 * O DESENHO A PENA DE UM BICHO (o caderno de desenho, runtime/sketches): a arte do próprio jogo vira traço de tinta,
 * pixel por pixel, na ordem em que uma mão desenharia. Primeiro o CONTORNO, dando a volta no bicho a partir de cima;
 * depois a SOMBRA (o que é escuro na arte vira tinta cheia) e o HACHURADO (o claro vira riscos em diagonal, mais
 * fechados no meio-tom), varrendo em diagonal. O jogo revela os primeiros traços conforme o jogador desenha.
 */

/** 0 contorno, 1 sombra, 2 hachurado. */
export type InkTone = 0 | 1 | 2;
export interface InkStroke { x: number; y: number; tone: InkTone }
export type Rgba = (x: number, y: number) => readonly [number, number, number, number];

/** A partir desta opacidade o pixel é do bicho. */
const OPAQUE = 100;
const NEAR: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Duas cores vizinhas tão diferentes assim têm um traço entre elas (o olho, a asa, as manchas). */
const DETAIL = 0.22;
/**
 * A PENA É MAIS FINA QUE O PIXEL: cada pixel da arte vira 3×3 antes de virar traço. Com a pena do tamanho do pixel,
 * o contorno de um bicho de 8 pixels era quase o bicho inteiro, e o desenho saía um borrão escuro.
 */
export const INK_ZOOM = 3;

/** As três tintas: o traço cheio, a sombra e o risco leve do hachurado. */
export const INK_TONES: readonly string[] = ['rgba(38, 24, 12, 0.96)', 'rgba(58, 38, 20, 0.74)', 'rgba(84, 58, 32, 0.46)'];

export type Box = { x: number; y: number; w: number; h: number };

/** O retângulo do desenho dentro do quadro (sem a margem vazia), ou null se o quadro está vazio. */
export const artBox = (w: number, h: number, rgba: Rgba): Box | null => {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (rgba(x, y)[3] <= OPAQUE) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};

/** O desenho recortado no retângulo e ampliado `k` vezes (cada pixel da arte vira k×k). */
export const zoomed = (rgba: Rgba, box: Box, k: number): Rgba => (x, y) => rgba(box.x + Math.floor(x / k), box.y + Math.floor(y / k));

const lumOf = (c: readonly [number, number, number, number]): number => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

export const inkStrokes = (w: number, h: number, rgba: Rgba): InkStroke[] => {
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && rgba(x, y)[3] > OPAQUE;
  const contour: Array<{ x: number; y: number }> = [];
  const detail: InkStroke[] = [];
  const inner: InkStroke[] = [];
  let cx = 0;
  let cy = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!solid(x, y)) continue;
      if (!NEAR.every(([dx, dy]) => solid(x + dx, y + dy))) {
        contour.push({ x, y });
        cx += x;
        cy += y;
        continue;
      }
      const lum = lumOf(rgba(x, y));
      // O traço de dentro fica do lado mais escuro da divisa entre duas cores.
      if (NEAR.some(([dx, dy]) => lumOf(rgba(x + dx, y + dy)) - lum > DETAIL)) detail.push({ x, y, tone: 0 });
      else if (lum < 0.4) inner.push({ x, y, tone: 1 });
      else if (lum < 0.68 ? (x + y) % 2 === 0 : (x + y) % 3 === 0) inner.push({ x, y, tone: 2 });
    }
  }
  if (contour.length) {
    cx /= contour.length;
    cy /= contour.length;
  }
  // A volta da pena: o ângulo de cada pixel em volta do meio do bicho, começando em cima, no sentido do relógio.
  const turn = (p: { x: number; y: number }): number => (Math.atan2(p.y - cy, p.x - cx) + Math.PI * 2.5) % (Math.PI * 2);
  contour.sort((p, q) => turn(p) - turn(q));
  const sweep = (p: InkStroke, q: InkStroke): number => (p.x + p.y) - (q.x + q.y) || p.x - q.x;
  detail.sort(sweep);
  inner.sort(sweep);
  return [...contour.map(({ x, y }) => ({ x, y, tone: 0 as const })), ...detail, ...inner];
};

/** Pinta os `upTo` primeiros traços num canvas do tamanho do desenho (um pixel de arte, um pixel). */
export const paintInk = (canvas: HTMLCanvasElement, w: number, h: number, strokes: readonly InkStroke[], upTo: number): void => {
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  const n = Math.min(strokes.length, Math.max(0, Math.floor(upTo)));
  for (let i = 0; i < n; i += 1) {
    const s = strokes[i];
    ctx.fillStyle = INK_TONES[s.tone];
    ctx.fillRect(s.x, s.y, 1, 1);
  }
};

/** O desenho em `progress` (0..1) como data URL. */
export const inkUrl = (w: number, h: number, strokes: readonly InkStroke[], progress: number): string => {
  const c = createCanvas();
  paintInk(c, w, h, strokes, Math.ceil(progress * strokes.length));
  return c.toDataURL();
};
