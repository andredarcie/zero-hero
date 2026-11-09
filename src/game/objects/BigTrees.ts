import { profiler } from '@/game/debug/Profiler';
import * as Engine from '@/game/engine';
import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';
import { biomeTreeTintAt } from '@/game/world/biomes';
import { getBosqueTrees } from '@/game/world/WorldData';
import { createCanvas } from '@/game/platform/platform';

/**
 * O BOSQUE (pedido do autor: "árvores grandes e variadas", para o vale ter cara de floresta). Uma mata de verdade
 * não é feita de árvores iguais: tem as VELHAS, de tronco grosso e copa enorme, as JOVENS, finas, e as que já CAÍRAM.
 *
 * O ESTILO É O DO TILESET (forest_tile_set.png), e não um novo — o autor: "elas não seguem cores e estilos das árvores
 * já existentes". As regras, tiradas pixel a pixel da árvore antiga (quadros 73/74) e do pinheiro (4):
 *   · A PALETA do tileset, e só ela: folha #626439 / #4d4f2c, ardósia #3a3f3f / #272b2d nas sombras da copa, o musgo
 *     claro #8a8d49 só nos fios pendurados e em poucos toques, tronco #815938 / #63452c, sombra preta no pé.
 *   · TEXTURA GRANULADA: cada pixel sorteado entre 2 ou 3 tons da faixa (topo, miolo, fundo da copa). Nada de degradê
 *     suave nem de contorno.
 *   · A COPA é um domo de topo recortado; embaixo, a ardósia domina; da borda de baixo pendem fios de musgo.
 *   · O TRONCO é de colunas claras e escuras misturadas e ABRE EM RAÍZES separadas por vãos; embaixo, 2 linhas de
 *     preto, a sombra de contato que o tile também desenha.
 *   · A COR DO BIOMA no material (`biomeTreeTintAt`), igual às árvores do mapa — e não o tom das peças de cenário.
 * A densidade é a mesma (16 px por tile): uma árvore grande é uma árvore do tileset com MAIS pixels, não pixels maiores.
 *
 * As copas balançam com o vento (2 quadros, cada árvore no seu tempo) e ficam translúcidas quando o herói passa por
 * trás delas.
 *
 * ONDE ficam é o MAPA que diz: são props do world.json (`oakTree`, `birchTree`, `youngOak`, `fallenLog`), que o editor
 * põe, move e apaga. O pé de cada uma bloqueia pelo próprio prop (`at`), sem colisão pintada — apagou a árvore, o
 * chão fica livre junto. scripts/bosque.mjs confere o que estiver no mapa (chão plano, nenhuma árvore do tileset
 * embaixo, nenhum caminho fechado).
 */
export type TreeKind = 'oak' | 'birch' | 'sapling' | 'log';
const KIND_OF_PROP: Readonly<Record<string, TreeKind>> = { oakTree: 'oak', birchTree: 'birch', youngOak: 'sapling', fallenLog: 'log' };

/** As árvores do bosque no mapa agora. */
export const bosqueTrees = (): Array<{ kind: TreeKind; x: number; y: number }> =>
  getBosqueTrees().map((p) => ({ kind: KIND_OF_PROP[p.type], x: p.worldX, y: p.worldY }));

/** Os tiles que uma árvore ocupa: o pé; o tronco caído deita em dois (x e x+1). */
export const treeFootprint = (t: { kind: TreeKind; x: number; y: number }): Array<{ x: number; y: number }> =>
  (t.kind === 'log' ? [{ x: t.x, y: t.y }, { x: t.x + 1, y: t.y }] : [{ x: t.x, y: t.y }]);

/** O tamanho de cada desenho, em pixels (16 por tile). A câmera é de cima: de uma árvore se vê sobretudo a copa. */
const SIZE: Record<TreeKind, { w: number; h: number }> = {
  oak: { w: 44, h: 44 },
  birch: { w: 18, h: 28 },
  sapling: { w: 16, h: 20 },
  log: { w: 32, h: 14 },
};

// ── A paleta do tileset ─────────────────────────────────────────────────────────────────────
const MOSS = '#8a8d49';
const LEAF = '#626439';
const LEAF_DK = '#4d4f2c';
const SLATE = '#3a3f3f';
const SLATE_DK = '#272b2d';
const BARK = '#815938';
const BARK_DK = '#63452c';
const BLACK = '#000000';
/**
 * Do próprio tileset: o cinza das pedras (a casca da bétula — o branco puro virava amarelo-gema com a cor do bioma
 * dos campos) e os tons de osso das outras peças (os cogumelos, o miolo do tronco cortado).
 */
const BIRCH_BARK = '#8e897d';
const BIRCH_BARK_DK = '#7b776d';
const BONE = '#e3dad1';
const BONE_DK = '#d4c2b1';
const RING = '#826841';

