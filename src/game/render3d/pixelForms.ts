// AS REGRAS DA ARTE GERADA EM CÓDIGO, para os desenhos maiores (casas, nave). A luz vem de cima e da
// esquerda, a mesma do resto do jogo. Volume é cálculo de luz, nunca escurecer em volta do contorno
// (pillow shading). Cada material é uma rampa de quatro tons, do claro ao escuro: o claro esquenta e o
// escuro esfria, em vez de só perder brilho. Faixas repetidas se desencontram (sem banding).

export type Paint = (color: string, x: number, y: number, w: number, h: number) => void;
/** Do mais claro ao mais escuro. */
export type Ramp = readonly [string, string, string, string];

export const INK = '#201812';
/**
 * O tom de quem tem branco na arte. O sol multiplica a cor por (1,96; 1,64; 1,33): acima da metade do
 * brilho a arte estoura, e um tom neutro deixa o branco bege. Este é mais frio na medida certa.
 */
export const WHITE_SAFE_TINT = 0xa0a8b8;

export const RAMPS = {
  metal: ['#e4e2d2', '#b7b6ac', '#83848c', '#535668'],
  orange: ['#f4a050', '#d0702a', '#a04a26', '#6e2f28'],
  wood: ['#cf9a5c', '#98663a', '#6a4228', '#432a26'],
  thatch: ['#b08850', '#86603a', '#5e4028', '#452c22'],
  stone: ['#bab6a6', '#8e8c84', '#66666e', '#464652'],
  plaster: ['#f2e8cf', '#d9d0b9', '#aea996', '#85817c'],
  pink: ['#ea8ba6', '#c9628a', '#9c4474', '#6e2f5c'],
  cap: ['#de6a4a', '#a8452e', '#7a2c2c', '#521d28'],
  stem: ['#f2e6c4', '#ddd0ae', '#b0a282', '#7f786a'],
  door: ['#8a6038', '#6b4a2c', '#4c3224', '#33211f'],
  blue: ['#5a94b4', '#3a6e8e', '#2c5470', '#1f3a56'],
} as const satisfies Record<string, Ramp>;

/** O tom da rampa para esta luz, de -1 a 1. As fronteiras fazem curvas limpas, não degraus de ruído. */
export const toneOf = (ramp: Ramp, light: number): string => {
  if (light > 0.62) return ramp[0];
  if (light > 0.2) return ramp[1];
  if (light > -0.22) return ramp[2];
  return ramp[3];
};

/** Uma cúpula: meia elipse apoiada em `bottom`, iluminada como volume. */
export const paintDome = (rect: Paint, cx: number, bottom: number, rx: number, ry: number, ramp: Ramp): void => {
  const inside = (x: number, y: number, grow: number): boolean => {
    const nx = (x + 0.5 - cx) / (rx + grow);
    const ny = (y + 0.5 - bottom) / (ry + grow);
    return ny <= 0 && nx * nx + ny * ny <= 1;
  };
  for (let y = Math.floor(bottom - ry - 1); y <= bottom; y += 1) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x += 1) {
      if (inside(x, y, 0)) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - bottom) / ry;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        rect(toneOf(ramp, nx * -0.62 + ny * -0.55 + nz * 0.45), x, y, 1, 1);
      } else if (inside(x, y, 1)) {
        rect(INK, x, y, 1, 1);
      }
    }
  }
};

/** Um corpo redondo em pé: em cada linha a meia largura é `half(y)`, e a luz bate pela esquerda. */
export const paintColumn = (rect: Paint, cx: (y: number) => number, top: number, bottom: number, half: (y: number) => number, ramp: Ramp): void => {
  for (let y = top; y <= bottom; y += 1) {
    const h = half(y);
    const c = cx(y);
    const left = Math.round(c - h);
    const right = Math.round(c + h);
    rect(INK, left - 1, y, 1, 1);
    rect(INK, right, y, 1, 1);
    for (let x = left; x < right; x += 1) {
      const nx = (x + 0.5 - c) / Math.max(1, h);
      rect(toneOf(ramp, nx * -0.95 + 0.12), x, y, 1, 1);
    }
  }
};
