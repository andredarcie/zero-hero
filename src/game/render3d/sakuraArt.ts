// O DESENHO DA CEREJEIRA DA MEDITAÇÃO (objects/SakuraTree), pixel a pixel, no traço das árvores do bosque
// (objects/BigTrees): 16 px por tile, a luz do alto e da esquerda, o pé em ardósia, nada de contorno preto.
//
// A COPA não é um punhado de bolotas iguais (a primeira versão lia como algodão-doce): são MASSAS grandes em camadas,
// que dão a forma e a luz do conjunto (o alto e a esquerda acesos, o baixo e a direita no fundo), e dentro delas
// MUITOS TUFOS de flor de 3 a 4 px, cada um com a crista clara e a base um tom abaixo. É o tufo que faz a flor; a massa
// faz a árvore. Entre as camadas, os vãos deixam ver os galhos. Da borda de baixo pendem fios finos de flor, e em
// volta da copa umas flores soltas, que são as que estão caindo.
//
// A COR é a rampa rosa do jogo (pixelForms.RAMPS.pink) e o osso do tileset nas flores mais acesas; o tronco, os galhos
// e as sombras são do tileset. O tom final é do material (SAKURA_TINT), que segura o rosa debaixo do sol.
//
// O TAMANHO (pedido do autor, 2026-11-16: "faça a árvore de meditação ser menor"): a forma foi desenhada numa prancha
// de 112 × 104 (7 × 6,5 tiles) e sai na escala SAKURA_SCALE. Só a FORMA encolhe (as massas, os galhos, o tronco); o
// tufo de flor fica quase do mesmo tamanho, que é o grão do tileset: encolher o tufo junto virava chiado rosa.

import { RAMPS } from '@/game/render3d/pixelForms';
import { TILESET as P, hash, type Put } from '@/game/objects/nature/kit';

/** Quanto da prancha original (112 × 104) a árvore usa. */
export const SAKURA_SCALE = 0.64;
const S = SAKURA_SCALE;
/** 4,5 × 4,25 tiles: ainda a maior do vale (o carvalho velho tem 2,75 × 2,75), mas sem engolir a clareira. */
export const SAKURA_W = Math.round(112 * S);
/** A linha do chão no desenho (o pé do tronco); embaixo dela, a sombra de contato. */
const GROUND = Math.round(100 * S);
export const SAKURA_H = GROUND + 4;
/**
 * O TOM DO MATERIAL (linear) da árvore e das pétalas: o sol multiplica a cor por (1,96; 1,64; 1,33), e o rosa ia para
 * o coral e o osso das flores para o pêssego. Este tira vermelho e devolve azul na medida para a flor sair rosa de
 * cerejeira e o branco dela, branco; a casca, que quase não tem azul, continua castanha.
 */
export const SAKURA_TINT = [0.45, 0.55, 0.71] as const;

const [PINK, PINK_MID, PINK_DK, PINK_DEEP] = RAMPS.pink;
const BLOOM = P.bone;
const BARK = P.bark;
const BARK_DK = P.barkDk;
const BARK_DEEP = P.barkDeep;
const LENTICEL = P.stoneDk;
const SLATE = P.slate;
const SLATE_DK = P.slateDk;

const L = (() => { const v = [-0.6, -0.72, 0.34]; const n = Math.hypot(...v); return v.map((c) => c / n); })();

const pick = (r: number, choices: ReadonlyArray<readonly [string, number]>): string => {
  let acc = 0;
  for (const [c, w] of choices) { acc += w; if (r < acc) return c; }
  return choices[choices.length - 1][0];
};

// ── O TRONCO E OS GALHOS ───────────────────────────────────────────────────────────────────────
const MID = SAKURA_W / 2;
const SPLIT = Math.round(66 * S);
const trunkX = (y: number): number => MID + 2.5 * S * Math.sin((GROUND - y) / (10 * S));
const trunkHalf = (y: number): number => {
  const t = (GROUND - y) / (GROUND - SPLIT);
  return Math.max(2.4, (4 + 5 * (1 - t) ** 3 + (t > 0.75 ? (t - 0.75) * 8 : 0)) * S);
};

/** [x0, y0, cx, cy, x1, y1, grosso no pé, grosso na ponta], na prancha: abrem do tronco e se espalham por baixo. */
type Bezier = readonly [number, number, number, number, number, number, number, number];
const LIMBS: readonly Bezier[] = ([
  [53, 68, 40, 60, 20, 52, 4.4, 1.4],
  [59, 68, 73, 59, 93, 51, 4.4, 1.4],
  [56, 67, 52, 50, 57, 26, 3.8, 1.2],
  [40, 61, 31, 50, 27, 34, 2.4, 1],
  [73, 59, 82, 48, 86, 33, 2.4, 1],
  [55, 47, 47, 40, 42, 28, 1.8, 1],
  [26, 54, 16, 53, 7, 57, 1.8, 1],
  [87, 52, 97, 52, 105, 57, 1.8, 1],
  [30, 49, 22, 42, 18, 36, 1.4, 1],
  [82, 48, 91, 42, 94, 36, 1.4, 1],
] as const).map(([x0, y0, cx, cy, x1, y1, w0, w1]) =>
  [x0 * S, y0 * S, cx * S, cy * S, x1 * S, y1 * S, Math.max(1.6, w0 * S), Math.max(1, w1 * S)] as const);

