// A ESCADA DA SERRA: quatro degraus que vencem um nível (RELIEF_HEIGHT) dentro de um tile, no rumo da subida (`ux`,
// `uz`). A forma é a de sempre (pedido antigo do autor: "melhore drasticamente o visual da escadaria", e depois "deixa
// a escada pura de pedra"): degraus, uma MURETA de cada lado que sobe com eles, e um PILAR embaixo e em cima.
//
// A PEDRA LAVRADA DA MESMA ROCHA (pedido do autor, 2026-11-11: "melhore a qualidade da escada e faça ela combinar"
// com a serra nova). Duas coisas mudaram:
//
//   · A PINTURA: era o calçamento (pedra redonda com rejunte, quadro 23) em toda face — bege, e lia como escada de
//     madeira encostada numa parede de rocha cinza. Agora é pedra cortada na paleta da rocha (spritefactory/sprites/
//     stair-stone.mjs): o DEGRAU com a quina acesa e o fundo escuro, a SILHARIA em fiadas na mureta, no espelho e no
//     pilar, e o CAPEAMENTO claro em cima deles.
//   · A MEDIDA: a malha espremia e esticava a arte (o espelho de cada degrau, um quarto de tile, levava o quadro
//     inteiro; a mureta e o pilar o esticavam na altura). Agora toda face tira a arte na MEDIDA DO MUNDO, um pixel de
//     arte por 1/16 de tile: o piso pela posição na escada, a face em pé pela altura. A face que passa de um andar é
//     cortada na divisa (`band`), e cada pedaço lê o mesmo quadro de novo — a fiada continua, como num muro.
//
// Escadas lado a lado, no mesmo rumo e no mesmo andar, são UMA escadaria: entre elas não há mureta, e o piso corre
// inteiro.

import * as THREE from 'three';

import { RELIEF_HEIGHT } from '@/game/world/relief';
import { STAIR_STEPS } from './terrainGeometry';
import { tilesetFrameUv } from './textures3d';

/** As pinturas da escada (stair-stone.mjs). */
export const STAIR_FRAMES = { tread: 130, ashlar: 131, coping: 132, ashlarMoss: 133, riser: 134 } as const;
/** Uma escada em cada tantas tem musgo nas juntas da silharia. */
const MOSS_EVERY = 3;
/**
 * A luz de cada face (a lei normalUp: o volume vem pintado no vértice). O degrau é a face mais clara, cheio na quina e
 * um passo abaixo no fundo, encostado no espelho do degrau seguinte; o espelho é sombra, mais funda debaixo da quina;
 * a mureta de fora pega mais luz que a de dentro, que fica entre ela e os degraus; o capeamento desenha a escadaria
 * de cima, um passo abaixo do degrau (mais claro, as duas muretas viravam os trilhos de uma escada de mão e o degrau
 * sumia entre elas). Mais claro que isto, a escada voltava a ser a coisa mais clara do quadro.
 */
export const STAIR_SHADE = {
  tread: 1.04, treadBack: 0.86, riserTop: 0.56, riserFoot: 0.7,
  wallOut: 0.8, wallIn: 0.7, wallEnd: 0.74, cap: 0.86, post: 0.84, postEnd: 0.76, postCap: 0.92,
} as const;
/** O quanto um degrau varia de tom do vizinho (pedra gasta de um jeito em cada um). */
const STEP_SPREAD = 0.05;
/** A mureta: espessura (em tiles), altura acima da linha dos degraus, e o pilar das pontas. */
const STAIR_WALL = 0.14;
const STAIR_PARAPET = 0.3;
const STAIR_POST = { len: 0.17, wide: 0.04, rise: 0.2 };

const hash = (x: number, z: number): number => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Um ponto da escada em coordenadas dela: `s` na subida, `t` de través, `h` a altura a partir do andar de saída. */
type P = readonly [number, number, number];
/** Como a face tira a arte: o piso pela posição na escada; a face em pé pela altura, de lado (s) ou de frente (t). */
type ArtMap = 'top' | 'side' | 'front';

/**
 * Corta um polígono convexo em pé nas divisas de andar (h inteiro): cada pedaço lê o quadro com a altura contada da
 * divisa de baixo, então a fiada da silharia continua e nada estica.
 */
