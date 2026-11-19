import { profiler } from '@/game/debug/Profiler';
import * as Engine from '@/game/engine';
import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';
import { gustAt } from '@/game/runtime/wind';
import { biomeTreeWashAt } from '@/game/world/biomes';
import { getCoconutPalms } from '@/game/world/WorldData';

import { paint, TILESET as P, type Put } from './nature/kit';

/**
 * OS COQUEIROS DA PRAIA DO NORTE (pedido do autor, 2026-11-19: "árvores, coqueiros... tudo com alta qualidade de pixel
 * art"). São props do world.json (`coconutPalm`), como as árvores do bosque (objects/BigTrees): o editor põe, move e
 * apaga, e o pé de cada um bloqueia o tile pelo próprio prop, sem colisão pintada.
 *
 * O ESTILO É O DO TILESET, o mesmo das árvores do bosque: a paleta da casa (a oliva da folha, a ardósia da sombra, a
 * madeira do tronco), textura granulada (cada pixel sorteado entre dois ou três tons da faixa de luz em que está),
 * a luz do alto e da esquerda, sombra de ardósia no pé, nada de contorno. A densidade é a mesma: 16 px por tile.
 *
 * COMO É UM COQUEIRO, pixel a pixel:
 *   · O ESTIPE é fino, anelado (uma linha escura a cada três, as cicatrizes das folhas que caíram), mais grosso no pé,
 *     e nunca reto: ele faz uma curva suave, que aperta perto da copa.
 *   · A COPA é um leque de PALMAS que saem todas do mesmo ponto. Cada palma é um arco: sobe, abre e pende na ponta
 *     pelo próprio peso. Dela pendem os folíolos, em pente — é o pente que faz a palma ler como palma, e não como galho.
 *     As de cima pegam a luz; as de baixo, mais velhas, pendem junto do tronco, na sombra.
 *   · Os COCOS se juntam embaixo da copa, no alto do estipe.
 *
 * Quatro portes (o reto e alto, o torto para cada lado, o jovem) e três sementes de cada: dois coqueiros vizinhos
 * nunca são gêmeos. As palmas balançam com o vento, e mais depressa na rajada.
 */
export type PalmKind = 'tall' | 'left' | 'right' | 'young';
const KINDS: readonly PalmKind[] = ['tall', 'left', 'right', 'young'];

interface Shape {
  /** O desenho, em pixels. */
  w: number;
  h: number;
  /** Quanto o topo sai do prumo (px, + = para a direita), a altura do estipe e o comprimento da palma maior. */
  lean: number;
  height: number;
  reach: number;
  /** A espessura do estipe no pé e no alto (px). */
  thick: readonly [number, number];
}
const SHAPES: Readonly<Record<PalmKind, Shape>> = {
  tall: { w: 44, h: 62, lean: 3, height: 41, reach: 17, thick: [3, 2] },
  left: { w: 48, h: 56, lean: -10, height: 35, reach: 16, thick: [3, 2] },
  right: { w: 48, h: 56, lean: 10, height: 35, reach: 16, thick: [3, 2] },
  young: { w: 34, h: 38, lean: 2, height: 17, reach: 12, thick: [2, 2] },
};