/** A casca da cerejeira: cinza-castanha, a luz da esquerda, e as LENTICELAS, riscos claros atravessados. */
const barkAt = (x: number, y: number, side: number, seed: number): string => {
  const r = hash(x, y, seed);
  if (y % 4 === 0 && side > -0.6 && side < 0.5 && hash(Math.floor(x / 2), y, seed + 4) < 0.6) return LENTICEL;
  if (side < -0.45) return pick(r, [[BARK, 0.62], [BARK_DK, 0.38]]);
  if (side < 0.3) return pick(r, [[BARK_DK, 0.52], [BARK_DEEP, 0.28], [SLATE, 0.2]]);
  return pick(r, [[SLATE, 0.62], [SLATE_DK, 0.2], [BARK_DEEP, 0.18]]);
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
          // O lado de cima do galho pega a luz; o de baixo, a ardósia.
          const side = half < 0.8 ? 0 : (dy - dx * 0.4) / half;
          out.set(`${px},${py}`, barkAt(px, py, side, 40 + li));
        }
      }
    }
  });
  return out;
};

const paintTrunk = (put: Put): void => {
  // A sombra de contato: ardósia funda, larga (a copa é larga), com a borda desfiada.
  for (let x = Math.round(MID - 28 * S); x < Math.round(MID + 28 * S); x += 1) {
    if (hash(x, 0, 5) < 0.5 || Math.abs(x + 0.5 - MID) < 16 * S) put(x, GROUND + 1, SLATE_DK);
  }
  for (let x = Math.round(MID - 15 * S); x < Math.round(MID + 15 * S); x += 1) put(x, GROUND + 2, SLATE_DK);
  for (let y = SPLIT; y <= GROUND; y += 1) {
    const cx = trunkX(y);
    const hw = trunkHalf(y);
    for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x += 1) put(x, y, barkAt(x, y, (x + 0.5 - cx) / hw, 3));
  }
  // O nó e o oco, no lado da sombra.
  for (const [x, y] of [[38, 52], [38, 53], [39, 53], [37, 48], [38, 48]] as const) put(x, y, SLATE_DK);
  // As raízes: pernas de 2 px que abrem do pé, com vãos entre elas.
  const foot = trunkX(GROUND);
  ([[-9, 4], [-5, 3], [-2, 3], [3, 3], [7, 4]] as const).forEach(([dx, len], i) => {
    for (let k = 0; k < len; k += 1) {
      const x = foot + dx * ((k + 1) / len) + (dx < 0 ? -1 : 0);
      const y = GROUND - len + 1 + k;
      put(x, y, hash(i, k, 6) < 0.5 ? BARK : BARK_DK);
      put(x + (dx < 0 ? 1 : -1), y, hash(k, i, 6) < 0.5 ? BARK_DEEP : SLATE);
    }
  });
};

// ── A COPA ─────────────────────────────────────────────────────────────────────────────────────
/** As MASSAS (cx, cy, rx, ry), de trás para a frente: a de cima, as do meio, as de baixo, as pontas que caem. */
const MASSES: ReadonlyArray<readonly [number, number, number, number]> = ([
  [56, 22, 27, 14],
  [29, 35, 22, 12], [83, 34, 22, 12],
  [56, 38, 18, 11],
  [15, 50, 13, 8], [97, 50, 13, 8],
  [37, 53, 10, 6.5], [75, 53, 10, 6.5],
] as const).map(([cx, cy, rx, ry]) => [cx * S, cy * S, rx * S, ry * S] as const);

interface Tuft { x: number; y: number; r: number; m: number }

/** Os tufos de cada massa, numa grade sorteada: mais juntos no miolo, rareando e recortando a borda. */
const tufts = (): Tuft[] => {
  const out: Tuft[] = [];
  MASSES.forEach(([mx, my, rx, ry], m) => {
    for (let gy = my - ry; gy <= my + ry; gy += 3) {
      for (let gx = mx - rx; gx <= mx + rx; gx += 3.4) {
        const x = gx + (hash(gx, gy, 20 + m) - 0.5) * 2.4;
        const y = gy + (hash(gy, gx, 21 + m) - 0.5) * 2.4;
        const d = Math.hypot((x - mx) / rx, (y - my) / ry);
        // A borda recortada: perto dela, só alguns tufos entram, e menores.
        if (d > 1 || (d > 0.78 && hash(x, y, 22 + m) > 0.62)) continue;
        out.push({ x, y, r: (d > 0.78 ? 2.1 : 2.6) + hash(x, y, 23 + m) * 1.2, m });
      }
    }
  });
  // Os de cima primeiro: os de baixo, mais perto do olho, pintam por cima.
  return out.sort((a, b) => a.y - b.y);
};

