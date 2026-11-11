// AS CASAS EM 3D (2026-11-11): um ESQUELETO de verdade, não um desenho em pé com volume colado atrás.
//
// O caminho até aqui (o autor revisou quatro vezes): primeiro um telhado de 1 tile sobre a fachada de papel ("uma folha
// de papel com um telhado 3D em cima"); depois paredes e um telhado correto atrás, mas a água da FRENTE continuava sendo
// o desenho da fachada — um trapézio EM PÉ, que não fecha com águas inclinadas: "o telhado da frente ficou com uma
// aresta solta, não conectada no telhado". Uma superfície vertical e uma inclinada só se tocam por uma linha.
//
// Agora a fachada é só a PAREDE da frente (homeTextures pinta a versão `bare`, sem telhado e sem chaminé), e tudo o que
// fica acima dela é volume, saído de um esqueleto só (`houseSkeleton`), em que toda face divide as arestas com as
// vizinhas:
//
//   · as PAREDES: a da frente é o desenho; as dos lados vão da fachada até o fundo do que é sólido, com a tinta da
//     borda do desenho repetida para trás (as toras e a sombra do beiral continuam pela quina);
//   · o BEIRAL: um retângulo na altura do topo da parede, sobrando dois pixels na frente e atrás e até a borda do
//     desenho nos lados; embaixo dele a TESTEIRA, dois pixels de espessura, que é o que faz a borda ler como telhado;
//   · a CUMEEIRA: no meio da profundidade, na altura proporcional ao telhado do desenho de cada casa, e do comprimento
//     de um telhado de quatro águas de verdade (largura menos profundidade): as quatro águas têm o MESMO caimento;
//   · as QUATRO ÁGUAS, ligadas pela cumeeira e pelas quinas, cada uma com as telhas pintadas no plano dela (as fiadas
//     paralelas ao beiral daquela água, o pincel da fachada `shingleTone`), contorno no beiral, nas quinas e na cumeeira,
//     e a luz de cada lado: a da esquerda clara, a da direita na sombra, a da frente no meio, a de trás mais funda;
//   · a CHAMINÉ, uma caixa inteira saindo de dentro do telhado na linha da cumeeira; a LENHA, uma caixa encostada na
//     quina (a frente dela é o desenho).
//
// Tudo é medido no desenho (HOME_GABLES, HOME_WALLS, HOME_CHIMNEYS, HOME_BOXES) e conferido pixel a pixel
// (homeShell.audit.test.ts); o esqueleto tem os próprios testes (homeShell.test.ts).

import * as THREE from 'three';

import { createCanvas } from '@/game/platform/platform';
import { INK, RAMPS, toneOf } from '@/game/render3d/pixelForms';
import {
  HOME_BOXES, HOME_CHIMNEYS, HOME_GABLES, HOME_PAINTERS, HOME_WALLS, paintedCanvas, shingleTone, type ChimneySpec, type GableSpec,
  type HomeKind, type WallSpec,
} from './homeTextures';

/** Pixels de arte por tile, e a fachada: 48 pixels em 3 tiles. */
const TEXELS = 16;
const HOME_TEXELS = 48;
const HOME_SIZE = 3;
/** O fundo da casa a partir da fachada, em tiles (o sólido vai até 1,5 tile atrás do pé, e a fachada fica 0,3 à frente dele). */
export const HOUSE_DEPTH = 1.8;
/** Quanto o beiral passa da parede na frente e atrás, e a espessura da testeira (dois pixels cada). */
const OVERHANG = 2 / TEXELS;
const FASCIA = 2 / TEXELS;
/**
 * A altura da cumeeira acima do beiral, por fileira do telhado no desenho: a cabana do Marco (16 fileiras) sobe 0,6 tile,
 * a casa da Sisi (19) 0,71 — o telhado da Sisi era o mais alto do desenho e continua sendo. Dá 30° a 35° de caimento,
 * abaixo dos 48° da câmera: a água de trás aparece de frente, e a da frente não vira uma parede.
 */
