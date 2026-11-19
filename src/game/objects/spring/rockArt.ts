import { TILESET as P, hash, type Put } from '@/game/objects/nature/kit';
import { RAMPS } from '@/game/render3d/pixelForms';

/**
 * AS PEDRAS DA FONTE TERMAL, pixel a pixel (16 px por tile, a luz do alto e da esquerda).
 *
 * A PEDRA GRANDE (`paintRock`) não é um domo (a primeira versão era, e lia como um ovo cinza): é uma rocha FACETADA. A
 * silhueta é um bloco de beira torta com o pé reto; dentro dela, meia dúzia de planos (cada um vira para um lado e pega
 * a luz inteiro, num tom só), com a aresta acesa onde um plano claro encontra um escuro, uma ou duas rachaduras, o
 * contorno fundo embaixo e à direita, o pé molhado, e MUSGO no alto, de beira desfiada, escorrendo num ponto ou outro.
 *
 * A BACIA (`paintBasin`) é o chão em volta da água: lajes irregulares, molhadas e escuras perto dela, com musgo nas
 * juntas e uma poça aqui e ali, de beira desigual (as lajes de fora entram no calçamento, não acabam numa linha).
 */

const [ST_HI, ST, ST_DK, ST_DEEP] = RAMPS.stone;
const TONES = [ST_HI, ST, ST_DK, ST_DEEP, P.slateDk] as const;
/**
 * O musgo, do aceso ao fundo. Nada do `moss` do tileset no alto: sob a luz dourada do vale ele saía mostarda, e a
 * pedra parecia camuflagem; o verde-oliva é o que sobra verde depois do ouro.
 */
const MOSS = [P.leaf, P.olive, P.oliveDk, P.leafDk] as const;
/** A luz da casa: do alto e da esquerda. */
const L = (() => { const v = [-0.6, -0.72, 0.34]; const n = Math.hypot(...v); return v.map((c) => c / n); })();

export interface RockSpec {
  /** A prancha, em px. */
  w: number;
  h: number;
  seed: number;
  /** Quanto do alto o musgo cobre (0 = nada, 1 = uma capa grossa). */
  moss?: number;
  /** O pé dentro d'água: as duas fileiras de baixo escurecem. */
  wet?: boolean;
}

interface Facet { x: number; y: number; tone: number }

/** Os planos da rocha: sementes espalhadas pela silhueta, cada uma com o tom que a luz dá ao lado para onde ela vira. */
const facetsOf = (spec: RockSpec, cx: number, cy: number, rx: number, ry: number): Facet[] => {
  const out: Facet[] = [];
  // (muitos planos pequenos: com poucos e grandes, de perto a pedra era um retalho de duas cores)
  const count = Math.max(5, Math.round((spec.w * spec.h) / 24));
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + hash(i, 1, spec.seed) * 1.3;
    const r = 0.25 + 0.6 * hash(i, 2, spec.seed);
    const x = cx + Math.cos(a) * rx * r;
    const y = cy + Math.sin(a) * ry * r * 0.9;
    // o plano vira para fora do miolo, e um tanto para quem olha
    const nx = Math.cos(a) * r;
    const ny = Math.sin(a) * r - 0.25;
    const nz = 0.75;
    const n = Math.hypot(nx, ny, nz);
    const lit = (nx * L[0] + ny * L[1] + nz * L[2]) / n + (hash(i, 3, spec.seed) - 0.5) * 0.16;
    // (o tom mais claro é raro: pedra clara e grande, a luz do vale a deixa bege e acesa)
    out.push({ x, y, tone: lit > 0.8 ? 0 : lit > 0.5 ? 1 : lit > 0.2 ? 2 : 3 });
  }
  // o alto do miolo: o plano de cima, o mais aceso
  out.push({ x: cx - rx * 0.1, y: cy - ry * 0.55, tone: 1 });
  return out;
};

