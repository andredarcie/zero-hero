import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';
import { createCanvas } from '@/game/platform/platform';
import { terrainHeightAt } from '@/game/world/relief';
import { valleyTrails, type TilePoint, type ValleyTrail } from '@/game/world/trails';
import { ROAD_PX, roadBlotch, roadColor, roadNoise } from './roadPaint';

/**
 * AS TRILHAS FALHAS, pintadas (o traçado é o que o autor desenhou, ver world/trails: da estrada antiga até a Shui,
 * e da estrada antiga até a Sisi).
 *
 * Como a estrada antiga: uma película deitada sobre a grama, 16 pixels por tile, abaixo dos tufos, com a mesma
 * largura e a mesma terra — serpenteando um nada, e com TRECHOS INTEIROS sem estrada (pedido do autor: "uns pontos
 * que não têm nenhuma estrada e depois volta a ter"): ela some no capim por alguns passos e volta adiante. As duas
 * pontas nunca falham — a que sai da estrada antiga, e a que chega no vizinho. O chão do mundo não muda.
 */

/** Um nada acima do chão e abaixo dos tufos, como a estrada antiga. */
const ROAD_Y = 0.012;
/** A linha é amostrada a cada quarto de tile. */
const SAMPLE_TILES = 0.25;
/** Até onde, em pixels, a beira da trilha chega do meio dela: o laço de pintura só olha esta faixa. */
const REACH_PX = 7;
/** O pedaço de cada ponta que nunca falha, em tiles. */
const ANCHOR_TILES = 2.5;
/** A transparência da terra: um pouco mais cheia que a da estrada antiga (pedido do autor: "mais nítida no chão"). */
const DIRT_ALPHA = Math.round(0.74 * 255);

type Sample = { x: number; y: number; s: number };

/** A linha amostrada, com o SERPENTEAR: um desvio lateral liso que some nas pontas (elas encostam onde têm de encostar). */
const sampleLine = (points: TilePoint[], seed: number): { samples: Sample[]; length: number } => {
  const raw: Sample[] = [];
  let s = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / SAMPLE_TILES));
    for (let k = 0; k < n; k += 1) raw.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, s: s + (len * k) / n });
    s += len;
  }
  const last = points[points.length - 1];
  raw.push({ x: last.x, y: last.y, s });
  const samples = raw.map((p, i) => {
    const before = raw[Math.max(0, i - 1)];
    const after = raw[Math.min(raw.length - 1, i + 1)];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const d = Math.hypot(dx, dy) || 1;
    const ends = Math.max(0, Math.min(1, p.s / ANCHOR_TILES, (s - p.s) / ANCHOR_TILES));
    // Pouco: o caminho é o que o autor desenhou, tile a tile.
    const off = (roadBlotch(p.s * 4, 0, seed, 9) - 0.5) * 0.3 * ends;
    return { x: p.x - (dy / d) * off, y: p.y + (dx / d) * off, s: p.s };
  });
  return { samples, length: s };
};

/**
 * QUANTO A PELÍCULA SOBE OU DESCE. O billboard pisa no chão do CENTRO da caixa (Billboard3D.apply lê terrainHeightAt
 * ali), e a caixa de uma trilha comprida tem o centro onde a trilha nem passa — a da Sisi, no planalto do jardim: ela
 * subia inteira e flutuava sobre o chão de baixo (o autor viu). A trilha corre toda num andar só (world/trails barra
 * a serra), então a elevação desconta o chão do centro e põe o chão da própria trilha.
 */
export const trailLift = (points: TilePoint[], centerX: number, centerY: number): number =>
  terrainHeightAt(points[0].x, points[0].y) - terrainHeightAt(centerX, centerY);

/** De quantos em quantos tiles a trilha falha, e o tamanho da falha (em tiles): uma, curta, em cada trecho. */
const GAP_EVERY = 7;
const GAP_MIN = 0.75;
const GAP_SPREAD = 0.5;
/** A beira da falha: a terra some em um quarto de tile, não de uma vez. */
const GAP_EDGE = 0.25;

/**
 * Quanto de trilha sobra no ponto `s` da linha: 0 = o capim tomou (um trecho sem estrada), 1 = inteira. As falhas
 * são POUCAS E CURTAS (pedido do autor: "os buracos ficaram muito grandes; mais conectada"): uma em cada trecho de
 * GAP_EVERY tiles, num lugar sorteado dentro dele, de três quartos a um tile e um quarto.
 */
export const trailPresence = (s: number, length: number, seed: number): number => {
  if (s < ANCHOR_TILES || length - s < ANCHOR_TILES) return 1;
  const k = Math.floor((s - ANCHOR_TILES) / GAP_EVERY);
  const start = ANCHOR_TILES + k * GAP_EVERY + 1.5 + roadNoise(k, 1, seed) * (GAP_EVERY - 4);
  const end = start + GAP_MIN + roadNoise(k, 2, seed) * GAP_SPREAD;
  const inside = Math.min(s - start, end - s);
  return inside <= 0 ? 1 : Math.max(0, 1 - inside / GAP_EDGE);
};

const rgbCache = new Map<string, [number, number, number]>();
const rgb = (hex: string): [number, number, number] => {
  let c = rgbCache.get(hex);
  if (!c) {
    c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    rgbCache.set(hex, c);
  }
  return c;
};