const hash = (a: number, b: number, seed: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Sorteia um tom pelos pesos (a textura granulada do tileset). */
const pick = (r: number, choices: ReadonlyArray<readonly [string, number]>): string => {
  let acc = 0;
  for (const [c, w] of choices) { acc += w; if (r < acc) return c; }
  return choices[choices.length - 1][0];
};

type Put = (x: number, y: number, color: string) => void;
const canvas = (w: number, h: number, paint: (put: Put) => void): HTMLCanvasElement => {
  const c = createCanvas();
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(w, h);
  const put: Put = (x, y, color) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    img.data[i] = parseInt(color.slice(1, 3), 16);
    img.data[i + 1] = parseInt(color.slice(3, 5), 16);
    img.data[i + 2] = parseInt(color.slice(5, 7), 16);
    img.data[i + 3] = 255;
  };
  paint(put);
  ctx.putImageData(img, 0, 0);
  return c;
};

/**
 * A COPA no estilo do tileset: a máscara é a união das `bumps` (círculos), com o topo recortado; cada pixel é sorteado
 * pela faixa em que está — o topo de cada bolota em folha, o miolo em folha escura salpicada de ardósia, o fundo da
 * copa em ardósia — e da borda de baixo pendem fios de musgo. `light` puxa a copa para a folha (as árvores jovens,
 * mais ralas e mais claras).
 */
const crown = (put: Put, w: number, h: number, bumps: ReadonlyArray<readonly [number, number, number]>, seed: number, light = 0, drips = true): void => {
  const inside = (x: number, y: number): boolean => bumps.some(([cx, cy, r]) => Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.1) <= r);
  for (let x = 0; x < w; x += 1) {
    let y0 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y += 1) {
      if (!inside(x, y)) continue;
      if (y0 < 0) y0 = y;
      y1 = y;
    }
    if (y0 < 0) continue;
    for (let y = y0; y <= y1; y += 1) {
      if (!inside(x, y)) continue;
      const r = hash(x, y, seed);
      const fromBottom = y1 - y;
      // O topo de cada bolota (sem outra logo acima): folha, como a primeira linha do tile.
      const onTop = y === y0 || !inside(x, y - 2);
      let c: string;
      if (onTop) c = pick(r, [[LEAF, 0.7 + light * 0.2], [LEAF_DK, 0.3]]);
      else if (fromBottom < 3) c = pick(r, [[SLATE, 0.4 - light * 0.2], [SLATE_DK, 0.25 - light * 0.15], [LEAF_DK, 0.35]]);
      else c = pick(r, [[LEAF_DK, 0.45], [LEAF, 0.2 + light * 0.3], [SLATE, 0.25 - light * 0.15], [SLATE_DK, 0.1]]);
      put(x, y, c);
    }
    // Os fios de musgo pendurados da borda de baixo, de 2 a 3 px, espaçados.
    if (drips && hash(x, 0, seed + 3) < 0.2 && x > 0 && x < w - 1) {
      const len = 2 + Math.floor(hash(x, 1, seed + 3) * 2);
      for (let k = 1; k <= len; k += 1) put(x, y1 + k, MOSS);
    }
  }
};

/** Um tronco de colunas claras e escuras misturadas, de `y0` a `y1`, com meia-largura `half(y)`. */
const trunk = (put: Put, cx: number, y0: number, y1: number, half: (y: number) => number, seed: number): void => {
  for (let y = y0; y <= y1; y += 1) {
    const hw = half(y);
    for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x += 1) {
      // As colunas: o tile alterna o tom claro e o escuro quase por coluna, com um pouco de ruído.
      const col = (x + Math.floor(y / 3)) % 2 === 0;
      put(x, y, hash(x, y, seed) < (col ? 0.75 : 0.35) ? BARK : BARK_DK);
    }
  }
};

/** As raízes: pernas diagonais de 2 px que abrem do pé do tronco, com vãos entre elas (como nos quadros 73/74). */
const roots = (put: Put, cx: number, y0: number, legs: ReadonlyArray<readonly [number, number]>, seed: number): void => {
  legs.forEach(([dx, len], i) => {
    for (let k = 0; k < len; k += 1) {
      const x = cx + dx * ((k + 1) / len) + (dx < 0 ? -1 : 0);
      const y = y0 + k;
      put(x, y, hash(i, k, seed) < 0.5 ? BARK : BARK_DK);
      put(x + (dx < 0 ? 1 : -1), y, hash(k, i, seed) < 0.5 ? BARK_DK : BARK);
    }
  });
};

