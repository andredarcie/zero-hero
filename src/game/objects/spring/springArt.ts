import { TILESET, hash, sprite, texture, type Put } from '@/game/objects/nature/kit';
import { RAMPS } from '@/game/render3d/pixelForms';

import { MAPLE_H, MAPLE_W, drawMaple } from './mapleArt';
import { paintBasin, paintRock, type RockSpec } from './rockArt';

/**
 * A ARTE DA FONTE TERMAL (objects/spring), pixel a pixel, nas cores do tileset (objects/nature/kit) e nas rampas do
 * jogo (render3d/pixelForms). A ÁGUA não está aqui: ela é pintada no shader (render3d/springWater), e o quad dela só
 * precisa de uma textura branca.
 *
 *   · O VAPOR: fios altos e finos, de espinha torta, com fiapos e buracos (ruído, não um borrão redondo), e o lençol
 *     de névoa que fica rente à água. É ar: os únicos desenhos macios daqui.
 *   · AS PEDRAS e A BACIA de lajes molhadas (rockArt), o BORDO de outono (mapleArt) e as folhas dele.
 *   · A CASCATA: a bica de pedra com musgo, o véu d'água que cai (quatro quadros) e o respingo no pé.
 *   · A LANTERNA DE PEDRA e a janelinha que acende de noite; o BALDE de madeira com a toalha.
 */

export const WHITE = 'hot-spring-white';
/**
 * A ORDEM DE DESENHO em volta da água. A lâmina d'água é translúcida e não escreve profundidade; desenhada DEPOIS dos
 * corpos (que escrevem), ela cobre só o que está debaixo dela. O que é ar por cima dela e também não escreve
 * profundidade (o vapor, a cascata, as folhas, o halo da lanterna, os vaga-lumes) tem de vir depois da água, senão ela
 * os tingiria como se estivessem no fundo.
 */
export const WATER_ORDER = 3;
export const OVER_WATER = 4;

// ── O vapor ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const WISP_W = 48;
export const WISP_H = 64;
export const WISPS: readonly string[] = ['hot-spring-wisp-0', 'hot-spring-wisp-1', 'hot-spring-wisp-2'];
export const MIST = 'hot-spring-mist';

const smooth = (t: number): number => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };
const vnoise = (x: number, y: number, seed: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const sx = smooth(x - ix);
  const sy = smooth(y - iy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a + (a - b + d - c) * sx) * sy;
};
const fbm = (x: number, y: number, seed: number): number => (
  0.55 * vnoise(x, y, seed) + 0.3 * vnoise(x * 2.1, y * 2.1, seed + 1) + 0.15 * vnoise(x * 4.3, y * 4.3, seed + 2)
);

/** Um fio de vapor: a espinha se torce subindo, o corpo é mais largo no meio, e o ruído abre fiapos e buracos nele. */
const paintWisp = (seed: number) => (put: Put): void => {
  for (let y = 0; y < WISP_H; y += 1) {
    for (let x = 0; x < WISP_W; x += 1) {
      const u = ((x + 0.5) / WISP_W) * 2 - 1;
      const up = 1 - (y + 0.5) / WISP_H; // 0 no pé, 1 no alto
      const spine = 0.34 * Math.sin(up * 4.2 + seed) * up + 0.12 * Math.sin(up * 9 + seed * 2.3) * up;
      const width = 0.14 + 0.44 * Math.sin(Math.min(1, up * 1.12) * Math.PI) ** 0.8;
      const across = Math.max(0, 1 - Math.abs(u - spine) / width);
      const carve = smooth((fbm(x * 0.09 + seed, y * 0.05 - seed, 30 + seed) - 0.3) / 0.38);
      const fade = smooth(up / 0.16) * smooth((1 - up) / 0.34);
      const a = across ** 1.5 * carve * fade * 1.3;
      if (a > 0.012) put(x, y, '#ffffff', Math.min(1, a));
    }
  }
};

/** O lençol de névoa rente à água: manchas macias, sem beira. */
const paintMist = (put: Put): void => {
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const r = Math.hypot((x + 0.5) / 32 - 1, (y + 0.5) / 32 - 1);
      const a = smooth((1 - r) / 0.7) * smooth((fbm(x * 0.07, y * 0.07, 51) - 0.28) / 0.45);
      if (a > 0.012) put(x, y, '#ffffff', a);
    }
  }
};