/**
 * A luz num ponto: a da massa pesa mais (a forma da árvore inteira: o alto e a esquerda acesos, o baixo e a direita no
 * fundo), a do tufo dá o relevo de cada flor. `crest` é o alto-esquerda do tufo, onde a flor branca acende; `rim`, o
 * aro do lado de baixo e da direita, um tom abaixo: é ele que separa uma flor da outra.
 */
const lightAt = (x: number, y: number, t: Tuft): { lit: number; rim: boolean; crest: boolean } => {
  const nx = (x + 0.5 - t.x) / t.r;
  const ny = (y + 0.5 - t.y) / t.r;
  const local = nx * L[0] + ny * L[1] + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * L[2];
  const [mx, my, rx, ry] = MASSES[t.m];
  const gx = (x + 0.5 - mx) / rx;
  const gy = (y + 0.5 - my) / ry;
  const global = gx * L[0] + gy * L[1] + Math.sqrt(Math.max(0, 1 - gx * gx - gy * gy)) * L[2];
  const rim = Math.hypot(nx, ny) > 1 - 1.2 / t.r && local < 0.2;
  return { lit: local * 0.38 + global * 0.72, rim, crest: local > 0.86 && global > 0.3 };
};

const TONES: ReadonlyArray<ReadonlyArray<readonly [string, number]>> = [
  [[PINK, 0.86], [PINK_MID, 0.14]],
  [[PINK, 0.7], [PINK_MID, 0.3]],
  [[PINK_MID, 0.84], [PINK, 0.08], [PINK_DK, 0.08]],
  [[PINK_DK, 0.82], [PINK_MID, 0.12], [PINK_DEEP, 0.06]],
  [[PINK_DEEP, 0.76], [PINK_DK, 0.14], [SLATE, 0.1]],
];
const toneIndex = (lit: number): number => (lit > 0.55 ? 0 : lit > 0.32 ? 1 : lit > 0.08 ? 2 : lit > -0.16 ? 3 : 4);

/** O desenho inteiro, no quadro de vento `f` (0 ou 1): as massas de cima e os fios mexem um pixel. */
export const drawSakura = (put: Put, f: number): void => {
  const limbs = limbPixels();
  for (const [k, c] of limbs) {
    const [x, y] = k.split(',').map(Number);
    put(x, y, c);
  }
  paintTrunk(put);
  const owner = new Map<string, Tuft>();
  for (const t of tufts()) {
    const sway = f && t.m === 0 ? 1 : 0;
    const tt = { ...t, x: t.x + sway };
    for (let y = Math.floor(tt.y - tt.r); y <= Math.ceil(tt.y + tt.r); y += 1) {
      for (let x = Math.floor(tt.x - tt.r); x <= Math.ceil(tt.x + tt.r); x += 1) {
        if (Math.hypot(x + 0.5 - tt.x, y + 0.5 - tt.y) > tt.r) continue;
        owner.set(`${x},${y}`, tt);
      }
    }
  }
  const bottoms = new Map<number, number>();
  for (const [k, t] of owner) {
    const [x, y] = k.split(',').map(Number);
    if (x < 0 || x >= SAKURA_W || y < 0) continue;
    const { lit, rim, crest } = lightAt(x, y, t);
    let i = toneIndex(lit);
    if (rim) i = Math.min(4, i + 1);
    // Nos vãos mais fundos, o galho que passa por trás aparece.
    const limb = limbs.get(k);
    if (limb && i >= 4 && hash(x, y, 30) < 0.7) { put(x, y, limb); continue; }
    // A flor branca: só na crista dos tufos do lado aceso, em grupinhos (nunca o pontilhado espalhado).
    if (crest && i <= 1 && !rim) { put(x, y, BLOOM); bottoms.set(x, Math.max(bottoms.get(x) ?? -1, y)); continue; }
    put(x, y, pick(hash(x, y, 31), TONES[i]));
    bottoms.set(x, Math.max(bottoms.get(x) ?? -1, y));
  }
  // OS FIOS: flor pendurada, fina, de 2 a 5 px, só em alguns pontos da borda de baixo; balança no vento.
  for (const [x, y1] of bottoms) {
    if (hash(x, 9, 32) > 0.1 || x < 2 || x > SAKURA_W - 3) continue;
    const len = 2 + Math.floor(hash(x, 10, 32) * 4);
    for (let k = 1; k <= len; k += 1) {
      const sx = x + (f && k > 2 ? (x % 2 ? 1 : -1) : 0);
      if (k % 2 === 0) put(sx, y1 + k, PINK_DK);
      else put(sx, y1 + k, k === len || k === len - 1 ? PINK : PINK_MID);
    }
  }
  // AS FLORES SOLTAS em volta da copa: um pixel, raras, as que já estão caindo.
  for (const [k] of owner) {
    const [x, y] = k.split(',').map(Number);
    if (hash(x, y, 33) > 0.012) continue;
    const ox = x + (hash(y, x, 34) < 0.5 ? -2 : 2);
    const oy = y + 1 + Math.floor(hash(x, y, 35) * 3);
    if (!owner.has(`${ox},${oy}`)) put(ox, oy, hash(x, y, 36) < 0.4 ? BLOOM : PINK);
  }
};
