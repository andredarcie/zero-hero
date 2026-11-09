import { profiler } from '@/game/debug/Profiler';
import * as Engine from '@/game/engine';
import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { WATER_LAYER } from '@/game/objects/KoiPond';
import { WATER_DEPTH_TILES, world3d } from '@/game/render3d/World3D';
import { createCanvas } from '@/game/platform/platform';

/**
 * A CACHOEIRA DO ACAMPAMENTO (pedido do autor: "veja um lugar ideal, faça uma fonte da água caindo tipo cachoeira";
 * depois: "melhore isso drasticamente baseado em cachoeiras reais").
 *
 * Uma nascente sai de um rochedo na quina do planalto baixo, logo ao sul do acampamento do herói, cai a parede de
 * frente para a câmera e enche um poço que escorre para o laguinho: é de onde vem a água do lago dele.
 *
 * O que uma cachoeira de verdade tem, e cada peça daqui copia:
 *   · A LÍNGUA: antes da beira a água é lisa, escura e transparente; na dobra ela espelha o céu numa faixa clara.
 *   · A QUEDA BRANCA: logo depois da beira a água se enche de ar e fica branca. Ela ACELERA ao cair (v = √2gh), então
 *     os fios de brilho são curtos em cima e compridos embaixo, e descem mais rápido embaixo. A fita se abre ao cair.
 *   · AS BORDAS se quebram em fios soltos e gotas, e entre eles aparece a pedra MOLHADA de trás: escura, com brilhos
 *     que piscam, limo verde rente à água e um fio d'água escorrendo de lado.
 *   · O PÉ: a água bate e FERVE, um monte branco mais largo que a queda; gotas saem voando em arco.
 *   · O POÇO: a espuma não fica parada em anéis, ela é levada pela corrente em manchas que afinam até o lago
 *     (abaixo do poço fica o laguinho das carpas, objects/KoiPond.ts).
 *   · A NÉVOA sobe do pé e o vento a leva; com sol, um arco-íris fraco aparece nela.
 *   · O ROCHEDO: pedras escuras com musgo por cima e samambaias pendendo sobre a beira, como em toda queda de mata.
 *
 * O mapa (o poço como água, a nascente sólida, a prova de BFS) é de scripts/cachoeira.mjs, com as MESMAS coordenadas.
 * Tudo pixel a pixel (16 px por tile), luz de cima e da esquerda, animado por quadros como o fogo.
 */
export const WATERFALL_SPRING = { x: 53, y: 55 } as const;
/** O poço onde a água cai (o tile logo abaixo da parede). */
export const WATERFALL_POOL = { x: 53, y: 56 } as const;

// ── A paleta ────────────────────────────────────────────────────────────────────────────────
/** A água branca (cheia de ar): do lado da luz quase branca, do lado da sombra azul-acinzentada. */
const FOAM = '#d3e9ee';
const PALE = '#a3c9d6';
const SHADE = '#7aa7bd';
const SHADE_DEEP = '#57859f';
const STREAK_DARK = '#6895ad';
/** A água lisa (a língua e o rego no rochedo): a mesma família do lago, escura porque é funda e transparente. */
const GLASS_HI = '#b4dde2';
const GLASS_LIGHT = '#79b7c6';
const GLASS = '#3f8099';
const GLASS_DEEP = '#2b5f78';
const GLASS_SHADOW = '#1f4659';
const INK = '#1a2026';
/** A pedra MOLHADA: mais escura e mais fria que a pedra seca da parede, com brilho de água. */
const WET = ['#94887a', '#6d645b', '#4c4640', '#322e2b'] as const;
const SHEEN = '#b6c3c6';
const MOSS = ['#8fb062', '#64883f', '#45632f', '#2f4626'] as const;
const FERN = ['#7fae52', '#55833a', '#3b5e2b'] as const;

// ── As medidas ──────────────────────────────────────────────────────────────────────────────
const FRAMES = 8;
/** Quanto dura cada quadro da queda. Os fios andam 2 ciclos em 8 quadros: cerca de 2 tiles por segundo embaixo. */
const FRAME_MS = 70;
/** A espuma do poço anda devagar: a corrente leva, não a queda. */
const POOL_FRAME_MS = 210;
/** A altura da água do poço, em relação ao chão (a mesma conta do World3D: o leito, mais o fio da superfície). */
const POOL_SURFACE = -WATER_DEPTH_TILES + 0.02;

/**
 * A PEÇA GRANDE: o rochedo em cima, a beira, a parede molhada e a queda, numa imagem só, para tudo casar pixel com
 * pixel. O pé fica na superfície do poço; a beira do planalto cai na linha LIP (22 px acima do pé, a altura que a
 * parede de 1 tile ocupa na tela), e o rochedo sobe 14 px acima dela.
 */
