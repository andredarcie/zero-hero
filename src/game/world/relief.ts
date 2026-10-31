import { getTileRelief, getWorldBounds, isInsideWorld, worldHasRelief } from './WorldData';
import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';

/**
 * A SERRA — o mundo deixou de ser um plano só.
 *
 * Um tile pode estar UM NÍVEL acima do chão (o planalto, um bloco de pedra com grama em cima), e o
 * único jeito de subir nele é por uma ESCADA: um tile próprio, encostado no planalto, que sobe numa
 * direção só. Nada de pular, nada de descer pela borda — a beira do planalto é parede para quem está
 * embaixo e para quem está em cima, e a escada é a porta das duas pontas.
 *
 * Os códigos moram em `WorldChunk.relief` (ver worldSchema):
 *
 *   0  chão
 *   1  planalto (RELIEF_HEIGHT acima do chão)
 *   2  escada que sobe para o NORTE (o planalto fica ao norte dela)
 *   3  ... para o LESTE
 *   4  ... para o SUL
 *   5  ... para o OESTE
 *   6-7  SERRA DE MATA, um ou dois níveis acima (o dois é raro): só embaixo de árvore fechada. Ninguém pisa ali, então
 *        ela não muda caminho nenhum: é a mata subindo o morro.
 *
 * Fora do mundo a altura não mora em dado nenhum: sai de ruído (`voidLevel`), e é só paisagem.
 *
 * A ALTURA É CONTÍNUA (`terrainHeightAt`): na escada ela cresce ao longo da subida, então tudo que
 * a lê — o corpo do herói, a câmera, os overlays 2D — sobe o degrau junto com o passo, sem salto.
 */

export const RELIEF_GROUND = 0;
export const RELIEF_HIGH = 1;
/** A altura de um nível, em tiles: a mesma do cubo da montanha (um bloco é um tile de lado). */
export const RELIEF_HEIGHT = 1;
/** O código da serra de mata é este mais o nível dela (ver a tabela acima). */
export const RELIEF_SCENIC_BASE = 5;
// A partir de quanto o morro de fora sobe: o nível 2 é o pico raro, nunca a regra.
const VOID_LEVEL_1 = 0.52;
const VOID_LEVEL_2 = 0.77;

const STAIR_UP: Readonly<Record<number, readonly [number, number]>> = {
  2: [0, -1],
  3: [1, 0],
  4: [0, 1],
  5: [-1, 0],
};

/** Para onde esta escada sobe (dx, dy), ou `undefined` se o código não é escada. */
export const stairUp = (code: number): readonly [number, number] | undefined => STAIR_UP[code];

export const reliefAt = (wx: number, wy: number): number => getTileRelief(wx, wy);

// Ruído de valor, de hash por coordenada: zero Math.random, a mesma serra em toda partida.
const hash2 = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number): number => t * t * (3 - 2 * t);
const valueNoise = (x: number, y: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const tx = smooth(x - ix);
  const ty = smooth(y - iy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * tx + (c - a + (a - b + d - c) * tx) * ty;
};

/**
 * A SERRA DE FORA DO MUNDO. Duas cristas cruzadas (o `1 - |2n - 1|` faz a aresta do morro) sobre uma
 * ondulação larga e um grão miúdo que quebra a beira: nunca uma reta seguida. Três travas:
 *
 *   · NADA AO SUL: a câmera mora lá, e um morro na frente dela taparia o herói.
 *   · A distância da borda é TORTA (`reach`): um teto medido em linha reta desenhava degraus paralelos
 *     ao mapa, um muro de prisão atrás do outro. Com ruído nela, o morro chega e recua.
 *   · No máximo DOIS níveis, e o segundo só nos picos: o relevo é variado, não alto.
 */
const rawVoidLevel = (wx: number, wy: number): number => {
  const b = getWorldBounds();
  if (wy > b.maxTileY) return 0;
  const dx = Math.max(b.minTileX - wx, wx - b.maxTileX, 0);
  const dy = Math.max(b.minTileY - wy, 0);
  const d = Math.max(dx, dy);
  if (d <= 0) return 0;
  const reach = d + (valueNoise(wx / 3.6 + 70, wy / 3.6 + 19) - 0.5) * 7 - 1;
  if (reach <= 0) return 0;
  const ridge = (x: number, y: number): number => 1 - Math.abs(2 * valueNoise(x, y) - 1);
  const crest = ridge(wx / 5.5 + 11, wy / 4 + 3) * 0.62 + ridge(wx / 2.8 + 40, wy / 3.4 + 90) * 0.38;
  const swell = valueNoise(wx / 9 + 7, wy / 7 + 50);
  const grain = hash2(wx + 31, wy + 77) - 0.5;
  const h = crest * 0.55 + swell * 0.45 + grain * 0.3;
  if (h < VOID_LEVEL_1) return 0;
  return h >= VOID_LEVEL_2 && reach > 1.5 ? 2 : 1;
};

/** O maior trecho reto que uma beira da serra de fora pode ter, em tiles. */
const VOID_MAX_STRAIGHT = 4;
/** Até onde a serra de fora é calculada de verdade, além da borda: mais que o desenho alcança. */
const VOID_SPAN = 30;

/**
 * A QUEBRA: a serra de fora inteira, com toda beira reta mordida até caber em VOID_MAX_STRAIGHT. Só
 * uma passada sobre a grade garante isso: ruído nenhum promete que não vai alinhar nove tiles.
 */
const buildVoidGrid = (b: ReturnType<typeof getWorldBounds>): { levels: Int8Array; x0: number; y0: number; w: number; h: number } => {
  const x0 = b.minTileX - VOID_SPAN;
  const y0 = b.minTileY - VOID_SPAN;
  const w = b.maxTileX + VOID_SPAN - x0 + 1;
  const h = b.maxTileY - y0 + 1;
  const levels = new Int8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) levels[y * w + x] = rawVoidLevel(x + x0, y + y0);
  }
  const edge = (x: number, y: number, dx: number, dy: number): boolean => (
    x >= 0 && y >= 0 && x + dx < w && y + dy < h && levels[y * w + x] !== levels[(y + dy) * w + x + dx]
  );
  const bite = (): boolean => {
    let bitten = false;
    for (const [dx, dy] of [[0, 1], [1, 0]]) {
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (!edge(x, y, dx, dy) || edge(x - dy, y - dx, dx, dy)) continue;
          let run = 1;
          while (edge(x + dy * run, y + dx * run, dx, dy)) run += 1;
          if (run <= VOID_MAX_STRAIGHT) continue;
          const at = 1 + Math.floor(hash2(x + x0, y + y0) * (run - 2));
          const a = (y + dx * at) * w + x + dy * at;
          const c = (y + dx * at + dy) * w + x + dy * at + dx;
          // A mordida é sempre para baixo: o lado alto da beira cede um nível.
          if (levels[a] > levels[c]) levels[a] -= 1;
          else levels[c] -= 1;
          bitten = true;
        }
      }
    }
    return bitten;
  };
  for (let pass = 0; pass < 12 && bite(); pass += 1);
  return { levels, x0, y0, w, h };
};