/** Uma rocha facetada com musgo. */
export const paintRock = (spec: RockSpec) => (put: Put): void => {
  const { w, h, seed } = spec;
  const cx = w / 2;
  const rx = w / 2 - 0.6;
  const ry = h * 0.78;
  const cy = h - ry * 0.42;
  const p1 = hash(1, 7, seed) * 6.28;
  const p2 = hash(2, 7, seed) * 6.28;
  const p3 = hash(3, 7, seed) * 6.28;
  const inside = (x: number, y: number): boolean => {
    if (y < 0 || y >= h || x < 0 || x >= w) return false;
    const nx = (x + 0.5 - cx) / rx;
    const ny = (y + 0.5 - cy) / ry;
    const a = Math.atan2(ny, nx);
    const edge = 1 + 0.1 * Math.cos(2 * a + p1) + 0.08 * Math.cos(3 * a + p2) + 0.05 * Math.cos(5 * a + p3);
    return Math.hypot(nx, ny) < edge;
  };
  const facets = facetsOf(spec, cx, cy, rx, ry);
  const facetAt = (x: number, y: number): number => {
    let best = 0;
    let bd = Infinity;
    facets.forEach((f, i) => {
      const d = Math.hypot(x + 0.5 - f.x, (y + 0.5 - f.y) * 1.25);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };
  // o alto de cada coluna: é dele que o musgo desce
  const top: number[] = [];
  for (let x = 0; x < w; x += 1) {
    let t = h;
    for (let y = 0; y < h; y += 1) if (inside(x, y)) { t = y; break; }
    top.push(t);
  }
  const moss = spec.moss ?? 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!inside(x, y)) continue;
      const fi = facetAt(x, y);
      let tone = facets[fi].tone;
      const up = facetAt(x, y - 1);
      const left = facetAt(x - 1, y);
      // a aresta: onde um plano claro encosta num mais escuro acima ou à esquerda, um fio de luz; a rachadura, o contrário
      if (inside(x, y - 1) && up !== fi && facets[up].tone > tone) tone = Math.max(0, tone - 1);
      else if (inside(x - 1, y) && left !== fi && facets[left].tone < tone - 1) tone = Math.min(4, tone + 1);
      // o grão: um ponto ou outro um tom acima ou abaixo (quebra o chapado dos planos)
      const grain = hash(x, y, seed + 5);
      if (grain < 0.1) tone = Math.min(3, tone + 1);
      else if (grain > 0.93 && tone > 1) tone -= 1;
      // o contorno: fundo embaixo e à direita, aceso no alto e à esquerda
      const openBelow = !inside(x, y + 1);
      const openRight = !inside(x + 1, y);
      const openAbove = !inside(x, y - 1);
      const openLeft = !inside(x - 1, y);
      if (openBelow || (openRight && !openAbove)) tone = 4;
      else if ((openAbove || openLeft) && tone > 0) tone -= 1;
      if (spec.wet && y >= h - 2) tone = Math.min(4, tone + 1);
      let c: string = TONES[tone];
      // o musgo: uma capa no alto, de beira desfiada, com um fio escorrendo aqui e ali
      if (moss > 0) {
        const depth = (0.8 + 2.6 * moss * (0.4 + 0.6 * hash(Math.floor(x / 2), 3, seed + 9)))
          + (hash(x, 4, seed + 9) < 0.14 * moss ? 2 : 0);
        const lean = (x + 0.5 - cx) / rx;
        if (y - top[x] < depth && lean < 0.72) {
          const mi = tone <= 0 ? 0 : tone === 1 ? (hash(x, y, seed + 11) < 0.6 ? 0 : 1) : tone === 2 ? 1 : 2;
          c = y - top[x] >= depth - 1 && tone >= 2 ? MOSS[3] : MOSS[mi];
        }
      }
      put(x, y, c);
    }
  }
};

/**
 * O quão para fora do retângulo da bacia um ponto está, em px (negativo dentro dele). `pool`: o meio e as meias medidas
 * do retângulo de tiles, em px.
 */
const outOf = (x: number, y: number, pool: { cx: number; cy: number; hw: number; hh: number }): number => {
  const dx = Math.abs(x + 0.5 - pool.cx) - pool.hw;
  const dy = Math.abs(y + 0.5 - pool.cy) - pool.hh;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
};

/**
 * As lajes em volta da bacia: um anel no chão, por fora dos tiles dela (dentro deles a borda é do terreno, que avança
 * sobre a água; as lajes entram só um pixel, para não sobrar fresta). `reach`: até onde as lajes vão, em px a partir da
 * bacia; a beira de fora é a das próprias lajes (as que caem além do alcance não entram).
 */
export const paintBasin = (w: number, h: number, pool: { cx: number; cy: number; hw: number; hh: number }, reach: number) => (put: Put): void => {
  // Lajes GRANDES e limpas (9 × 7 px): as primeiras, miúdas e salpicadas, viravam um ruído escuro de perto.
  const CW = 9;
  const CH = 7;
  const seedOf = (gx: number, gy: number): { x: number; y: number } => ({
    x: (gx + 0.5) * CW + (hash(gx, gy, 71) - 0.5) * 4.6,
    y: (gy + 0.5) * CH + (hash(gy, gx, 73) - 0.5) * 3.4,
  });
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const gx = Math.floor(x / CW);
      const gy = Math.floor(y / CH);
      let d1 = Infinity;
      let d2 = Infinity;
      let own = { x: 0, y: 0, gx: 0, gy: 0 };
      for (let j = -1; j <= 1; j += 1) {
        for (let i = -1; i <= 1; i += 1) {
          const s = seedOf(gx + i, gy + j);
          const d = Math.hypot(x + 0.5 - s.x, (y + 0.5 - s.y) * 1.15);
          if (d < d1) { d2 = d1; d1 = d; own = { ...s, gx: gx + i, gy: gy + j }; } else if (d < d2) d2 = d;
        }
      }
      // a laje inteira entra ou não entra: a beira de fora é a das pedras, torta
      const out = outOf(own.x, own.y, pool);
      const limit = reach * (0.72 + 0.5 * hash(own.gx, own.gy, 79));
      if (out > limit) continue;
      const here = outOf(x, y, pool);
      if (here < -1) continue;
      const id = hash(own.gx, own.gy, 83);
      const wet = here < 2;
      if (d2 - d1 < 0.95) {
        // a junta: um fio fundo, com musgo num trecho ou outro das de fora
        const mossy = !wet && hash(own.gx, own.gy, 89) < 0.35 && hash(Math.floor(x / 2), Math.floor(y / 2), 91) < 0.5 && out > limit * 0.3;
        put(x, y, mossy ? P.olive : ST_DEEP);
        continue;
      }
      // a laje: um tom chapado por pedra; só a quina de cima e da esquerda acende, e a de baixo e da direita escurece
      let tone = id < 0.35 ? 1 : id < 0.9 ? 2 : 3;
      const dx = x + 0.5 - own.x;
      const dy = y + 0.5 - own.y;
      if (d2 - d1 < 2.1) tone += dx + dy * 1.2 > 0.8 ? 1 : dx + dy * 1.2 < -0.8 ? -1 : 0;
      if (wet) tone += 1;
      let c: string = TONES[Math.min(3, Math.max(0, tone))];
      // uma poça numa laje ou outra
      if (id > 0.93 && Math.hypot(dx, dy * 1.4) < 1.6) c = dx < -0.2 && dy < 0 ? P.waterHi : P.water;
      put(x, y, c);
    }
  }
};