const band = (poly: readonly P[]): Array<{ floor: number; poly: P[] }> => {
  const hs = poly.map((p) => p[2]);
  const out: Array<{ floor: number; poly: P[] }> = [];
  for (let floor = Math.floor(Math.min(...hs) + 1e-6); floor < Math.max(...hs) - 1e-6; floor++) {
    let cur: P[] = [...poly];
    for (const [limit, keepAbove] of [[floor, true], [floor + 1, false]] as const) {
      const next: P[] = [];
      for (let i = 0; i < cur.length; i++) {
        const a = cur[i];
        const b = cur[(i + 1) % cur.length];
        const inA = keepAbove ? a[2] >= limit - 1e-9 : a[2] <= limit + 1e-9;
        const inB = keepAbove ? b[2] >= limit - 1e-9 : b[2] <= limit + 1e-9;
        if (inA) next.push(a);
        if (inA !== inB) {
          const k = (limit - a[2]) / (b[2] - a[2]);
          next.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, limit]);
        }
      }
      cur = next;
    }
    if (cur.length >= 3) out.push({ floor, poly: cur });
  }
  return out;
};

export const buildStairGeometry = (
  stairs: ReadonlyArray<{ x: number; z: number; ux: number; uz: number; base: number }>,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const bounds: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  // As escadas gêmeas: o mesmo rumo, o mesmo andar, encostadas de lado.
  const keyOf = (t: { x: number; z: number; ux: number; uz: number; base: number }): string => `${t.x},${t.z},${t.ux},${t.uz},${t.base}`;
  const all = new Set(stairs.map(keyOf));
  for (const st of stairs) {
    const { x, z, ux, uz, base } = st;
    const vx = -uz;
    const vz = ux;
    /** Um polígono convexo da escada, com a luz de cada canto; a arte na medida do mundo (ver `ArtMap`). */
    const face = (frame: number, map: ArtMap, poly: readonly P[], shade: (p: P) => number): void => {
      const f = tilesetFrameUv(frame);
      const pieces = map === 'top' ? [{ floor: 0, poly: [...poly] }] : band(poly);
      for (const piece of pieces) {
        const first = pos.length / 3;
        for (const p of piece.poly) {
          const [s, t, h] = p;
          pos.push(x + (s - 0.5) * ux + (t - 0.5) * vx, (base + h) * RELIEF_HEIGHT, z + (s - 0.5) * uz + (t - 0.5) * vz);
          // a = de través da face, b = ao longo (piso) ou para cima (em pé), um pixel de arte por 1/16 de tile
          const a = map === 'side' ? s : t;
          const b = map === 'top' ? s : h - piece.floor;
          uv.push(f.u0 + Math.min(1, Math.max(0, a)) * (f.u1 - f.u0), f.v0 + Math.min(1, Math.max(0, b)) * (f.v1 - f.v0));
          bounds.push(f.cu0, f.cv0, f.cu1, f.cv1);
          nrm.push(0, 1, 0);
          const c = shade(p);
          col.push(c, c, c);
        }
        for (let i = 1; i + 1 < piece.poly.length; i++) idx.push(first, first + i, first + i + 1);
      }
    };
    const flat = (v: number) => (): number => v;
    const twin = [
      all.has(keyOf({ ...st, x: x - vx, z: z - vz })),
      all.has(keyOf({ ...st, x: x + vx, z: z + vz })),
    ];
    const t0 = twin[0] ? 0 : STAIR_WALL;
    const t1 = twin[1] ? 1 : 1 - STAIR_WALL;
    const ashlar = Math.floor(hash(x + 0.5, z + 0.5) * MOSS_EVERY) === 0 ? STAIR_FRAMES.ashlarMoss : STAIR_FRAMES.ashlar;

    // OS DEGRAUS: o piso (cheio na quina, um passo abaixo no fundo) e o espelho (sombra, mais funda debaixo da quina).
    for (let k = 0; k < STAIR_STEPS; k += 1) {
      const s0 = k / STAIR_STEPS;
      const s1 = (k + 1) / STAIR_STEPS;
      const h0 = k / STAIR_STEPS;
      const h1 = (k + 1) / STAIR_STEPS;
      const tone = 1 + STEP_SPREAD * (2 * hash(x * 7 + k, z * 13 - k) - 1);
      face(STAIR_FRAMES.tread, 'top', [[s0, t0, h1], [s0, t1, h1], [s1, t1, h1], [s1, t0, h1]],
        (p) => tone * (p[0] <= s0 + 1e-6 ? STAIR_SHADE.tread : STAIR_SHADE.treadBack));
      face(STAIR_FRAMES.riser, 'front', [[s0, t0, h0], [s0, t1, h0], [s0, t1, h1], [s0, t0, h1]],
        (p) => tone * (p[2] >= h1 - 1e-6 ? STAIR_SHADE.riserTop : STAIR_SHADE.riserFoot));
    }

    // A MURETA de cada lado sem gêmea: sobe com a escada, a uma altura fixa acima da linha dos degraus.
    for (const side of [0, 1] as const) {
      if (twin[side]) continue;
      const out = side === 0 ? 0 : 1;
      const inn = side === 0 ? STAIR_WALL : 1 - STAIR_WALL;
      const top = (sv: number): number => sv + STAIR_PARAPET;
      // a face de fora, do chão até o topo inclinado
      face(ashlar, 'side', [[0, out, 0], [1, out, 0], [1, out, top(1)], [0, out, top(0)]], flat(STAIR_SHADE.wallOut));
      // a face de dentro, dos degraus até o topo (por degrau, para não atravessar o piso)
      for (let k = 0; k < STAIR_STEPS; k += 1) {
        const s0 = k / STAIR_STEPS;
        const s1 = (k + 1) / STAIR_STEPS;
        const h1 = (k + 1) / STAIR_STEPS;
        face(ashlar, 'side', [[s0, inn, h1], [s1, inn, h1], [s1, inn, top(s1)], [s0, inn, top(s0)]], flat(STAIR_SHADE.wallIn));
      }
      // o capeamento: a pedra comprida de cima, a linha clara que desenha a escadaria de cima
      face(STAIR_FRAMES.coping, 'top', [[0, out, top(0)], [0, inn, top(0)], [1, inn, top(1)], [1, out, top(1)]], flat(STAIR_SHADE.cap));
      // a ponta de baixo da mureta
      face(ashlar, 'front', [[0, out, 0], [0, inn, 0], [0, inn, top(0)], [0, out, top(0)]], flat(STAIR_SHADE.wallEnd));
      // OS PILARES, embaixo e em cima: um bloco um nada mais largo e mais alto que a mureta — e um nada mais comprido
      // também, para FORA da escada. Com a face no mesmo plano da ponta da mureta e do espelho do primeiro degrau
      // (s = 0), as duas brigavam pela frente e o pé do pilar piscava (o autor viu).
      const wide = STAIR_POST.wide;
      const pOut = side === 0 ? -wide : 1 + wide;
      const pIn = side === 0 ? STAIR_WALL + wide : 1 - STAIR_WALL - wide;
      for (const [sa, sb, floor] of [[-wide, STAIR_POST.len, 0], [1 - STAIR_POST.len, 1 + wide, 1]] as const) {
        const hTop = floor + STAIR_PARAPET + STAIR_POST.rise;
        const hBot = floor === 0 ? 0 : 0.5;
        const sideFace = (t: number): void => face(ashlar, 'side', [[sa, t, hBot], [sb, t, hBot], [sb, t, hTop], [sa, t, hTop]], flat(STAIR_SHADE.post));
        const endFace = (s: number): void => face(ashlar, 'front', [[s, pOut, hBot], [s, pIn, hBot], [s, pIn, hTop], [s, pOut, hTop]], flat(STAIR_SHADE.postEnd));
        sideFace(pOut); // fora
        sideFace(pIn); // dentro
        endFace(sa); // de frente (o lado de baixo da escada)
        endFace(sb); // de trás
        face(STAIR_FRAMES.coping, 'top', [[sa, pOut, hTop], [sa, pIn, hTop], [sb, pIn, hTop], [sb, pOut, hTop]], flat(STAIR_SHADE.postCap));
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aUvBounds', new THREE.Float32BufferAttribute(bounds, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
};