const hash = (a: number, b: number, seed: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** As palmas de uma copa: o rumo em graus (0 = leste, -90 = para cima), o tamanho, o quanto pende e a luz que pega. */
const FRONDS: ReadonlyArray<{ a: number; l: number; droop: number; tone: number }> = [
  // as velhas, pendendo junto do tronco, na sombra (desenhadas primeiro: ficam atrás)
  { a: 152, l: 0.72, droop: 0.56, tone: 0.16 },
  { a: 28, l: 0.72, droop: 0.56, tone: 0.06 },
  // as do meio, abertas para os lados
  { a: -172, l: 1, droop: 0.44, tone: 0.56 },
  { a: -8, l: 1, droop: 0.44, tone: 0.34 },
  { a: -142, l: 0.96, droop: 0.34, tone: 0.76 },
  { a: -38, l: 0.96, droop: 0.34, tone: 0.5 },
  // as novas, no alto, na luz
  { a: -114, l: 0.86, droop: 0.24, tone: 0.96 },
  { a: -66, l: 0.86, droop: 0.24, tone: 0.72 },
  { a: -91, l: 0.6, droop: 0.1, tone: 0.9 },
];

/**
 * Uma palma: a nervura é uma curva (sai no rumo `ang`, abre e pende), e dela pendem os folíolos, mais longos no meio
 * da palma e curtos no pé e na ponta. O pente: nas colunas pares o folíolo é comprido, nas ímpares fica só a nervura
 * e um pixel. A luz cai de cima: a nervura e o primeiro pixel pegam a luz da palma; para baixo, o folíolo escurece.
 */
const frond = (put: Put, cx: number, cy: number, ang: number, len: number, droop: number, tone: number, seed: number, sway: number): void => {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const p1x = cx + ux * len * 0.55;
  const p1y = cy + uy * len * 0.55 - len * 0.12;
  const p2x = cx + ux * len * 0.98 + sway * (0.6 + 0.4 * Math.abs(ux));
  const p2y = cy + uy * len * 0.6 + len * droop;
  const steps = Math.ceil(len * 2.4);
  let lastX = NaN;
  let lastY = NaN;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = Math.round((1 - t) * (1 - t) * cx + 2 * (1 - t) * t * p1x + t * t * p2x);
    const y = Math.round((1 - t) * (1 - t) * cy + 2 * (1 - t) * t * p1y + t * t * p2y);
    if (x === lastX && y === lastY) continue;
    lastX = x;
    lastY = y;
    const long = Math.round(1 + 2.7 * Math.sin(Math.PI * Math.min(1, t * 1.04)) * (len / 16));
    const comb = (x & 1) === 0 ? long : Math.min(1, long);
    for (let d = -1; d <= comb; d += 1) {
      if (d === -1 && (t < 0.12 || hash(x, y, seed) > 0.5)) continue; // a aresta de cima é recortada
      const r = hash(x, y + d, seed + 3);
      const light = tone - Math.max(0, d) * 0.24 + (r - 0.5) * 0.36 + (d === -1 ? 0.12 : 0);
      const c = light > 0.78 ? P.moss : light > 0.4 ? P.leaf : light > 0.04 ? P.leafDk : P.slate;
      put(x, y + d, c);
    }
  }
};

/** O estipe: do pé ao alto, numa curva; anelado, o lado esquerdo na luz. Devolve o ponto de onde a copa sai. */
const stipe = (put: Put, s: Shape, footX: number, footY: number, seed: number): { x: number; y: number } => {
  let topX = footX;
  for (let y = footY; y >= footY - s.height; y -= 1) {
    const t = (footY - y) / s.height;
    const xc = footX + s.lean * t ** 1.7;
    topX = xc;
    const flare = footY - y < 2 ? 2 - (footY - y) : 0;
    const width = (t < 0.45 ? s.thick[0] : s.thick[1]) + flare;
    const x0 = Math.round(xc - width / 2);
    const ring = (footY - y) % 3 === 2;
    for (let k = 0; k < width; k += 1) {
      const lit = k < Math.ceil(width / 2);
      const r = hash(x0 + k, y, seed + 9);
      let c: string = lit ? (r < 0.8 ? P.fur : P.furDk) : (r < 0.72 ? P.furDk : P.barkDk);
      if (ring) c = lit ? P.furDk : P.barkDk;
      put(x0 + k, y, c);
    }
  }
  return { x: Math.round(topX), y: footY - s.height };
};

/** Um coqueiro inteiro, no quadro de vento `f` (0 parado, 1 as pontas levadas um pixel para leste). */
const paintPalm = (kind: PalmKind, variant: number, f: number): HTMLCanvasElement => {
  const s = SHAPES[kind];
  const seed = variant * 13 + KINDS.indexOf(kind) * 5 + 1;
  return paint(s.w, s.h, (put) => {
    const footX = Math.round(s.w / 2 - s.lean * 0.5);
    const footY = s.h - 1;
    // (Sem a barra de sombra pintada no pé que as árvores do bosque têm: na areia clara ela saía um traço preto
    // debaixo de cada coqueiro. Quem o prende ao chão é a sombra de contato e a silhueta que o sol deita.)
    const top = stipe(put, s, footX, footY, seed);
    const order = FRONDS.map((fr, i) => ({ ...fr, i }));
    const draw = (from: number, to: number): void => {
      for (const fr of order.slice(from, to)) {
        const jitter = (hash(fr.i, variant, seed) - 0.5) * 16;
        const len = s.reach * fr.l * (0.92 + hash(fr.i, variant, seed + 1) * 0.16);
        frond(put, top.x, top.y, ((fr.a + jitter) * Math.PI) / 180, len, fr.droop, fr.tone, seed + fr.i * 7, f);
      }
    };
    draw(0, 2);
    // os cocos, embaixo da copa (o jovem ainda não dá)
    if (kind !== 'young') {
      for (const [dx, dy] of [[-2, 1], [1, 2], [-1, 3]] as const) {
        put(top.x + dx, top.y + dy, P.bark);
        put(top.x + dx + 1, top.y + dy, P.barkDk);
        put(top.x + dx, top.y + dy + 1, P.barkDk);
        put(top.x + dx + 1, top.y + dy + 1, P.barkDeep);
      }
    }
    draw(2, order.length);
  });
};