// ── As pedras, a bacia ───────────────────────────────────────────────────────────────────────────────────────────
/** As pedras da beira (a prancha de cada uma; o tamanho no mundo é a prancha / 16). */
export const ROCKS: ReadonlyArray<RockSpec & { key: string }> = [
  { key: 'hot-spring-rock-0', w: 21, h: 16, seed: 3, moss: 0.9 },
  { key: 'hot-spring-rock-1', w: 18, h: 13, seed: 8, moss: 0.35 },
  { key: 'hot-spring-rock-2', w: 13, h: 10, seed: 14, moss: 0.6 },
  { key: 'hot-spring-rock-3', w: 12, h: 8, seed: 21, moss: 0 },
  { key: 'hot-spring-rock-4', w: 8, h: 5, seed: 27, moss: 0 },
  { key: 'hot-spring-rock-5', w: 10, h: 5, seed: 33, moss: 0.25, wet: true },
];
/** A bica: a pedra de onde a água sai do paredão. */
export const SPOUT = 'hot-spring-spout';
export const SPOUT_W = 15;
export const SPOUT_H = 8;
/** A bacia de lajes: a prancha (px) e até onde as lajes vão além da beira da água. */
export const BASIN = 'hot-spring-basin';
export const BASIN_W = 108;
export const BASIN_H = 64;
const BASIN_REACH = 11;

// ── A cascata ────────────────────────────────────────────────────────────────────────────────────────────────────
export const FALL_W = 12;
export const FALL_H = 22;
export const FALL_FRAMES = 4;
export const fallKey = (f: number): string => `hot-spring-fall-${f}`;
export const SPLASH_W = 16;
export const SPLASH_H = 7;
export const splashKey = (f: number): string => `hot-spring-splash-${f}`;

/** O véu d'água: abre ao cair; por dentro, riscos claros que descem quatro px a cada quadro (o laço tem 16). */
const paintFall = (f: number) => (put: Put): void => {
  for (let y = 0; y < FALL_H; y += 1) {
    const half = 1.6 + (y / (FALL_H - 1)) * 2.8;
    const mid = 5.5 + Math.sin(y * 0.45 + f * 1.57) * 0.3;
    for (let x = 0; x < FALL_W; x += 1) {
      const d = Math.abs(x + 0.5 - (mid + 0.5));
      if (d > half) continue;
      const rim = d > half - 0.9;
      const run = (y - f * 4 + Math.floor(hash(x, 0, 5) * 16) + 64) % 16;
      let c: string = rim ? TILESET.teal : TILESET.waterHi;
      if (!rim && run < 5) c = TILESET.ice;
      else if (!rim && run >= 12 && hash(x, y, 7) < 0.5) c = TILESET.teal;
      put(x, y, c, y < 2 ? 0.7 : 0.95);
    }
  }
};

/** O respingo no pé: o monte de espuma que pulsa e as gotas que saltam. */
const paintSplash = (f: number) => (put: Put): void => {
  const rx = 5.4 + (f % 2) * 1.2;
  const ry = 2.1 + (f % 2) * 0.5;
  for (let y = 0; y < SPLASH_H; y += 1) {
    for (let x = 0; x < SPLASH_W; x += 1) {
      const d = Math.hypot((x + 0.5 - 8) / rx, (y + 0.5 - SPLASH_H) / ry);
      if (d < 1 && hash(x, y, 60 + f) > 0.22) put(x, y, d < 0.6 ? TILESET.ice : TILESET.pale, 0.95);
    }
  }
  ([[3, 0], [6, 2], [10, 1], [13, 3]] as const).forEach(([x, k]) => {
    const up = (f + k) % 4;
    if (up < 3) put(x, 3 - up, TILESET.ice);
  });
};

// ── A lanterna ───────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * A LANTERNA DE PEDRA da beira da água (12 × 22): a laje do pé, o fuste, o patamar, a caixa com a janelinha, o chapéu
 * de beiras viradas para cima com musgo e o botão no topo. A janela é escura de dia; de noite quem a acende é o
 * desenho `LANTERN_GLOW` por cima (emissivo: a noite não o apaga).
 */