type Painted = { canvas: HTMLCanvasElement; minX: number; maxX: number; minY: number; maxY: number };

/**
 * A trilha pixel a pixel, na caixa que a contém. Primeiro a DISTÂNCIA de cada pixel ao meio da linha (e em que ponto
 * dela ele cai), segmento por segmento, só na faixa que a beira alcança; depois a terra, com o mesmo perfil da estrada
 * antiga — inteira no meio, rasgando na beira, buracos onde o capim atravessa —, apagada onde a linha falha.
 */
const paintTrail = (trail: ValleyTrail): Painted | null => {
  if (trail.points.length < 2) return null;
  const { samples, length } = sampleLine(trail.points, trail.seed);
  const xs = samples.map((p) => p.x);
  const ys = samples.map((p) => p.y);
  const minX = Math.floor(Math.min(...xs)) - 1;
  const maxX = Math.ceil(Math.max(...xs)) + 1;
  const minY = Math.floor(Math.min(...ys)) - 1;
  const maxY = Math.ceil(Math.max(...ys)) + 1;
  const w = (maxX - minX + 1) * ROAD_PX;
  const h = (maxY - minY + 1) * ROAD_PX;
  const dist = new Float32Array(w * h).fill(Infinity);
  const arc = new Float32Array(w * h);
  // O centro do tile é o inteiro: o tile `minX` começa meio tile antes dele.
  const px = (tx: number): number => (tx - minX + 0.5) * ROAD_PX;
  const py = (ty: number): number => (ty - minY + 0.5) * ROAD_PX;
  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    const ax = px(a.x); const ay = py(a.y);
    const vx = px(b.x) - ax; const vy = py(b.y) - ay;
    const vv = vx * vx + vy * vy || 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, ax + vx) - REACH_PX));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, ax + vx) + REACH_PX));
    const y0 = Math.max(0, Math.floor(Math.min(ay, ay + vy) - REACH_PX));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, ay + vy) + REACH_PX));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * vx + (y + 0.5 - ay) * vy) / vv));
        const d = Math.hypot(x + 0.5 - (ax + vx * t), y + 0.5 - (ay + vy * t));
        const idx = y * w + x;
        if (d < dist[idx]) {
          dist[idx] = d;
          arc[idx] = a.s + (b.s - a.s) * t;
        }
      }
    }
  }

  const canvas = createCanvas();
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(w, h);
  for (let idx = 0; idx < w * h; idx += 1) {
    const d = dist[idx];
    if (!(d < REACH_PX)) continue;
    const s = arc[idx];
    const here = trailPresence(s, length, trail.seed);
    if (here <= 0) continue;
    // O ruído da terra em pixel do MUNDO: cada trilha tem o seu desenho, e nenhuma repete a outra.
    const x = (idx % w) + minX * ROAD_PX;
    const y = Math.floor(idx / w) + minY * ROAD_PX;
    // O mesmo perfil da estrada antiga (OldRoad.paintRoad): a meia largura de 2,8 px, a beira e o quanto sobra.
    // Mais cheia que a estrada antiga: o capim atravessa menos (pedido do autor: "mais conectada, mais visível").
    const worn = (0.48 + 0.22 * roadBlotch(s, 1.5, trail.seed + 7, 6)) * here;
    const half = 2.8 + (roadBlotch(s * 4, 2.5, trail.seed + 11, 8) - 0.5) * 1.2;
    const edge = half + (roadBlotch(x, y, 3, 4) - 0.5) * 1.8;
    const cover = d < edge ? 1 : d < edge + 1.6 ? 0.45 : 0;
    const gap = roadBlotch(x, y, 5, 3) * 0.6 + roadNoise(x, y, 9) * 0.4;
    if (cover <= 0 || gap > worn * cover + 0.08) continue;
    const [r, g, b] = rgb(roadColor(x, y));
    image.data[idx * 4] = r;
    image.data[idx * 4 + 1] = g;
    image.data[idx * 4 + 2] = b;
    image.data[idx * 4 + 3] = DIRT_ALPHA;
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, minX, maxX, minY, maxY };
};

export class Trails {
  private readonly bodies: Billboard3D[] = [];

  public constructor(trails: ValleyTrail[] = valleyTrails()) {
    for (const trail of trails) {
      const painted = paintTrail(trail);
      if (!painted) continue;
      const tex = new THREE.CanvasTexture(painted.canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      registerTexture3D(trail.id, tex);
      // Pintura no chão, por baixo das sombras (sem gravar profundidade), como a estrada antiga — e no chão DA TRILHA,
      // não no do centro da caixa (ver trailLift).
      const cx = (painted.minX + painted.maxX) / 2;
      const cy = (painted.minY + painted.maxY) / 2;
      this.bodies.push(world3d().objects.addBillboard(trail.id, 0, { flat: true, flatY: ROAD_Y, depthWrite: false, renderOrder: 1 })
        .setPosition(cx, cy)
        .setElevation(trailLift(trail.points, cx, cy))
        .setDisplaySize(painted.maxX - painted.minX + 1, painted.maxY - painted.minY + 1));
    }
  }

  /** Quantas trilhas estão no chão (as sondas e os testes perguntam). */
  public get count(): number {
    return this.bodies.length;
  }

  public destroy(): void {
    for (const body of this.bodies) body.destroy();
    this.bodies.length = 0;
  }
}
