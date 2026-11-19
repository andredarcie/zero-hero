// O BORDO DA FONTE TERMAL (objects/spring/SpringMaple), pixel a pixel, no traço das árvores do bosque e da cerejeira
// da meditação (render3d/sakuraArt, de onde vem a técnica): 16 px por tile, a luz do alto e da esquerda, o pé em
// ardósia, nada de contorno preto.
//
// É a árvore SÓ da fonte: um bordo de outono, baixo e torto, com o tronco inclinado para cima da água. A copa são
// MASSAS grandes em camadas (dão a forma e a luz do conjunto) e, dentro delas, TUFOS de folha de 2 a 3 px, cada um com
// a crista clara e a base um tom abaixo. A cor é o vermelho que faz par com o turquesa da água: a rampa `cap` do jogo
// (o carmim) com as cristas na rampa `orange` e uma folha amarela aqui e ali, que é o outono de verdade.

import { TILESET as P, hash, type Put } from '@/game/objects/nature/kit';
import { RAMPS } from '@/game/render3d/pixelForms';

export const MAPLE_W = 48;
/** A linha do chão no desenho (o pé do tronco); embaixo dela, a sombra de contato. */
const GROUND = 52;
export const MAPLE_H = GROUND + 3;
/** Onde o pé do tronco fica na prancha (a árvore inclina para a direita: o pé é à esquerda do meio). */
export const MAPLE_FOOT_X = 15;

const [RED, RED_MID, RED_DK, RED_DEEP] = RAMPS.cap;
const [FLAME, FLAME_MID] = RAMPS.orange;
const GOLD = P.yellowHi;
const BARK = P.bark;
const BARK_DK = P.barkDk;
const BARK_DEEP = P.barkDeep;
const SLATE = P.slate;
const SLATE_DK = P.slateDk;

const L = (() => { const v = [-0.6, -0.72, 0.34]; const n = Math.hypot(...v); return v.map((c) => c / n); })();

const pick = (r: number, choices: ReadonlyArray<readonly [string, number]>): string => {
  let acc = 0;
  for (const [c, w] of choices) { acc += w; if (r < acc) return c; }
  return choices[choices.length - 1][0];
};

// ── O TRONCO E OS GALHOS ───────────────────────────────────────────────────────────────────────
const SPLIT = 31;
/** O tronco sobe inclinado para a direita, com uma barriga. */
const trunkX = (y: number): number => MAPLE_FOOT_X + (GROUND - y) * 0.26 + 1.4 * Math.sin((GROUND - y) / 6);
const trunkHalf = (y: number): number => {
  const t = (GROUND - y) / (GROUND - SPLIT);
  return Math.max(1.5, 1.7 + 2.3 * (1 - t) ** 2.4);
};

/** [x0, y0, cx, cy, x1, y1, grosso no pé, grosso na ponta]: o galho da direita vai longe, por cima da água. */
type Bezier = readonly [number, number, number, number, number, number, number, number];
const LIMBS: readonly Bezier[] = [
  [21, 32, 31, 26, 42, 24, 3, 1.2],
  [20, 33, 13, 26, 7, 22, 2.6, 1.1],
  [21, 31, 22, 21, 26, 11, 2.4, 1],
  [31, 27, 36, 20, 39, 14, 1.6, 1],
  [13, 27, 9, 20, 12, 13, 1.4, 1],
  [36, 25, 42, 27, 45, 31, 1.3, 1],
];

const barkAt = (x: number, y: number, side: number, seed: number): string => {
  const r = hash(x, y, seed);
  if (side < -0.4) return pick(r, [[BARK, 0.66], [BARK_DK, 0.34]]);
  if (side < 0.3) return pick(r, [[BARK_DK, 0.56], [BARK_DEEP, 0.3], [SLATE, 0.14]]);
  return pick(r, [[SLATE, 0.6], [SLATE_DK, 0.22], [BARK_DEEP, 0.18]]);
};

const limbPixels = (): Map<string, string> => {
  const out = new Map<string, string>();
  LIMBS.forEach(([x0, y0, cx, cy, x1, y1, w0, w1], li) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2.5);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1;
      const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      const half = (w0 + (w1 - w0) * t) / 2;
      const reach = Math.ceil(half);
      for (let dy = -reach; dy <= reach; dy += 1) {
        for (let dx = -reach; dx <= reach; dx += 1) {
          if (Math.hypot(dx, dy) > half + 0.3) continue;
          const px = Math.round(x + dx);
          const py = Math.round(y + dy);
          const side = half < 0.8 ? 0 : (dy - dx * 0.4) / half;
          out.set(`${px},${py}`, barkAt(px, py, side, 40 + li));
        }
      }
    }
  });
  return out;
};

const paintTrunk = (put: Put): void => {
  // a sombra de contato, de borda desfiada
  for (let x = MAPLE_FOOT_X - 9; x < MAPLE_FOOT_X + 12; x += 1) {
    if (hash(x, 0, 5) < 0.5 || Math.abs(x - MAPLE_FOOT_X) < 6) put(x, GROUND + 1, SLATE_DK);
  }
  for (let y = SPLIT; y <= GROUND; y += 1) {
    const cx = trunkX(y);
    const hw = trunkHalf(y);
    for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x += 1) put(x, y, barkAt(x, y, (x + 0.5 - cx) / hw, 3));
  }
  // as raízes: três pernas curtas que abrem do pé
  ([[-5, 3], [-2, 2], [4, 3]] as const).forEach(([dx, len], i) => {
    for (let k = 0; k < len; k += 1) {
      const x = MAPLE_FOOT_X + dx * ((k + 1) / len);
      const y = GROUND - len + 1 + k;
      put(x, y, hash(i, k, 6) < 0.5 ? BARK : BARK_DK);
    }
  });
};