const CW = 32;
const CH = 36;
const LIP = 14;
/** O meio da queda, em pixels da peça (a língua ocupa as colunas 12 a 19). */
const FALL_C = 16;
const FOOT_W = 26;
const FOOT_H = 20;
const POOL_W = 16;
const POOL_H = 24;
/** O mesmo tom das peças do acampamento: a luz do mundo estoura os claros. */
const TINT = 0xb4b0aa;
/**
 * De dia a luz do mundo é dourada e puxava o branco da água para creme (as fotos mostraram): com sol, a água recebe
 * este tom mais frio, que a devolve ao branco-azulado de uma queda de verdade. As pedras ficam no tom de sempre.
 */
const DAY_TINT = 0x9cb2c2;
const mixTint = (a: number, b: number, t: number): number => {
  const ch = (shift: number): number => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

const hash = (a: number, b: number, seed: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
const frac = (v: number): number => v - Math.floor(v);

type Put = (x: number, y: number, color: string, alpha?: number) => void;

const canvas = (w: number, h: number, paint: (put: Put) => void): HTMLCanvasElement => {
  const c = createCanvas();
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(w, h);
  const put: Put = (x, y, color, alpha = 1) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    img.data[i] = parseInt(color.slice(1, 3), 16);
    img.data[i + 1] = parseInt(color.slice(3, 5), 16);
    img.data[i + 2] = parseInt(color.slice(5, 7), 16);
    img.data[i + 3] = Math.round(alpha * 255);
  };
  paint(put);
  ctx.putImageData(img, 0, 0);
  return c;
};

/**
 * Uma pedra arredondada com contorno, luz de cima-esquerda e musgo no alto. `wet` (0 a 1) escurece a parte de baixo,
 * a que a água borrifa, e põe nela brilhos que piscam com o quadro.
 */
const boulder = (put: Put, w: number, h: number, cx: number, cy: number, rx: number, ry: number, moss: number, wet: number, f: number, seed: number): void => {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y += 1) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x += 1) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      // Um contorno irregular: pedra não é elipse.
      const d = nx * nx + ny * ny - (hash(Math.floor(Math.atan2(ny, nx) * 3), 0, seed) - 0.5) * 0.25;
      if (d > 1.22) continue;
      if (d > 1) { put(x, y, INK); continue; }
      const light = -nx * 0.55 - ny * 0.85 + (hash(x, y, seed + 1) - 0.5) * 0.25;
      let i = light > 0.5 ? 0 : light > 0.05 ? 1 : light > -0.45 ? 2 : 3;
      // A parte molhada, embaixo, fica um tom mais escura.
      if (ny > 0.1 && hash(x, y, seed + 2) < wet) i = Math.min(3, i + 1);
      let c: string = WET[i];
      if (ny < -0.15 && hash(x, y, seed + 3) < moss * (0.4 - ny)) c = light > 0.35 ? MOSS[0] : light > -0.1 ? MOSS[1] : MOSS[2];
      // O brilho da água na pedra molhada: alguns pixels claros, que acendem em quadros diferentes.
      if (ny > -0.2 && light > -0.2 && hash(x, y, seed + 4) < wet * 0.12 && (f + Math.floor(hash(x, y, seed + 5) * FRAMES)) % 4 === 0) c = SHEEN;
      put(x, y, c);
    }
  }
};

/** Uma folha de samambaia: o talo arqueia e pende, com folíolos alternados dos dois lados. */
const frond = (put: Put, x0: number, y0: number, dir: number, len: number): void => {
  for (let i = 0; i <= len; i += 1) {
    const x = x0 + dir * i;
    const y = y0 - (i < 2 ? i * 0.5 : 1) + Math.max(0, i - 2) ** 1.6 * 0.35;
    put(x, y, i < 2 ? FERN[1] : FERN[2]);
    if (i > 0 && i < len) {
      put(x, y - 1, i % 2 === 0 ? FERN[0] : FERN[1]);
      put(x + dir * 0.4, y + 1, FERN[1]);
    }
  }
};

/** A meia-largura da queda na linha `y` da peça grande: 4 px na beira, abrindo até 7 no pé. */
const fallHalf = (y: number): number => 4 + 3.2 * Math.min(1, Math.max(0, (y - LIP) / (CH - 1 - LIP)));

/**
 * Um pixel da ÁGUA BRANCA a `dy` px abaixo da beira, na coluna `x` (`e` = -1 na borda da esquerda, +1 na da direita).
 * O fio de brilho é um padrão periódico em √dy, o TEMPO de queda até ali: como a água acelera, o mesmo padrão fica
 * curto em cima e se estica embaixo, e anda mais rápido embaixo. Devolve a cor, ou null onde a borda se quebrou e a
 * pedra de trás aparece.
 */