export const LANTERN = 'hot-spring-lantern';
export const LANTERN_GLOW = 'hot-spring-lantern-glow';
export const LANTERN_W = 12;
export const LANTERN_H = 22;
const WINDOW = { y0: 4, y1: 6, x0: 4, x1: 7 };
const lanternShape = (x: number, y: number): boolean => {
  if (y === 0) return x === 5 || x === 6; // o botão
  if (y === 1) return x >= 0 && x <= 11; // o chapéu: a beira de cima é a mais larga (as pontas viradas para cima)
  if (y === 2) return x >= 1 && x <= 10;
  if (y <= 7) return x >= 3 && x <= 8; // a caixa
  if (y <= 9) return x >= 2 && x <= 9; // o patamar
  if (y <= 15) return x >= 4 && x <= 7; // o fuste
  if (y <= 18) return x >= 3 && x <= 8; // a base do fuste
  return x >= 1 && x <= 10; // a laje
};
const paintLantern = (put: Put): void => {
  for (let y = 0; y < LANTERN_H; y += 1) {
    for (let x = 0; x < LANTERN_W; x += 1) {
      if (!lanternShape(x, y)) continue;
      if (y >= WINDOW.y0 && y <= WINDOW.y1 && x >= WINDOW.x0 && x <= WINDOW.x1) { put(x, y, TILESET.slateDk); continue; }
      // a luz vem da esquerda: a borda esquerda de cada peça acende, a direita escurece
      const left = !lanternShape(x - 1, y);
      const right = !lanternShape(x + 1, y);
      const under = !lanternShape(x, y + 1) || y === LANTERN_H - 1;
      let c: string = RAMPS.stone[1];
      if (left) c = RAMPS.stone[0];
      else if (right) c = RAMPS.stone[3];
      else if (hash(x, y, 41) < 0.3) c = RAMPS.stone[2];
      if (under && !left) c = TILESET.slateDk;
      // o musgo no chapéu e na laje
      if ((y === 1 || y === 2) && hash(x, y, 43) < 0.45) c = hash(x, y, 47) < 0.5 ? TILESET.moss : TILESET.leaf;
      if (y === LANTERN_H - 3 && hash(x, y, 53) < 0.35) c = TILESET.moss;
      put(x, y, c);
    }
  }
};
const paintLanternGlow = (put: Put): void => {
  for (let y = WINDOW.y0; y <= WINDOW.y1; y += 1) {
    for (let x = WINDOW.x0; x <= WINDOW.x1; x += 1) {
      const core = y === WINDOW.y0 + 1 && (x === WINDOW.x0 + 1 || x === WINDOW.x0 + 2);
      put(x, y, core ? TILESET.yellowHi : y === WINDOW.y1 ? TILESET.rust : TILESET.amber);
    }
  }
};

// ── O bordo e as folhas, o balde ─────────────────────────────────────────────────────────────────────────────────
export const mapleKey = (f: number): string => `hot-spring-maple-${f}`;
/** A folha solta, em dois jeitos (ela vira no ar), e a que boia. Brancas: quem dá a cor é o tom do sprite. */
export const LEAF_AIR: readonly string[] = ['hot-spring-leaf-a', 'hot-spring-leaf-b'];
export const LEAF_AFLOAT = 'hot-spring-leaf-afloat';
/** O balde de madeira, com a toalha dobrada na beira. */
export const BUCKET = 'hot-spring-bucket';
const [WOOD, WOOD_MID, WOOD_DK, WOOD_DEEP] = RAMPS.wood;

/** Registra os desenhos (o kit espera o World3D: ver nature/kit.texture). */
export const springTextures = (): void => {
  texture(WHITE, 4, 4, (put) => { for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) put(x, y, '#ffffff'); });
  WISPS.forEach((key, i) => texture(key, WISP_W, WISP_H, paintWisp(1.7 + i * 2.9), true));
  texture(MIST, 64, 64, paintMist, true);
  for (const rock of ROCKS) texture(rock.key, rock.w, rock.h, paintRock(rock));
  texture(SPOUT, SPOUT_W, SPOUT_H, paintRock({ w: SPOUT_W, h: SPOUT_H, seed: 41, moss: 1 }));
  // (o meio da bacia é o meio da prancha; as meias medidas são as dos 4 × 2 tiles, em px)
  texture(BASIN, BASIN_W, BASIN_H, paintBasin(BASIN_W, BASIN_H, { cx: BASIN_W / 2, cy: BASIN_H / 2, hw: 32, hh: 16 }, BASIN_REACH));
  for (let f = 0; f < FALL_FRAMES; f += 1) {
    texture(fallKey(f), FALL_W, FALL_H, paintFall(f));
    texture(splashKey(f), SPLASH_W, SPLASH_H, paintSplash(f));
  }
  texture(LANTERN, LANTERN_W, LANTERN_H, paintLantern);
  texture(LANTERN_GLOW, LANTERN_W, LANTERN_H, paintLanternGlow);
  for (let f = 0; f < 2; f += 1) texture(mapleKey(f), MAPLE_W, MAPLE_H, (put) => drawMaple(put, f));
  // (uma folha é um cantinho de dois por dois com um pixel faltando: a cruz de três por três lia como um sinal de mais)
  sprite(LEAF_AIR[0], ['xx', 'x.'], { x: '#ffffff' });
  sprite(LEAF_AIR[1], ['.x', 'xx'], { x: '#ffffff' });
  sprite(LEAF_AFLOAT, ['xx', '.x'], { x: '#ffffff' });
  sprite(BUCKET, [
    '...TTTT....',
    '..TTtTTt...',
    '.wWWWWWWd..',
    '.wWWwWWwd..',
    '.BBBBBBBB..',
    '.wWWwWWwd..',
    '.wWWwWWwd..',
    '.kBBBBBBk..',
    '..kkkkkk...',
  ], { T: TILESET.bone, t: TILESET.boneDk, W: WOOD, w: WOOD_MID, d: WOOD_DK, k: WOOD_DEEP, B: TILESET.slate });
};
