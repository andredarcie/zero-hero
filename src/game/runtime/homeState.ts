import { DYE_COLORS, type DyeKind } from '@/game/quests/dyePlants';

/**
 * O LAR DO HERÓI (pedido do autor, 2026-11-17: "lar que é seu" era a maior lacuna do jogo diante dos cozy games): o
 * acampamento ganha uma BANCADA (os enfeites passam a existir), uma TINA DE TINGIR (a capa do Zero e a manta do
 * colchão na cor que o jogador quiser) e uma PLACA (o nome do lugar, escrito por ele). Aqui mora só a regra pura: as
 * cores, o tom de cada uma no pano, a troca de paleta e o nome limpo. O estado vive no save (`adventureState().home`).
 */

/** A cor de um pano: a NATURAL (sem tinta: a capa verde e a manta listrada de sempre) ou uma tinta do vale. */
export type ClothDye = 'natural' | DyeKind | 'violeta';

/**
 * As cores, na ordem da tina. As quatro são as plantas de tinta da Sisi (quests/dyePlants), e o VIOLETA é o tingimento
 * por cima: o pano azul de anil mergulhado na garança sai roxo — é assim que o roxo se fazia antes das tintas de
 * fábrica.
 */
export const CLOTH_DYES: readonly ClothDye[] = ['natural', 'urucum', 'anil', 'curcuma', 'garanca', 'violeta'];

/** O que a tina tinge: a capa que o herói veste e a manta do colchão do acampamento. */
export type ClothTarget = 'cape' | 'blanket';

/** A capa do Zero: os três verdes do `hero.png`, do claro ao escuro (o mesmo pano aparece na viseira e nas costas). */
export const CAPE_GREENS: readonly [string, string, string] = ['#3f8f55', '#33784a', '#28613f'];

/** A cor de cada tinta como ela sai no pano (a amostra da tina). */
export const DYE_SWATCH: Readonly<Record<Exclude<ClothDye, 'natural'>, string>> = {
  ...DYE_COLORS,
  violeta: '#6a3a8c',
};

/** É uma cor que a tina conhece? (O save pode guardar qualquer coisa.) */
export const isClothDye = (value: unknown): value is ClothDye =>
  typeof value === 'string' && (CLOTH_DYES as readonly string[]).includes(value);

const hex = (n: number): string => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

const toRgb = (color: string): [number, number, number] => {
  const v = Number.parseInt(color.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

const toHsl = ([r, g, b]: readonly [number, number, number]): [number, number, number] => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6 : max === gn ? ((bn - rn) / d + 2) / 6 : ((rn - gn) / d + 4) / 6;
  return [h, s, l];
};

const fromHsl = (h: number, s: number, l: number): string => {
  if (s === 0) return `#${hex(l * 255).repeat(3)}`;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t0: number): number => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return `#${hex(channel(h + 1 / 3) * 255)}${hex(channel(h) * 255)}${hex(channel(h - 1 / 3) * 255)}`;
};

/**
 * O CLARO DO PANO NÃO PASSA DESTE PONTO (lightness do HSL): a luz do mundo estoura os claros (a lição da revisão da
 * arte), e a capa verde original já mora em 0,40. A cúrcuma pura, a 0,57, viraria uma mancha branca no sol.
 */
const CLOTH_LIGHT_CAP = 0.48;
/** O meio e o escuro seguem a mesma queda dos três verdes do herói (0,40 → 0,33 → 0,27). */
const CLOTH_STEPS: readonly [number, number, number] = [1, 0.82, 0.67];

/**
 * Os três tons de um pano tingido, do claro ao escuro, para trocar os três verdes do herói. A matiz e a saturação são
 * as da tinta; a luz segue a do pano original, para a capa nova pegar a mesma luz que a antiga pegava.
 */
export const clothRamp = (dye: ClothDye): readonly [string, string, string] => {
  if (dye === 'natural') return CAPE_GREENS;
  const [h, s, l] = toHsl(toRgb(DYE_SWATCH[dye]));
  const top = Math.min(l, CLOTH_LIGHT_CAP);
  return [fromHsl(h, s, top * CLOTH_STEPS[0]), fromHsl(h, s, top * CLOTH_STEPS[1]), fromHsl(h, s, top * CLOTH_STEPS[2])];
};

/**
 * TROCA DE PALETA: cada pixel cuja cor é exatamente uma de `from` vira a cor de mesmo índice em `to`; o resto (e a
 * transparência de todos) fica. É a capa do herói mudando de cor sem redesenhar um quadro sequer.
 */
export const swapPalette = (
  pixels: Uint8ClampedArray,
  from: readonly string[],
  to: readonly string[],
): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(pixels);
  const table = new Map<number, [number, number, number]>();
  from.forEach((color, i) => {
    const [r, g, b] = toRgb(color);
    table.set((r << 16) | (g << 8) | b, toRgb(to[i] ?? color));
  });
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const swap = table.get((out[i] << 16) | (out[i + 1] << 8) | out[i + 2]);
    if (!swap) continue;
    [out[i], out[i + 1], out[i + 2]] = swap;
  }
  return out;
};

/**
 * AS CORES QUE A TINA JÁ TEM. A natural sempre; as quatro tintas (e o violeta, que é duas delas) chegam juntas, no dia
 * em que as flores de tinta da Sisi passaram pelas mãos do herói — é delas que a tinta sai. `had` é "já passou pelas
 * mãos" (o caderno de campo e a cerimônia de item novo, ver runtime/notebook).
 */
export const unlockedDyes = (had: (kind: string) => boolean): readonly ClothDye[] =>
  (had('dyeBundle') ? CLOTH_DYES : ['natural']);

/** O nome do acampamento cabe na placa e numa linha escrita à mão. */
export const HOME_NAME_MAX = 24;

/** O nome escrito, limpo: sem caractere de controle, sem espaço sobrando, no tamanho da placa. */
export const cleanHomeName = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  // O espaço primeiro (a quebra de linha vira espaço), e só então o que sobrou de caractere de controle sai.
  return [...raw.replace(/\s+/gu, ' ').replace(/\p{Cc}/gu, '').trim()].slice(0, HOME_NAME_MAX).join('').trim();
};