const whiteWater = (x: number, dy: number, e: number, f: number): { c: string; a: number } | null => {
  const u = 1.17 * Math.sqrt(Math.max(1, dy));
  // A fase vai por PARES de colunas: cada fio tem 2 px de largura e corre inteiro, como a estria de uma queda real.
  const strand = x >> 1;
  const cp = hash(strand, 0, 11);
  const run = frac(u - f / 4 + cp);
  const ae = Math.abs(e);
  // Os sulcos entre os fios: colunas fixas um tom mais escuras, que dão a estria vertical.
  const groove = hash(x, 0, 39) < 0.28;
  // As bordas se quebram em fios: mais buracos quanto mais perto da borda.
  if (ae > 0.62 && hash(strand, Math.floor(u * 1.6 - f / 2 + cp * 5), 12) < (ae - 0.62) * 2.4) return null;
  if (ae > 1) return hash(x, Math.floor(u * 3 - f + cp * 9), 13) > 0.88 ? { c: PALE, a: 0.7 } : null;
  const lit = e < 0.05;
  let c = lit ? PALE : ae < 0.55 ? SHADE : SHADE_DEEP;
  if (groove) c = lit ? SHADE : STREAK_DARK;
  if (run < 0.32) c = lit ? FOAM : PALE;
  // O miolo da queda é a água mais densa: mais branca.
  else if (ae < 0.3 && run < 0.6 && !groove) c = FOAM;
  return { c, a: 1 };
};

/** A PEÇA GRANDE, quadro `f`: rochedo, rego, língua, parede molhada e queda. */
const paintCascade = (f: number): HTMLCanvasElement => canvas(CW, CH, (put) => {
  // ─ As pedras da beira, em cima do planalto, SÓ DOS LADOS: o meio fica aberto para o riacho que corre pelo alto
  // (paintStream, deitado no planalto) aparecer chegando à queda, como numa cachoeira de verdade.
  boulder(put, CW, CH, 5, 9.5, 4.8, 4.2, 0.9, 0.15, f, 20);
  boulder(put, CW, CH, 25.5, 10, 4.2, 3.8, 0.85, 0.15, f, 21);
  boulder(put, CW, CH, 29.5, 12, 3, 2.6, 0.7, 0.1, f, 22);

  // ─ A dobra da beira: as duas últimas linhas do riacho, onde ele vira a língua da queda.
  for (let y = LIP - 2; y < LIP; y += 1) {
    const half = 4;
    for (let x = Math.floor(FALL_C - half - 0.5); x <= Math.ceil(FALL_C + half - 0.5); x += 1) {
      const e = (x + 0.5 - FALL_C) / half;
      let c = e < -0.4 ? GLASS : e > 0.5 ? GLASS_SHADOW : GLASS_DEEP;
      if ((y * 2 - f * 2 + Math.floor(hash(x, 1, 14) * 6) + 64) % 7 === 0) c = GLASS_LIGHT;
      // A dobra da beira espelha o céu: UMA linha clara, mais forte do lado da luz, que tremula. Sem ela cobrir a
      // largura toda: com a faixa de ponta a ponta e a língua escura embaixo, a beira lia como uma moldura oca.
      if (y === LIP - 1) c = e < 0.4 && hash(x, f, 15) < 0.75 ? GLASS_HI : GLASS_LIGHT;
      put(x, y, c);
    }
  }
  // As pedras da frente do rego, que fazem as margens dele.
  boulder(put, CW, CH, 10, 12, 2.4, 2.4, 0.8, 0.5, f, 23);
  boulder(put, CW, CH, 22, 12.5, 2.2, 2.2, 0.6, 0.6, f, 24);

  // ─ A PAREDE MOLHADA abaixo da beira: pedra escura em lajes, limo rente à água, brilhos que piscam.
  for (let y = LIP; y < CH; y += 1) {
    const left = 4 + Math.round(hash(0, y >> 1, 16) * 2) + (y > 28 ? 1 : 0);
    const right = 25 + Math.round(hash(1, y >> 1, 16) * 2);
    for (let x = left; x <= right; x += 1) {
      const ledge = (y - LIP + Math.floor(hash(x >> 2, 0, 17) * 3)) % 6;
      let c: string = ledge === 5 ? WET[3] : ledge === 0 ? WET[1] : WET[2];
      if (x === left || x === right) c = INK;
      if (hash(x, y, 18) < 0.12) c = WET[3];
      // O limo: verde-escuro rente à água, onde o borrifo nunca seca.
      const fromFall = Math.abs(x + 0.5 - FALL_C) - fallHalf(y);
      if (fromFall > 0 && fromFall < 3 && hash(x, y, 19) < 0.55) c = hash(x, y, 25) < 0.5 ? MOSS[2] : MOSS[3];
      // O brilho da água escorrendo na pedra.
      if (ledge === 0 && hash(x, y, 26) < 0.3 && (f + Math.floor(hash(x, y, 27) * 8)) % 8 < 2) c = SHEEN;
      put(x, y, c);
    }
  }
  // Um fio d'água escorrendo de lado, pela pedra da esquerda, em gotas que descem.
  for (let y = LIP + 1; y < CH - 4; y += 1) {
    if ((y + FRAMES * 8 - f * 2) % 5 < 3) put(6 + (y > 26 ? 1 : 0), y, y % 2 ? GLASS_LIGHT : PALE, 0.95);
  }

  // ─ As samambaias pendendo sobre a beira, e um tufo no rochedo da direita.
  frond(put, 3, 6, -1, 4);
  frond(put, 6, 5, 1, 4);
  frond(put, 2, 11, -1, 3);
  frond(put, 26, 7, 1, 4);
  frond(put, 23, 8, -1, 3);

  // ─ A LÍNGUA: os três primeiros pixels abaixo da beira, lisos e escuros, com linhas de luz verticais.
  for (let y = LIP; y < CH; y += 1) {
    const hw = fallHalf(y);
    const dy = y - LIP;
    for (let x = Math.floor(FALL_C - hw - 2); x <= Math.ceil(FALL_C + hw + 1); x += 1) {
      const e = (x + 0.5 - FALL_C) / hw;
      // A língua: 2 px lisos, e no 3º cada fio (par de colunas) já quebrou ou não, em vez de um xadrez de pixels.
      const glassy = dy < 2 || (dy === 2 && hash(x >> 1, f, 28) < 0.5);
      if (glassy && Math.abs(e) <= 1) {
        let c = e > 0.6 ? GLASS_SHADOW : dy === 0 ? (e < -0.2 ? GLASS_LIGHT : GLASS) : (e < -0.55 ? GLASS_LIGHT : GLASS);
        if (dy === 2) c = e < 0 ? GLASS_LIGHT : GLASS;
        put(x, y, c);
        continue;
      }
      const w = whiteWater(x, dy, e, f);
      if (w) put(x, y, w.c, w.a);
    }
  }

  // ─ A pedra grande do pé, à direita, na frente da queda: o chão a corta embaixo.
  boulder(put, CW, CH, 27, 28, 4.8, 5.2, 0.55, 0.85, f, 29);
});