const key = (kind: PalmKind, variant: number, f: number): string => `palm-${kind}-${variant}-${f}`;
/** A textura que o editor usa de ícone (o coqueiro alto, parado). */
export const palmIconKey = (): string => key('tall', 0, 0);
const VARIANTS = 3;

let registered = false;
/** Desenha e registra as texturas dos coqueiros (o jogo e o editor). */
export const registerPalmTextures = (): void => {
  if (registered) return;
  for (const kind of KINDS) {
    for (let v = 0; v < VARIANTS; v += 1) {
      for (let f = 0; f < 2; f += 1) {
        const tex = new THREE.CanvasTexture(paintPalm(kind, v, f));
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        registerTexture3D(key(kind, v, f), tex);
      }
    }
  }
  registered = true;
};

/** Os coqueiros do mapa agora. */
export const coconutPalms = (): Array<{ x: number; y: number }> => getCoconutPalms().map((p) => ({ x: p.worldX, y: p.worldY }));

/** O porte de cada coqueiro sai do lugar (e não da ordem no mapa): apagar um não troca a cara dos outros. */
export const palmKindAt = (x: number, y: number): PalmKind => {
  const r = hash(x, y, 17);
  return r < 0.34 ? 'tall' : r < 0.56 ? 'left' : r < 0.78 ? 'right' : 'young';
};

interface Palm { x: number; y: number; kind: PalmKind; variant: number; phase: number; bb: Billboard3D }

/** Antes da silhueta do herói, como as árvores do bosque (BigTrees.TREE_RENDER_ORDER): ele aparece por trás dela. */
const PALM_RENDER_ORDER = -2;
/** O balanço das palmas: de quanto em quanto tempo o quadro troca, na brisa e no auge da rajada (ms). */
const SWAY_MS = 1100;
const GUST_SWAY_MS = 420;

export class CoconutPalms {
  private readonly palms: Palm[] = [];
  private readonly feet = new Set<string>();
  private clock = 0;

  public constructor(private readonly scene: Engine.Scene) {
    registerPalmTextures();
    const w3 = world3d();
    for (const { x, y } of coconutPalms()) {
      const kind = palmKindAt(x, y);
      const variant = Math.floor(hash(x, y, 5) * VARIANTS);
      const s = SHAPES[kind];
      // O pé do desenho é o pé do tile: o coqueiro torto tem o pé fora do meio do quadro, e o quadro anda o contrário.
      const bb = w3.objects.addBillboard(key(kind, variant, 0), 0, {
        renderOrder: PALM_RENDER_ORDER, groundShadow: { rx: 0.3, rz: 0.16, alpha: 0.3 },
      })
        .setDisplaySize(s.w / 16, s.h / 16)
        .setPosition(x + (s.lean * 0.5) / 16, y);
      const [r, g, b] = biomeTreeWashAt(x, y);
      (bb.mesh.material as THREE.MeshLambertMaterial).color.setRGB(r, g, b);
      this.palms.push({ x, y, kind, variant, phase: hash(x, y, 2) * 4, bb });
      this.feet.add(`${x},${y}`);
    }
    scene.events.on(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
  }

  /** Há um coqueiro neste tile: o pé dele bloqueia a passagem. */
  public at(x: number, y: number): boolean {
    return this.feet.has(`${x},${y}`);
  }

  /** Os coqueiros (a janela do playtest, e os bichos da praia). */
  public get list(): ReadonlyArray<{ x: number; y: number; kind: PalmKind }> {
    return this.palms;
  }

  private onFrame(): void {
    profiler.begin('life.palms');
    // Na rajada do vale as palmas batem mais depressa (a mesma rajada que deita o capim e sacode a mata). O relógio
    // anda mais rápido, em vez de o período mudar: mudar o período no meio do balanço faria o quadro pular.
    const period = SWAY_MS + (GUST_SWAY_MS - SWAY_MS) * gustAt(world3d().elapsedMs);
    this.clock += this.scene.game.loop.delta / period;
    for (const p of this.palms) {
      const f = Math.floor(this.clock + p.phase) % 2;
      p.bb.setTexture(key(p.kind, p.variant, f));
    }
    profiler.end('life.palms');
  }

  public destroy(): void {
    this.scene.events.off(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
    for (const p of this.palms) p.bb.destroy();
    this.palms.length = 0;
    this.feet.clear();
  }
}