// ── A COPA ─────────────────────────────────────────────────────────────────────────────────────
/** As MASSAS (cx, cy, rx, ry), de trás para a frente: a de cima, as dos lados, a do meio, as pontas que caem. */
const MASSES: ReadonlyArray<readonly [number, number, number, number]> = [
  [25, 12, 13, 7.5],
  [10, 19, 9, 6], [37, 17, 10, 6.5],
  [23, 22, 10, 5.5],
  [43, 27, 4.5, 3.4], [6, 26, 4.5, 3],
];

interface Tuft { x: number; y: number; r: number; m: number }

const tufts = (): Tuft[] => {
  const out: Tuft[] = [];
  MASSES.forEach(([mx, my, rx, ry], m) => {
    for (let gy = my - ry; gy <= my + ry; gy += 2.6) {
      for (let gx = mx - rx; gx <= mx + rx; gx += 3) {
        const x = gx + (hash(gx, gy, 20 + m) - 0.5) * 2.2;
        const y = gy + (hash(gy, gx, 21 + m) - 0.5) * 2.2;
        const d = Math.hypot((x - mx) / rx, (y - my) / ry);
        // a borda recortada: perto dela, só alguns tufos entram, e menores
        if (d > 1 || (d > 0.76 && hash(x, y, 22 + m) > 0.6)) continue;
        out.push({ x, y, r: (d > 0.76 ? 1.9 : 2.3) + hash(x, y, 23 + m) * 1.1, m });
      }
    }
  });
  return out.sort((a, b) => a.y - b.y);
};

const lightAt = (x: number, y: number, t: Tuft): { lit: number; rim: boolean; crest: boolean } => {
  const nx = (x + 0.5 - t.x) / t.r;
  const ny = (y + 0.5 - t.y) / t.r;
  const local = nx * L[0] + ny * L[1] + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * L[2];
  const [mx, my, rx, ry] = MASSES[t.m];
  const gx = (x + 0.5 - mx) / rx;
  const gy = (y + 0.5 - my) / ry;
  const global = gx * L[0] + gy * L[1] + Math.sqrt(Math.max(0, 1 - gx * gx - gy * gy)) * L[2];
  const rim = Math.hypot(nx, ny) > 1 - 1.2 / t.r && local < 0.2;
  return { lit: local * 0.38 + global * 0.72, rim, crest: local > 0.84 && global > 0.28 };
};

const TONES: ReadonlyArray<ReadonlyArray<readonly [string, number]>> = [
  [[FLAME, 0.55], [RED, 0.45]],
  [[RED, 0.74], [FLAME_MID, 0.26]],
  [[RED_MID, 0.82], [RED, 0.1], [RED_DK, 0.08]],
  [[RED_DK, 0.82], [RED_MID, 0.12], [RED_DEEP, 0.06]],
  [[RED_DEEP, 0.78], [RED_DK, 0.12], [SLATE, 0.1]],
];
const toneIndex = (lit: number): number => (lit > 0.55 ? 0 : lit > 0.32 ? 1 : lit > 0.08 ? 2 : lit > -0.16 ? 3 : 4);

/** O desenho inteiro, no quadro de vento `f` (0 ou 1): a massa de cima e as pontas mexem um pixel. */
export const drawMaple = (put: Put, f: number): void => {
  const limbs = limbPixels();
  for (const [k, c] of limbs) {
    const [x, y] = k.split(',').map(Number);
    put(x, y, c);
  }
  paintTrunk(put);
  const owner = new Map<string, Tuft>();
  for (const t of tufts()) {
    const sway = f && (t.m === 0 || t.m >= 4) ? 1 : 0;
    const tt = { ...t, x: t.x + sway };
    for (let y = Math.floor(tt.y - tt.r); y <= Math.ceil(tt.y + tt.r); y += 1) {
      for (let x = Math.floor(tt.x - tt.r); x <= Math.ceil(tt.x + tt.r); x += 1) {
        if (Math.hypot(x + 0.5 - tt.x, y + 0.5 - tt.y) > tt.r) continue;
        owner.set(`${x},${y}`, tt);
      }
    }
  }
  for (const [k, t] of owner) {
    const [x, y] = k.split(',').map(Number);
    if (x < 0 || x >= MAPLE_W || y < 0) continue;
    const { lit, rim, crest } = lightAt(x, y, t);
    let i = toneIndex(lit);
    if (rim) i = Math.min(4, i + 1);
    // nos vãos mais fundos, o galho que passa por trás aparece
    const limb = limbs.get(k);
    if (limb && i >= 4 && hash(x, y, 30) < 0.7) { put(x, y, limb); continue; }
    // a folha amarela: só na crista dos tufos do lado aceso, rara
    if (crest && i <= 1 && !rim && hash(Math.floor(x / 2), Math.floor(y / 2), 31) < 0.42) { put(x, y, GOLD); continue; }
    put(x, y, pick(hash(x, y, 32), TONES[i]));
  }
  // as folhas soltas em volta da copa: um pixel, raras, as que já estão caindo
  for (const [k] of owner) {
    const [x, y] = k.split(',').map(Number);
    if (hash(x, y, 33) > 0.014) continue;
    const ox = x + (hash(y, x, 34) < 0.5 ? -2 : 2);
    const oy = y + 1 + Math.floor(hash(x, y, 35) * 3);
    if (!owner.has(`${ox},${oy}`)) put(ox, oy, hash(x, y, 36) < 0.4 ? FLAME : RED);
  }
};

/** As cores de uma folha solta (a que cai, a que boia). */
export const LEAF_COLORS: readonly string[] = [RED, FLAME, RED_MID, GOLD, FLAME_MID];