/**
 * O RIACHO DO ALTO, deitado no planalto, quadro `f` (pedido do autor: "faça água em cima pra parecer realista").
 * Cobre 2×2 tiles, de (51,5; 53,5) a (53,5; 55,5): a NASCENTE brota num olho d'água entre pedras em (52,54), o riacho
 * faz uma curva e corre para o sul até a beira em (53, 55,5), onde a peça grande o faz cair. Como um riacho real:
 *   · fundo no meio e raso nas bordas (azul escuro → claro), margem de terra molhada e musgo, seixos fora d'água;
 *   · a correnteza: fios claros descendo, MAIS RÁPIDOS perto da beira (a água acelera antes de cair);
 *   · uma pedra no meio do leito, com a CORREDEIRA branca em V logo abaixo dela;
 *   · os últimos pixels antes da beira, lisos e espelhados (a "língua" vista de cima);
 *   · o olho d'água borbulhando, com anéis que abrem.
 */
const STREAM = 32;
/** O caminho do riacho, em pixels da peça: do olho d'água até a beira (a beira está na linha 32, colunas 20 a 28). */
const STREAM_PATH: ReadonlyArray<readonly [number, number]> = [[10.5, 9], [14, 12.5], [19, 15.5], [23, 19.5], [24, 24], [24, 32]];
const STREAM_ROCK = { x: 21.5, y: 18 } as const;
interface PathHit { d: number; s: number; side: number }
const streamPathHit = (px: number, py: number): PathHit => {
  let best: PathHit = { d: Infinity, s: 0, side: 0 };
  let acc = 0;
  let total = 0;
  for (let i = 1; i < STREAM_PATH.length; i += 1) total += Math.hypot(STREAM_PATH[i][0] - STREAM_PATH[i - 1][0], STREAM_PATH[i][1] - STREAM_PATH[i - 1][1]);
  for (let i = 1; i < STREAM_PATH.length; i += 1) {
    const [ax, ay] = STREAM_PATH[i - 1];
    const [bx, by] = STREAM_PATH[i];
    const len = Math.hypot(bx - ax, by - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / (len * len)));
    const qx = ax + (bx - ax) * t;
    const qy = ay + (by - ay) * t;
    const d = Math.hypot(px - qx, py - qy);
    if (d < best.d) best = { d, s: (acc + len * t) / total, side: Math.sign((bx - ax) * (py - ay) - (by - ay) * (px - ax)) };
    acc += len;
  }
  return best;
};
const paintStream = (f: number): HTMLCanvasElement => canvas(STREAM, STREAM, (put) => {
  const [sx, sy] = STREAM_PATH[0];
  for (let py = 0; py < STREAM; py += 1) {
    for (let px = 0; px < STREAM; px += 1) {
      const x = px + 0.5;
      const y = py + 0.5;
      const hit = streamPathHit(x, y);
      const pool = Math.hypot(x - sx, (y - sy) * 1.15);
      // O leito: estreito na nascente, abrindo até a largura da beira (8 px).
      const hw = 2 + 2 * hit.s;
      const inPool = pool < 3.6;
      const depth = inPool ? 1 - pool / 3.6 : 1 - hit.d / hw;
      if (inPool || hit.d < hw) {
        let c = depth > 0.55 ? GLASS_DEEP : depth > 0.25 ? GLASS : GLASS_LIGHT;
        // A correnteza: fios descendo, mais rápidos e mais compridos perto da beira.
        const lane = Math.floor((hit.side * hit.d + 8) * 0.9);
        const flow = hit.s * 30 - (f / FRAMES) * (2 + hit.s * 4) * 6 + hash(lane, 0, 60) * 9;
        if (!inPool && depth > 0.15 && ((flow % 6) + 6) % 6 < 1) c = depth > 0.5 ? GLASS_LIGHT : GLASS_HI;
        // A pedra do leito e a corredeira branca em V abaixo dela.
        const rx = x - STREAM_ROCK.x;
        const ry = y - STREAM_ROCK.y;
        if (Math.hypot(rx, ry * 1.2) < 1.6) { put(px, py, Math.hypot(rx + 0.5, ry + 0.5) < 0.9 ? WET[1] : WET[2]); continue; }
        if (ry > 0.5 && ry < 5 && Math.abs(Math.abs(rx) - ry * 0.45) < 0.9 && hash(px, py + f * 3, 61) < 0.75) c = hash(px, f, 62) < 0.5 ? FOAM : PALE;
        // O olho d'água: borbulha no meio e solta anéis.
        if (inPool) {
          const ring = (pool - f * 0.45 + 8) % 2.2;
          if (pool < 1 && hash(px, py + f, 63) < 0.6) c = hash(px, f, 64) < 0.5 ? FOAM : PALE;
          else if (pool > 1 && ring < 0.35) c = GLASS_LIGHT;
        }
        // Os últimos pixels antes da beira: lisos e espelhados.
        if (py >= STREAM - 3 && !inPool) c = py === STREAM - 1 ? (hit.side < 0 || hit.d < 1.5 ? GLASS_HI : GLASS_LIGHT) : depth > 0.4 ? GLASS : GLASS_LIGHT;
        put(px, py, c);
        continue;
      }
      // A margem: terra molhada e musgo rente à água, e seixos um pouco além.
      const bank = inPool ? pool - 3.6 : hit.d - hw;
      const edge = Math.min(bank, inPool ? bank : Infinity);
      if (edge < 1.1) {
        put(px, py, hash(px, py, 65) < 0.45 ? MOSS[2] : hash(px, py, 66) < 0.5 ? '#3e3529' : MOSS[3]);
      } else if (edge < 2.2 && hash(px, py, 67) < 0.22) {
        put(px, py, hash(px, py, 68) < 0.5 ? WET[0] : WET[1]);
      }
    }
  }
  // As pedras em volta do olho d'água, com musgo.
  for (const [bx, by, r] of [[6.5, 7, 2.2], [11, 4.6, 1.8], [14.5, 8.5, 1.5], [7.5, 12.5, 1.6]] as const) {
    for (let py = Math.floor(by - r - 1); py <= by + r + 1; py += 1) {
      for (let px = Math.floor(bx - r - 1); px <= bx + r + 1; px += 1) {
        const d = Math.hypot(px + 0.5 - bx, py + 0.5 - by) / r;
        if (d > 1.2) continue;
        const light = (bx - px - 0.5 + by - py - 0.5) / r;
        put(px, py, d > 1 ? INK : light > 0.6 ? MOSS[0] : light > 0 ? WET[0] : light > -0.6 ? WET[1] : WET[2]);
      }
    }
  }
});