/** A sombra de contato do tile: 2 linhas de preto sob o pé. */
const shadow = (put: Put, cx: number, y: number, half: number): void => {
  for (let x = Math.floor(cx - half); x < Math.ceil(cx + half); x += 1) put(x, y, BLACK);
  for (let x = Math.floor(cx - half * 0.65); x < Math.ceil(cx + half * 0.65); x += 1) put(x, y + 1, BLACK);
};

/** O CARVALHO VELHO, quadro de vento `f`: a árvore antiga do tileset (73/74), crescida. 44×44. */
const paintOak = (f: number, seed: number): HTMLCanvasElement => canvas(44, 44, (put) => {
  const cx = 22;
  // A sombra primeiro (as raízes pisam nela), o tronco grosso com o oco preto, e as raízes abrindo embaixo.
  shadow(put, cx, 42, 13);
  trunk(put, cx, 24, 37, (y) => 4 + (y < 27 ? (27 - y) * 0.5 : 0) + (y > 34 ? (y - 34) * 0.6 : 0), seed);
  for (const [x, y] of [[21, 31], [21, 32], [22, 32]] as const) put(x, y, BLACK);
  roots(put, cx, 37, [[-9, 5], [-4, 5], [3, 5], [8, 5]], seed);
  // A copa: bolotas grandes, as de cima mexidas pelo vento no quadro 1.
  const s = f ? 1 : 0;
  crown(put, 44, 44, [
    [22 + s, 8, 9], [11 + s, 11, 8], [33 + s, 11, 8],
    [6, 19, 6.5], [38, 19, 6.5],
    [15, 19, 9], [29, 19, 9], [22, 22, 8],
  ], seed);
});

/** A BÉTULA jovem: tronco claro com as marcas escuras, copa rala e mais clara. 18×28. */
const paintBirch = (f: number, seed: number): HTMLCanvasElement => canvas(18, 28, (put) => {
  const cx = 9;
  shadow(put, cx, 25, 4);
  for (let y = 9; y < 25; y += 1) {
    const lean = Math.round(Math.sin(y * 0.18 + seed) * 0.6);
    for (let x = cx - 1 + lean; x <= cx + lean; x += 1) {
      put(x, y, hash(Math.round(y / 2), x, seed + 5) < 0.25 ? SLATE : x === cx + lean ? BIRCH_BARK_DK : BIRCH_BARK);
    }
  }
  const s = f ? 1 : 0;
  crown(put, 18, 28, [[9 + s, 5, 4.5], [5, 9, 4], [13 + s, 9, 4], [9, 12, 4]], seed, 0.6, false);
});

/** O CARVALHINHO jovem: a árvore do tileset em ponto pequeno. 16×20. */
const paintSapling = (f: number, seed: number): HTMLCanvasElement => canvas(16, 20, (put) => {
  const cx = 8;
  shadow(put, cx, 18, 4);
  trunk(put, cx, 11, 16, () => 1, seed);
  roots(put, cx, 16, [[-3, 2], [2, 2]], seed);
  const s = f ? 1 : 0;
  crown(put, 16, 20, [[8 + s, 5, 4.5], [4, 8, 3.5], [12, 8, 3.5], [8, 9, 4]], seed, 0.3);
});

/** O TRONCO CAÍDO: deitado, a ponta cortada com os anéis, musgo por cima, e cogumelos claros. 32×14. */
const paintLog = (seed: number): HTMLCanvasElement => canvas(32, 14, (put) => {
  const cy = 7;
  for (let x = 3; x < 31; x += 1) put(x, 12, BLACK);
  for (let x = 6; x < 28; x += 1) put(x, 13, BLACK);
  for (let x = 4; x < 31; x += 1) {
    for (let y = cy - 3; y <= cy + 3; y += 1) {
      const e = y - cy;
      let c = (x + Math.floor(e / 2)) % 2 === 0 ? BARK : BARK_DK;
      if (e >= 2) c = hash(x, y, seed) < 0.6 ? SLATE : BARK_DK;
      // O musgo por cima, onde a chuva cai.
      if (e <= -2 && hash(x, y, seed + 1) < 0.65) c = hash(x, y, seed + 2) < 0.4 ? MOSS : LEAF;
      put(x, y, c);
    }
  }
  // A ponta cortada, à esquerda: os anéis da idade.
  for (let y = cy - 3; y <= cy + 3; y += 1) {
    for (let x = 1; x <= 5; x += 1) {
      const d = Math.hypot((x + 0.5 - 3.5) / 2.4, (y + 0.5 - cy - 0.5) / 3.6);
      if (d > 1) continue;
      put(x, y, d > 0.8 ? BARK_DK : Math.round(d * 4) % 2 ? RING : BONE_DK);
    }
  }
  // Os cogumelos claros no flanco, e o galho quebrado.
  for (const [x, y] of [[13, 10], [14, 10], [22, 10]] as const) { put(x, y, BONE); put(x, y + 1, BONE_DK); }
  for (let k = 0; k < 4; k += 1) put(20 + Math.floor(k / 2), 3 - k, k % 2 ? BARK_DK : BARK);
});