const RISE_PER_ROW = 0.6 / TEXELS;
/** As paredes encostam na fachada (perpendiculares, não brigam pela profundidade); a lenha, um fio atrás. */
const WALL_GAP = 0.002;
const BOX_GAP = 0.004;
/** A luz de cada água (a mesma conta de `toneOf` da fachada). */
const FRONT_LIT = 0.25;
const BACK_LIT = 0.05;
const LEFT_LIT = 0.5;
const RIGHT_LIT = -0.05;
/**
 * O telhado pega o sol inteiro (está deitado) e a fachada é desenho em pé: ele sai 9% mais escuro na própria tinta. O
 * material tem o tom da fachada, então a parede (a tinta da fachada) sai igual a ela na quina.
 */
const ROOF_SHADE = 0.905;
/** Até onde, em pixels, o contorno pega de uma aresta. */
const EDGE_PX = 0.6;

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: V3): V3 => scale(a, 1 / (Math.sqrt(dot(a, a)) || 1));

/** A distância do ponto (px, py) ao segmento (ax, ay)-(bx, by). */
const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
};

/** Escurece uma cor `#rrggbb` ou `rgb(r, g, b)` (em sRGB, como a pintura). */
const shadeColor = (color: string, k: number): string => {
  if (k === 1) return color;
  const m = color.startsWith('#')
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    : (color.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
  return `rgb(${m.map((v) => Math.round(v * k)).join(', ')})`;
};

/**
 * O quanto a casa AFUNDA para encostar no chão: o desenho tem 48 fileiras e a parede acaba antes da última (uma ou duas
 * fileiras vazias embaixo), então a fachada em pé no chão flutuava um ou dois pixels. A fachada e o corpo descem isto.
 */
export const homeSink = (kind: HomeKind): number => {
  const w = HOME_WALLS[kind];
  return w ? (HOME_TEXELS - 1 - w.bottom) / TEXELS : 0;
};

/** O esqueleto da casa no mundo: tudo de onde as faces saem. */
export interface HouseSkeleton {
  walls: { x0: number; x1: number; y0: number; y1: number; zFront: number; zBack: number };
  eave: { x0: number; x1: number; zFront: number; zBack: number; y: number };
  ridge: { x0: number; x1: number; z: number; y: number };
  chimney?: { x0: number; x1: number; zFront: number; zBack: number; y0: number; y1: number };
}

/**
 * O esqueleto da casa com a fachada de pé em (x, frontZ) e o pé do desenho na altura `base`. Puro, para os testes: a
 * parede na medida do desenho, o beiral em volta dela na altura do topo, a cumeeira no meio com as quatro águas no mesmo
 * caimento, a chaminé saindo de dentro do telhado na linha da cumeeira.
 */
export const houseSkeleton = (
  g: GableSpec, w: WallSpec, chimney: ChimneySpec | undefined, x: number, frontZ: number, base = 0,
): HouseSkeleton => {
  const col = (c: number): number => x - HOME_SIZE / 2 + c / TEXELS;
  const rowY = (r: number): number => base + (HOME_TEXELS - r) / TEXELS; // a borda de cima da fileira r
  const eaveHalf = Math.round(g.startHalf + (g.rows - 1) * g.grow);
  const wallFront = frontZ - WALL_GAP;
  const wallBack = wallFront - HOUSE_DEPTH;
  // o beiral nos lados vai até onde o DESENHO do telhado ia (ele é pintado mais largo que a tela e cortado na borda)
  const eave = {
    x0: col(Math.max(0, g.cx - eaveHalf - 1)), x1: col(Math.min(HOME_TEXELS, g.cx + eaveHalf + 1)),
    zFront: frontZ + OVERHANG, zBack: wallBack - OVERHANG, y: rowY(w.top),
  };
  const half = (eave.zFront - eave.zBack) / 2;
  const mid = (eave.x0 + eave.x1) / 2;
  // quatro águas no mesmo caimento: a cumeeira para a meia profundidade antes de cada beiral do lado
  const ridge = {
    x0: Math.min(eave.x0 + half, mid), x1: Math.max(eave.x1 - half, mid),
    z: (eave.zFront + eave.zBack) / 2, y: eave.y + g.rows * RISE_PER_ROW,
  };
  const side = chimney ? (chimney.right - chimney.left + 1) / TEXELS : 0;
  return {
    walls: { x0: col(w.left), x1: col(w.right + 1), y0: rowY(w.bottom + 1), y1: eave.y, zFront: wallFront, zBack: wallBack },
    eave,
    ridge,
    chimney: chimney && {
      x0: col(chimney.left), x1: col(chimney.right + 1), zFront: ridge.z + side / 2, zBack: ridge.z - side / 2,
      y0: eave.y, y1: rowY(chimney.top),
    },
  };
};

/**
 * Uma face: os cantos, para onde ela olha (de fora), quais arestas têm contorno (a aresta i vai do canto i ao i + 1),
 * e a tinta de cada pixel — `i` ao longo da primeira aresta (o beiral, o pé), `k` subindo dela (0 = a fileira do pé).
 */
interface Face {
  pts: V3[];
  out: V3;
  ink: number[];
  shade: number;
  paint: (i: number, k: number, w: number, h: number) => string;
}

/** A face no plano dela, em pixels: o pé na primeira aresta, `v` subindo para o terceiro canto. */
const faceFrame = (f: Face): { uv: Array<[number, number]>; w: number; h: number } => {
  const o = f.pts[0];
  const u = unit(sub(f.pts[1], o));
  const toApex = sub(f.pts[2], o);
  const v = unit(sub(toApex, scale(u, dot(toApex, u))));
  const uv = f.pts.map((p): [number, number] => [dot(sub(p, o), u) * TEXELS, dot(sub(p, o), v) * TEXELS]);
  return { uv, w: Math.max(1, Math.ceil(Math.max(...uv.map((q) => q[0])) - 1e-6)), h: Math.max(1, Math.ceil(Math.max(...uv.map((q) => q[1])) - 1e-6)) };
};

export interface HomeShell { geometry: THREE.BufferGeometry; canvas: HTMLCanvasElement }

/** A casa `kind` inteira acima e em volta da fachada (o esqueleto, `houseSkeleton`); nada para quem não tem telha. */
export const buildHomeShell = (kind: HomeKind, x: number, frontZ: number, base = 0): HomeShell | null => {
  const g = HOME_GABLES[kind];
  const wall = HOME_WALLS[kind];
  if (!g || !wall) return null;
  const s = houseSkeleton(g, wall, HOME_CHIMNEYS[kind], x, frontZ, base);
  const { eave: e, ridge: r, walls: wl } = s;
  const faces: Face[] = [];

  // AS QUATRO ÁGUAS: o pé de cada uma é o beiral dela; as fiadas sobem dele
  const shingles = (lit: number) => (i: number, k: number): string =>
    shingleTone(g.ramp, toneOf(g.ramp, lit), Math.floor(k / 3) * 3 + (2 - (k % 3)), i);
  const all = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
  const EFL: V3 = [e.x0, e.y, e.zFront];
  const EFR: V3 = [e.x1, e.y, e.zFront];
  const EBL: V3 = [e.x0, e.y, e.zBack];
  const EBR: V3 = [e.x1, e.y, e.zBack];
  const RL: V3 = [r.x0, r.y, r.z];
  const RR: V3 = [r.x1, r.y, r.z];
  const up = (dx: number, dz: number): V3 => [dx, 1, dz];
  faces.push({ pts: [EFL, EFR, RR, RL], out: up(0, 1), ink: all(4), shade: ROOF_SHADE, paint: shingles(FRONT_LIT) });
  faces.push({ pts: [EBR, EBL, RL, RR], out: up(0, -1), ink: all(4), shade: ROOF_SHADE, paint: shingles(BACK_LIT) });
  faces.push({ pts: [EBL, EFL, RL], out: up(-1, 0), ink: all(3), shade: ROOF_SHADE, paint: shingles(LEFT_LIT) });
  faces.push({ pts: [EFR, EBR, RR], out: up(1, 0), ink: all(3), shade: ROOF_SHADE, paint: shingles(RIGHT_LIT) });
  // A TESTEIRA: dois pixels debaixo do beiral, na frente e nos lados (atrás a câmera nunca vê)
  const fy = e.y - FASCIA;
  const fascia = (tone: string) => (_i: number, k: number): string => (k === 0 ? INK : tone);
  faces.push({ pts: [[e.x0, fy, e.zFront], [e.x1, fy, e.zFront], EFR, EFL], out: [0, 0, 1], ink: [0], shade: ROOF_SHADE, paint: fascia(g.ramp[3]) });
  faces.push({ pts: [[e.x0, fy, e.zBack], [e.x0, fy, e.zFront], EFL, EBL], out: [-1, 0, 0], ink: [0], shade: ROOF_SHADE, paint: fascia(g.ramp[2]) });
  faces.push({ pts: [[e.x1, fy, e.zFront], [e.x1, fy, e.zBack], EBR, EFR], out: [1, 0, 0], ink: [0], shade: ROOF_SHADE, paint: fascia(g.ramp[3]) });

  // AS PAREDES DOS LADOS: a coluna da borda da fachada (sem o telhado), fileira por fileira, repetida para trás
  // (`rightMix` puxa a da direita para a tinta da luz: a quina do desenho pode ser escura demais para uma parede inteira)
  const art = paintedCanvas((rect) => HOME_PAINTERS[kind](rect, false, true)).getContext('2d', { willReadFrequently: true });
  const px = art?.getImageData(0, 0, HOME_TEXELS, HOME_TEXELS).data;
  const wallRows = wall.bottom - wall.top + 1;
  const wallColor = (sample: number, mix: number) => (_i: number, k: number): string => {
    const row = wall.top + Math.max(0, Math.min(wallRows - 1, wallRows - 1 - k));
    const at = (row * HOME_TEXELS + sample) * 4;
    const lit = (row * HOME_TEXELS + wall.sampleLeft) * 4;
    const ch = (c: number): number => (px ? Math.round(px[at + c] * (1 - mix) + px[lit + c] * mix) : 0);
    return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
  };
  faces.push({
    pts: [[wl.x0, wl.y0, wl.zBack], [wl.x0, wl.y0, wl.zFront], [wl.x0, wl.y1, wl.zFront], [wl.x0, wl.y1, wl.zBack]],
    out: [-1, 0, 0], ink: [3], shade: 1, paint: wallColor(wall.sampleLeft, 0),
  });
  faces.push({
    pts: [[wl.x1, wl.y0, wl.zFront], [wl.x1, wl.y0, wl.zBack], [wl.x1, wl.y1, wl.zBack], [wl.x1, wl.y1, wl.zFront]],
    out: [1, 0, 0], ink: [1], shade: 1, paint: wallColor(wall.sampleRight, wall.rightMix ?? 0),
  });

  // A CHAMINÉ: frente, lados e boca; as fiadas de pedra desencontradas do desenho, a luz da esquerda
  const c = s.chimney;
  if (c) {
    const stone = (lit: string, dark: string) => (i: number, k: number, w: number): string => {
      const course = Math.floor(k / 3);
      const seam = k % 3 === 2 || (i + course * 2) % 4 === 0;
      return seam ? RAMPS.stone[3] : i < w / 2 ? lit : dark;
    };
    const mouth = (i: number, k: number, w: number, h: number): string =>
      i >= 3 && i <= w - 4 && k >= 3 && k <= h - 4 ? '#16110f' : RAMPS.stone[1];
    faces.push({
      pts: [[c.x0, c.y0, c.zFront], [c.x1, c.y0, c.zFront], [c.x1, c.y1, c.zFront], [c.x0, c.y1, c.zFront]],
      out: [0, 0, 1], ink: [1, 2, 3], shade: 1, paint: stone(RAMPS.stone[0], RAMPS.stone[1]),
    });
    faces.push({
      pts: [[c.x0, c.y0, c.zBack], [c.x0, c.y0, c.zFront], [c.x0, c.y1, c.zFront], [c.x0, c.y1, c.zBack]],
      out: [-1, 0, 0], ink: [2, 3], shade: 1, paint: stone(RAMPS.stone[0], RAMPS.stone[0]),
    });
    faces.push({
      pts: [[c.x1, c.y0, c.zFront], [c.x1, c.y0, c.zBack], [c.x1, c.y1, c.zBack], [c.x1, c.y1, c.zFront]],
      out: [1, 0, 0], ink: [1, 2], shade: 1, paint: stone(RAMPS.stone[2], RAMPS.stone[2]),
    });
    faces.push({
      pts: [[c.x0, c.y1, c.zFront], [c.x1, c.y1, c.zFront], [c.x1, c.y1, c.zBack], [c.x0, c.y1, c.zBack]],
      out: [0, 1, 0], ink: all(4), shade: 1, paint: mouth,
    });
  }

  // A LENHA: o topo e o lado de fora (a frente é o desenho); as toras deitadas de frente para trás
  const col = (cc: number): number => x - HOME_SIZE / 2 + cc / TEXELS;
  const rowY = (rr: number): number => base + (HOME_TEXELS - rr) / TEXELS;
  const logs = (across: boolean) => (i: number, k: number): string => {
    const n = across ? i : k;
    return n % 3 === 2 ? RAMPS.wood[3] : n % 3 === 0 ? RAMPS.wood[0] : RAMPS.wood[1];
  };
  for (const b of HOME_BOXES[kind] ?? []) {
    const x0 = col(b.left);
    const x1 = col(b.right + 1);
    const y0 = rowY(b.bottom + 1);
    const y1 = rowY(b.top);
    const z0 = frontZ - BOX_GAP;
    const z1 = z0 - b.depth / TEXELS;
    faces.push({ pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], out: [0, 1, 0], ink: all(4), shade: 1, paint: logs(true) });
    faces.push({ pts: [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], out: [-1, 0, 0], ink: [2, 3], shade: 1, paint: logs(false) });
  }

  return paintFaces(faces);
};