/**
 * O PÉ, quadro `f`: os últimos fios da queda e a FERVURA onde ela bate (um monte branco que se revira, mais largo
 * que a queda), com gotas saltando dos lados. Fica na frente da margem do poço, que esconderia o pé da peça grande.
 */
const paintFoot = (f: number): HTMLCanvasElement => canvas(FOOT_W, FOOT_H, (put) => {
  const cx = FOOT_W / 2;
  const hw = fallHalf(CH - 1);
  for (let y = 0; y < 13; y += 1) {
    for (let x = Math.floor(cx - hw - 1); x <= Math.ceil(cx + hw); x += 1) {
      const e = (x + 0.5 - cx) / hw;
      // A mesma água da peça grande, continuando o tempo de queda.
      const w = whiteWater(x + FALL_C - Math.round(cx), CH - LIP - 6 + y, e, f);
      if (w) put(x, y, w.c, w.a);
    }
  }
  for (let y = FOOT_H - 11; y < FOOT_H; y += 1) {
    for (let x = 0; x < FOOT_W; x += 1) {
      const nx = (x + 0.5 - cx) / cx;
      const ny = (FOOT_H - 0.5 - y) / 10;
      const churn = (hash(x >> 1, (y >> 1) + f * 5, 30) - 0.5) * 0.35;
      const r = nx * nx * 1.05 + ny * ny * 1.5 + churn;
      const n = hash(x, y + f * 17, 31);
      if (r < 0.45) put(x, y, n < 0.55 ? FOAM : n < 0.85 ? PALE : SHADE);
      else if (r < 0.8 && n < 0.75) put(x, y, n < 0.35 ? FOAM : PALE, 0.95);
      else if (r < 1.05 && n < 0.35) put(x, y, n < 0.15 ? FOAM : PALE, 0.75);
    }
  }
  // As gotas que saltam dos lados, uma nuvem diferente a cada quadro.
  for (let i = 0; i < 4; i += 1) {
    const side = i % 2 ? 1 : -1;
    const x = cx + side * (hw + 1 + hash(i, f, 32) * 4);
    const y = FOOT_H - 13 + hash(i, f, 33) * 7;
    put(x, y, PALE, 0.7);
  }
});