let voidGrid: ReturnType<typeof buildVoidGrid> | undefined;
let voidGridBounds: ReturnType<typeof getWorldBounds> | undefined;

const voidLevel = (wx: number, wy: number): number => {
  const b = getWorldBounds();
  if (!voidGrid || voidGridBounds !== b) {
    voidGrid = buildVoidGrid(b);
    voidGridBounds = b;
  }
  const x = wx - voidGrid.x0;
  const y = wy - voidGrid.y0;
  if (x < 0 || y < 0 || x >= voidGrid.w || y >= voidGrid.h) return 0;
  return voidGrid.levels[y * voidGrid.w + x];
};

/** A ALTURA EM NÍVEIS de um tile, dentro ou fora do mundo: é o que o desenho do terreno lê. */
export const reliefLevelAt = (wx: number, wy: number): number => {
  const cx = Math.floor(wx / CHUNK_COLUMNS);
  const cy = Math.floor(wy / CHUNK_ROWS);
  if (!isInsideWorld(cx, cy)) return voidLevel(wx, wy);
  const code = getTileRelief(wx, wy);
  if (code === RELIEF_HIGH) return 1;
  return code > RELIEF_SCENIC_BASE ? code - RELIEF_SCENIC_BASE : 0;
};

export const isHighTile = (wx: number, wy: number): boolean => getTileRelief(wx, wy) === RELIEF_HIGH;

/**
 * A altura do chão num ponto CONTÍNUO do mundo (em tiles). O tile é o do centro (`floor(v + 0.5)`,
 * a mesma conta do resto do jogo); na escada, a altura vai de 0 na borda de baixo a RELIEF_HEIGHT
 * na borda de cima.
 */
export const terrainHeightAt = (fx: number, fy: number): number => {
  if (!worldHasRelief()) return 0;
  const x = Math.floor(fx + 0.5);
  const y = Math.floor(fy + 0.5);
  const code = getTileRelief(x, y);
  if (code === RELIEF_HIGH) return RELIEF_HEIGHT;
  if (code > RELIEF_SCENIC_BASE) return (code - RELIEF_SCENIC_BASE) * RELIEF_HEIGHT;
  const up = STAIR_UP[code];
  if (!up) return 0;
  const along = (fx - x) * up[0] + (fy - y) * up[1]; // -0.5 na borda de baixo, +0.5 na de cima
  return Math.max(0, Math.min(1, along + 0.5)) * RELIEF_HEIGHT;
};

/**
 * PODE-SE ANDAR de um tile para o vizinho? Só entre tiles do MESMO nível, ou pela escada no
 * sentido dela: entra-se nela pela ponta de baixo (vindo do chão) ou pela de cima (vindo do
 * planalto), e sai-se pelas mesmas duas pontas. Pelos lados, nunca — a escada tem parede.
 */
export const canStep = (fromX: number, fromY: number, toX: number, toY: number): boolean => {
  if (!worldHasRelief()) return true;
  const a = getTileRelief(fromX, fromY);
  const b = getTileRelief(toX, toY);
  if (a === b && !STAIR_UP[a]) return true;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const ua = STAIR_UP[a];
  if (ua) {
    if (dx === ua[0] && dy === ua[1]) return b === RELIEF_HIGH;
    if (dx === -ua[0] && dy === -ua[1]) return b === RELIEF_GROUND;
    return false;
  }
  const ub = STAIR_UP[b];
  if (ub) {
    if (dx === ub[0] && dy === ub[1]) return a === RELIEF_GROUND;
    if (dx === -ub[0] && dy === -ub[1]) return a === RELIEF_HIGH;
    return false;
  }
  return a === b;
};