/** Pinta cada face no plano dela, empacota as pinturas num atlas e monta a malha (uma só). */
const paintFaces = (faces: readonly Face[]): HomeShell => {
  // O ATLAS em prateleiras: as faces lado a lado, até a largura máxima, e a próxima prateleira embaixo
  const MAX_W = 160;
  const frames = faces.map(faceFrame);
  const slots: Array<{ ox: number; oy: number }> = [];
  let ox = 0;
  let oy = 0;
  let shelf = 0;
  let W = 1;
  frames.forEach((f) => {
    if (ox > 0 && ox + f.w > MAX_W) { oy += shelf + 1; ox = 0; shelf = 0; }
    slots.push({ ox, oy });
    ox += f.w + 1;
    shelf = Math.max(shelf, f.h);
    W = Math.max(W, ox);
  });
  const H = oy + shelf + 1;
  const canvas = createCanvas();
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  faces.forEach((face, n) => {
    const fr = frames[n];
    const slot = slots[n];
    const edges = face.ink.map((e) => [fr.uv[e], fr.uv[(e + 1) % face.pts.length]] as const);
    for (let k = 0; k < fr.h; k += 1) {
      for (let i = 0; i < fr.w; i += 1) {
        const ink = edges.some(([a, b]) => segDist(i + 0.5, k + 0.5, a[0], a[1], b[0], b[1]) < EDGE_PX);
        if (!ctx) continue;
        ctx.fillStyle = shadeColor(ink ? INK : face.paint(i, k, fr.w, fr.h), face.shade);
        ctx.fillRect(slot.ox + i, slot.oy + (fr.h - 1 - k), 1, 1);
      }
    }
    // os cantos: no mundo e no atlas (v = 0 embaixo); os triângulos em leque, virados para fora
    const first = positions.length / 3;
    face.pts.forEach((p, j) => {
      positions.push(p[0], p[1], p[2]);
      uvs.push((slot.ox + fr.uv[j][0]) / W, 1 - (slot.oy + fr.h - fr.uv[j][1]) / H);
    });
    const outward = dot(cross(sub(face.pts[1], face.pts[0]), sub(face.pts[2], face.pts[0])), face.out) > 0;
    for (let j = 1; j < face.pts.length - 1; j += 1) {
      index.push(...(outward ? [first, first + j, first + j + 1] : [first, first + j + 1, first + j]));
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // a luz de cima, como o chão: a luz de cada face já está pintada nela, e a normal de verdade punha a água de trás e as
  // paredes no escuro
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geometry.setIndex(index);
  return { geometry, canvas };
};