/**
 * A ESPUMA DO POÇO, deitada, quadro `f`: em cima, a mancha branca que a fervura empurra; depois manchas soltas que a
 * corrente leva para o sul e, perto do fim, para o leste (o laguinho). Elas afinam e somem pelo caminho. Cada mancha
 * anda, em 8 quadros, exatamente a distância até a próxima da mesma faixa: o ciclo fecha sem emenda.
 */
const paintPool = (f: number): HTMLCanvasElement => canvas(POOL_W, POOL_H, (put) => {
  // A mancha da fervura, encostada na queda.
  for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < POOL_W; x += 1) {
      const nx = (x + 0.5 - POOL_W / 2) / (POOL_W / 2);
      const r = nx * nx * 1.1 + (y / 9) ** 2 * 1.2;
      const n = hash(x, y + f * 7, 34);
      if (r < 1 && n < 0.95 - y * 0.09) put(x, y, n < 0.5 ? FOAM : PALE, 0.95 - y * 0.07);
    }
  }
  const SPACING = 6;
  for (let lane = 0; lane < 4; lane += 1) {
    const lx = 3 + lane * 3.3 + hash(lane, 0, 35) * 1.5;
    const off = hash(lane, 1, 35) * SPACING;
    for (let j = -1; j < POOL_H / SPACING + 1; j += 1) {
      const y = 4 + j * SPACING + off + (f / FRAMES) * SPACING;
      if (y < 3 || y >= POOL_H) continue;
      const t = y / POOL_H;
      // A corrente vira para o leste no fim, onde o poço deságua no laguinho.
      const x = lx + t ** 3 * 6 + Math.sin(y * 0.7 + lane) * 0.6;
      const life = 1 - t;
      const size = 1 + Math.round(life * 1.6);
      for (let k = 0; k < size; k += 1) {
        put(x + k - (size >> 1), y, FOAM, 0.75 * life + 0.1);
        if (size > 1 && k > 0) put(x + k - (size >> 1), y + 1, PALE, 0.55 * life);
      }
    }
  }
});

/** O BORRIFO que sobe do pé: uma nuvenzinha macia (a única peça sem pixel duro, como a névoa do jardim). */
const paintMist = (): HTMLCanvasElement => canvas(24, 16, (put) => {
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      const nx = (x + 0.5) / 24 * 2 - 1;
      const ny = (y + 0.5) / 16 * 2 - 1;
      const r = Math.sqrt(nx * nx + ny * ny);
      const soft = Math.max(0, 1 - r);
      put(x, y, '#ffffff', soft * soft * (0.6 + 0.4 * hash(x >> 2, y >> 2, 8)));
    }
  }
});