const key = (kind: TreeKind, variant: number, f: number): string => `bosque-${kind}-${variant}-${f}`;
/** A textura de cada espécie que o editor usa de ícone (a primeira variante, parada). */
export const bosqueIconKey = (kind: TreeKind): string => key(kind, 0, 0);
/** Variantes de cada espécie (a semente muda a textura e os fios): árvores vizinhas nunca são gêmeas. */
const VARIANTS = 3;

let registered = false;
/** Desenha e registra as texturas do bosque (o jogo e o editor). */
export const registerBosqueTextures = (): void => register();
const register = (): void => {
  if (registered) return;
  const add = (k: string, c: HTMLCanvasElement): void => {
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    registerTexture3D(k, tex);
  };
  for (let v = 0; v < VARIANTS; v += 1) {
    for (let f = 0; f < 2; f += 1) {
      add(key('oak', v, f), paintOak(f, v + 1));
      add(key('birch', v, f), paintBirch(f, v + 1));
      add(key('sapling', v, f), paintSapling(f, v + 1));
    }
    add(key('log', v, 0), paintLog(v + 1));
  }
  registered = true;
};

interface Tree { kind: TreeKind; x: number; y: number; bb: Billboard3D; variant: number; phase: number; alpha: number }

export class BigTrees {
  private readonly trees: Tree[] = [];
  private clock = 0;

  public constructor(private readonly scene: Engine.Scene, private readonly heroAt: () => { x: number; y: number }) {
    register();
    const w3 = world3d();
    bosqueTrees().forEach((t) => {
      const { w, h } = SIZE[t.kind];
      // A variante sai do lugar (e não da ordem no mapa): apagar uma árvore não troca a cara das outras.
      const variant = Math.floor(hash(t.x, t.y, 5) * VARIANTS);
      const bb = w3.objects.addBillboard(key(t.kind, variant, 0), 0, {})
        .setDisplaySize(w / 16, h / 16)
        // O tronco caído deita em dois tiles: o meio dele fica entre x e x+1.
        .setPosition(t.kind === 'log' ? t.x + 0.5 : t.x, t.y);
      // A cor do bioma, como nas árvores do mapa (World3D a põe no vértice; aqui vai no material, que aceita > 1).
      const [r, g, b] = biomeTreeTintAt(t.x, t.y);
      (bb.mesh.material as THREE.MeshLambertMaterial).color.setRGB(r, g, b);
      this.trees.push({ ...t, bb, variant, phase: hash(t.x, t.y, 2) * 4000, alpha: 1 });
    });
    scene.events.on(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
  }

  /** Há uma árvore neste tile (o pé dela, ou um dos dois tiles do tronco caído): ele bloqueia a passagem. */
  public at(x: number, y: number): boolean {
    return this.trees.some((t) => treeFootprint(t).some((p) => p.x === x && p.y === y));
  }

  /** As árvores (a janela do playtest). */
  public get list(): ReadonlyArray<{ kind: TreeKind; x: number; y: number; alpha: number }> {
    return this.trees.map((t) => ({ kind: t.kind, x: t.x, y: t.y, alpha: t.alpha }));
  }

  /** O quadro, medido (debug/Profiler: seção `life.trees`; desligado, não custa nada). */
  private onFrame(): void {
    profiler.begin('life.trees');
    this.frameTick();
    profiler.end('life.trees');
  }

  private frameTick(): void {
    const delta = this.scene.game.loop.delta;
    this.clock += delta;
    const hero = this.heroAt();
    for (const t of this.trees) {
      if (t.kind === 'log') continue;
      // O vento: cada árvore no seu tempo, a copa indo e voltando devagar.
      const f = Math.floor((this.clock + t.phase) / 1300) % 2;
      t.bb.setTexture(key(t.kind, t.variant, f));
      // O herói atrás da copa (ao norte do pé, debaixo dela na tela): a copa fica translúcida para não escondê-lo.
      const half = t.kind === 'oak' ? 1.4 : 0.6;
      const tall = t.kind === 'oak' ? 2.4 : 1.4;
      const behind = hero.y < t.y && hero.y >= t.y - tall && Math.abs(hero.x - t.x) <= half;
      const want = behind ? 0.42 : 1;
      t.alpha += (want - t.alpha) * Math.min(1, delta / 160);
      t.bb.setAlpha(t.alpha);
    }
  }

  public destroy(): void {
    this.scene.events.off(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
    for (const t of this.trees) t.bb.destroy();
    this.trees.length = 0;
  }
}