/** O ARCO-ÍRIS da névoa: meio anel macio, do vermelho por fora ao violeta por dentro, sumindo nas pontas. */
const paintRainbow = (): HTMLCanvasElement => canvas(48, 24, (put) => {
  const bands = ['#ff4040', '#ffa030', '#fff050', '#50e060', '#4090ff', '#9050e0'];
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 48; x += 1) {
      const dx = (x + 0.5 - 24) / 24;
      const dy = (24 - y - 0.5) / 24;
      const r = Math.sqrt(dx * dx + dy * dy);
      const band = (0.98 - r) / 0.3 * bands.length;
      if (band < 0 || band >= bands.length) continue;
      const edge = Math.min(1, band, bands.length - band) ;
      const foot = Math.min(1, dy * 2.2);
      put(x, y, bands[Math.floor(band)], edge * foot * 0.9);
    }
  }
});

const key = (part: string, f: number): string => `waterfall-${part}-${f}`;
const MIST = 'waterfall-mist';
const DROP = 'waterfall-drop';
const RAINBOW = 'waterfall-rainbow';

let registered = false;
const register = (): void => {
  if (registered) return;
  const add = (k: string, c: HTMLCanvasElement, smooth = false): void => {
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
    tex.minFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    registerTexture3D(k, tex);
  };
  for (let f = 0; f < FRAMES; f += 1) {
    add(key('cascade', f), paintCascade(f));
    add(key('foot', f), paintFoot(f));
    add(key('pool', f), paintPool(f));
    add(key('stream', f), paintStream(f));
  }
  add(MIST, paintMist(), true);
  add(DROP, canvas(1, 1, (put) => { put(0, 0, FOAM, 0.85); }));
  add(RAINBOW, paintRainbow(), true);
  registered = true;
};

interface Puff { bb: Billboard3D; t: number; speed: number; dx: number }
/** Uma gota voando em arco a partir do pé: posição e velocidade em tiles (z = altura). */
interface Drop { bb: Billboard3D; x: number; y: number; z: number; vx: number; vy: number; vz: number }

/** Gravidade das gotas, em tiles/s² (um pouco abaixo da de verdade: a 16 px por tile o arco fica legível). */
const DROP_GRAVITY = 7;

export class Waterfall {
  private readonly cascade: Billboard3D;
  private readonly foot: Billboard3D;
  private readonly pool: Billboard3D;
  private readonly stream: Billboard3D;
  private readonly rainbow: Billboard3D;
  private readonly puffs: Puff[] = [];
  private readonly drops: Drop[] = [];
  private clock = 0;
  private frame = 0;
  private poolFrame = -1;
  private seed = 1;
  private lastDay = -1;

  public constructor(private readonly scene: Engine.Scene) {
    register();
    const w3 = world3d();
    const { x, y } = WATERFALL_SPRING;
    // A peça grande: em pé, um palmo à frente da parede (a borda do tile fica em +0,5), já sobre o poço; o pé na
    // superfície da água, a beira na beira do planalto, o rochedo acima dela.
    this.cascade = w3.objects.addBillboard(key('cascade', 0), 0, { depthWrite: false })
      .setDisplaySize(CW / 16, CH / 16)
      .setTint(TINT)
      .setPosition(x + (CW / 2 - FALL_C) / 16, y + 0.72)
      .setElevation(POOL_SURFACE - 0.02);
    // O pé: na frente da margem de terra do poço, que esconderia o fim da queda.
    this.foot = w3.objects.addBillboard(key('foot', 0), 0, { depthWrite: false })
      .setDisplaySize(FOOT_W / 16, FOOT_H / 16)
      .setTint(TINT)
      .setPosition(x, y + 1.04)
      .setElevation(POOL_SURFACE - 0.04);
    // O riacho do alto, deitado no planalto (2×2 tiles, de (51,5; 53,5) a (53,5; 55,5)).
    this.stream = w3.objects.addBillboard(key('stream', 0), 0, { flat: true, flatY: 0.015, depthWrite: false, alphaTest: 0.01 })
      .setDisplaySize(STREAM / 16, STREAM / 16)
      .setTint(TINT)
      .setPosition(52.5, 54.5);
    // A espuma levada pela corrente, deitada no poço inteiro (os dois tiles de água).
    this.pool = w3.objects.addBillboard(key('pool', 0), 0, { flat: true, flatY: POOL_SURFACE + 0.012, depthWrite: false, alphaTest: 0.01, renderOrder: WATER_LAYER.foam })
      .setDisplaySize(POOL_W / 16, POOL_H / 16)
      .setTint(TINT)
      .setPosition(WATERFALL_POOL.x, WATERFALL_POOL.y + 0.8);
    for (let i = 0; i < 7; i += 1) {
      const bb = w3.objects.addBillboard(MIST, 0, { centered: true, depthWrite: false, alphaTest: 0.01, fog: false })
        .setTint(0xdfe8ea)
        .setDisplaySize(0.9, 0.6);
      this.puffs.push({ bb, t: i / 7, speed: 0.22 + hash(i, 1, 9) * 0.1, dx: (hash(i, 2, 9) - 0.3) * 0.9 });
    }
    for (let i = 0; i < 12; i += 1) {
      const bb = w3.objects.addBillboard(DROP, 0, { centered: true, depthWrite: false, alphaTest: 0.01 })
        .setTint(TINT)
        .setDisplaySize(1 / 16, 1 / 16);
      const d: Drop = { bb, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
      this.launch(d);
      // Começam espalhadas pelo voo, não todas saindo juntas.
      this.flyDrop(d, hash(i, 3, 9) * 0.5);
      this.drops.push(d);
    }
    this.rainbow = w3.objects.addBillboard(RAINBOW, 0, { centered: true, additive: true, alphaTest: 0.01 })
      .setDisplaySize(3.4, 1.7)
      .setPosition(WATERFALL_POOL.x + 0.3, WATERFALL_POOL.y + 0.4)
      .setElevation(1.25)
      .setAlpha(0);
    this.tick(0);
    // No fim de cada quadro, como a névoa do jardim: a água corre mesmo com a cena parada num diálogo.
    scene.events.on(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
  }

  /** O quadro da animação agora (a janela do playtest). */
  public get currentFrame(): number {
    return this.frame;
  }

  /** O quadro, medido (debug/Profiler: seção `life.waterfall`; desligado, não custa nada). */
  private onFrame(): void {
    profiler.begin('life.waterfall');
    this.frameTick();
    profiler.end('life.waterfall');
  }

  private frameTick(): void {
    this.tick(this.scene.game.loop.delta);
  }

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 7, 41);
  }

  /** Uma gota nova sai da fervura, para um dos lados e para a frente, em arco. */
  private launch(d: Drop): void {
    const side = this.rand() < 0.5 ? -1 : 1;
    d.x = WATERFALL_POOL.x + side * (0.15 + this.rand() * 0.3);
    d.y = WATERFALL_POOL.y + 0.05;
    d.z = POOL_SURFACE + 0.1;
    d.vx = side * (0.3 + this.rand() * 0.9);
    d.vy = 0.1 + this.rand() * 0.6;
    d.vz = 1.2 + this.rand() * 1.4;
  }

  private flyDrop(d: Drop, dt: number): void {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;
    d.vz -= DROP_GRAVITY * dt;
    if (d.z < POOL_SURFACE) this.launch(d);
    d.bb.setPosition(d.x, d.y).setElevation(d.z);
  }

  private tick(deltaMs: number): void {
    this.clock += deltaMs;
    const f = Math.floor(this.clock / FRAME_MS) % FRAMES;
    if (f !== this.frame || deltaMs === 0) {
      this.frame = f;
      this.cascade.setTexture(key('cascade', f));
      this.foot.setTexture(key('foot', (f + 3) % FRAMES));
      this.stream.setTexture(key('stream', f));
    }
    const pf = Math.floor(this.clock / POOL_FRAME_MS) % FRAMES;
    if (pf !== this.poolFrame) {
      this.poolFrame = pf;
      this.pool.setTexture(key('pool', pf));
    }
    const dt = Math.min(0.05, deltaMs / 1000);
    for (const d of this.drops) this.flyDrop(d, dt);
    // A névoa: cada nuvem sobe do pé, abre, o vento a leva um pouco para o leste, e some.
    for (const p of this.puffs) {
      p.t = (p.t + dt * p.speed) % 1;
      const rise = p.t;
      p.bb.setPosition(WATERFALL_POOL.x + p.dx * rise, WATERFALL_POOL.y + 0.15)
        .setElevation(POOL_SURFACE + 0.2 + rise * 1.6)
        .setDisplaySize(0.7 + rise * 1.3, 0.45 + rise * 0.75)
        .setAlpha(0.15 * Math.sin(rise * Math.PI));
    }
    // O arco-íris só com sol, e respirando com a névoa.
    const day = world3d().params.daylight;
    if (day !== this.lastDay) {
      this.lastDay = day;
      const tint = mixTint(TINT, DAY_TINT, day);
      for (const b of [this.cascade, this.foot, this.pool, this.stream, ...this.drops.map((d) => d.bb)]) b.setTint(tint);
    }
    this.rainbow.setAlpha(day * 0.055 * (0.7 + 0.3 * Math.sin(this.clock * 0.0006)));
  }

  public destroy(): void {
    this.scene.events.off(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
    for (const b of [this.cascade, this.foot, this.pool, this.stream, this.rainbow, ...this.puffs.map((p) => p.bb), ...this.drops.map((d) => d.bb)]) b.destroy();
    this.puffs.length = 0;
    this.drops.length = 0;
  }
}
