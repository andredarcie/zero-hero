import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { getWoodFences } from '@/game/world/WorldData';

import { PROP_TINT, TILESET as P, flushTextures, hash, texture, type Put } from './nature/kit';

/**
 * A CERCA DE MADEIRA (pedido do autor: o quintal do lenhador "cercado por uma cerca de madeira, bem bolada e com
 * pixel art que combine com tudo… cada lugar cada vez mais único"). Cada tile de cerca é um prop `woodFence` do
 * world.json — o editor põe e apaga um a um — e a cerca se LIGA sozinha aos vizinhos:
 *
 *   · o MOURÃO fica no meio do tile; os dois TRILHOS que correm de leste a oeste são desenhados em pé, no mesmo quadro
 *     do mourão (a câmera os vê de frente);
 *   · o trecho que corre de norte a sul é construído de verdade em 3D: as duas tábuas DEITADAS, cada uma na altura do
 *     seu trilho, do mourão de um tile ao do tile de baixo. Vista do alto, uma tábua no ar é exatamente isso;
 *   · a ponta de uma cerca (um vizinho só) é o PILAR DO PORTÃO: mais alto, de chapéu e pino — a passagem se vê de longe.
 *
 * A arte é a do tileset (16 px por tile, granulado, sem contorno, a paleta das cascas do bosque): veio escuro na
 * madeira, o topo cortado mais claro, um prego onde o trilho cruza o mourão, nó na tábua, um tufo de capim no pé, e a
 * linha preta de sombra de contato que as árvores do mapa também têm. Três variantes por hash do lugar: duas cercas
 * vizinhas nunca são gêmeas. Bloqueia pelo próprio prop (`at`), sem colisão pintada.
 */

const POST_H = 16;
const GATE_H = 21;
/** As linhas dos trilhos, contadas de baixo (a 0 é a sombra de contato): baixo 4-6, alto 9-11. */
const LOW_RAIL = [4, 5, 6];
const HIGH_RAIL = [9, 10, 11];
/** A face de cima de cada trilho, em tiles: a altura em que a tábua deitada do trecho norte-sul fica. */
const RAIL_TOPS = [(LOW_RAIL[2] + 1) / 16, (HIGH_RAIL[2] + 1) / 16];
const VARIANTS = 3;

/** O veio da madeira: um pixel aqui e ali mais fundo, sempre no mesmo lugar para a mesma variante. */
const grain = (x: number, y: number, v: number, base: string): string => (hash(x, y, 31 + v) < 0.2 ? P.barkDeep : base);

const paintUpright = (east: boolean, west: boolean, gate: boolean, v: number) => (put: Put): void => {
  const h = gate ? GATE_H : POST_H;
  const row = (r: number): number => h - 1 - r;
  const top = gate ? 17 : 14;
  // Os trilhos primeiro: o mourão passa por cima deles.
  const rail = (rows: readonly number[], from: number, to: number, seed: number): void => {
    for (let x = from; x <= to; x += 1) {
      put(x, row(rows[2]), hash(x, seed, 41 + v) < 0.16 ? P.sand : P.fur);
      put(x, row(rows[1]), grain(x, rows[1] + seed, v, P.bark));
      put(x, row(rows[0]), P.barkDk);
    }
  };
  const railSpans: Array<[number, number]> = [];
  if (west) railSpans.push([0, 6]);
  if (east) railSpans.push([9, 15]);
  for (const [a, b] of railSpans) {
    rail(LOW_RAIL, a, b, 1);
    rail(HIGH_RAIL, a, b, 2);
  }
  // O nó numa das tábuas (variante), longe do mourão.
  if (railSpans.length) {
    const [a, b] = railSpans[v % railSpans.length];
    const kx = a + 1 + Math.floor(hash(v, a, 43) * (b - a - 2));
    const kr = v % 2 ? HIGH_RAIL[1] : LOW_RAIL[1];
    put(kx, row(kr), P.barkDeep);
    put(kx + 1, row(kr), P.barkDk);
  }
  // O mourão: 4 px, o lado da luz mais claro, o da sombra mais escuro.
  for (let r = 1; r <= top; r += 1) {
    put(6, row(r), P.fur);
    put(7, row(r), grain(7, r, v, P.bark));
    put(8, row(r), grain(8, r, v, P.bark));
    put(9, row(r), P.barkDk);
  }
  // O topo cortado: a ponta clara da madeira.
  put(7, row(top), P.sand);
  put(8, row(top), P.ochre);
  if (gate) {
    // O PILAR DO PORTÃO: chapéu de tábua (mais largo que o mourão) e um pino em cima.
    for (let x = 5; x <= 10; x += 1) {
      put(x, row(top + 1), x === 5 ? P.fur : x === 10 ? P.barkDk : P.barkDeep);
      put(x, row(top + 2), x === 10 ? P.bark : P.fur);
    }
    put(7, row(top + 3), P.bark);
    put(8, row(top + 3), P.barkDk);
    // Uma faixa de corda no meio do pilar.
    for (let x = 6; x <= 9; x += 1) put(x, row(13), x === 9 ? P.ochre : P.sand);
  }
  // O prego onde o trilho cruza o mourão.
  if (east || west) {
    put(7, row(LOW_RAIL[1]), P.greyDk);
    put(8, row(HIGH_RAIL[1]), P.greyDk);
  }
  // A sombra de contato (como o pé das árvores do tileset) e um tufo de capim no pé, em duas das três variantes.
  for (let x = 5; x <= 10; x += 1) put(x, row(0), P.ink, x === 5 || x === 10 ? 0.5 : 1);
  if (v !== 1) {
    const side = v === 0 ? 5 : 10;
    put(side, row(1), P.olive);
    put(side, row(2), P.oliveDk);
    put(side + (side === 5 ? -1 : 1), row(1), P.oliveDk);
  }
};

/** A tábua deitada (o trecho norte-sul), vista de cima: 3 px de largura, um tile de comprimento. */
const paintFlatRail = (v: number) => (put: Put): void => {
  for (let y = 0; y < 16; y += 1) {
    put(0, y, hash(0, y, 51 + v) < 0.16 ? P.sand : P.fur);
    put(1, y, grain(1, y, v, P.bark));
    put(2, y, P.barkDk);
  }
};

const uprightKey = (east: boolean, west: boolean, gate: boolean, v: number): string =>
  `fence-${east ? 'e' : ''}${west ? 'w' : ''}${gate ? '-gate' : ''}-${v}`;
const flatKey = (v: number): string => `fence-flat-${v}`;

/** O ícone da cerca no editor: um mourão com os trilhos dos dois lados. */
export const fenceIconKey = uprightKey(true, true, false, 0);

let registered = false;
/** Desenha e registra os quadros da cerca (o jogo e o editor). */
export const registerFenceTextures = (): void => {
  if (registered) return;
  flushTextures();
  for (let v = 0; v < VARIANTS; v += 1) {
    for (const east of [false, true]) {
      for (const west of [false, true]) {
        for (const gate of [false, true]) {
          texture(uprightKey(east, west, gate, v), 16, gate ? GATE_H : POST_H, paintUpright(east, west, gate, v));
        }
      }
    }
    texture(flatKey(v), 3, 16, paintFlatRail(v));
  }
  registered = true;
};

export class WoodFence {
  private readonly tiles = new Set<string>();
  private readonly bodies: Billboard3D[] = [];

  public constructor() {
    registerFenceTextures();
    const fences = getWoodFences();
    for (const f of fences) this.tiles.add(`${f.worldX},${f.worldY}`);
    const has = (x: number, y: number): boolean => this.tiles.has(`${x},${y}`);
    const w3 = world3d();
    for (const f of fences) {
      const { worldX: x, worldY: y } = f;
      const n = has(x, y - 1);
      const e = has(x + 1, y);
      const s = has(x, y + 1);
      const w = has(x - 1, y);
      const gate = [n, e, s, w].filter(Boolean).length === 1;
      const v = Math.floor(hash(x, y, 47) * VARIANTS);
      this.bodies.push(
        w3.objects.addBillboard(uprightKey(e, w, gate, v), 0, { groundShadow: { rx: 0.16, rz: 0.08, alpha: 0.26 } })
          .setDisplaySize(1, (gate ? GATE_H : POST_H) / 16)
          .setPosition(x, y)
          .setTint(PROP_TINT),
      );
      // O trecho até o vizinho de baixo: as duas tábuas deitadas, cada uma na altura do seu trilho.
      if (s) {
        RAIL_TOPS.forEach((top, i) => {
          this.bodies.push(
            w3.objects.addBillboard(flatKey((v + i) % VARIANTS), 0, { flat: true })
              .setDisplaySize(3 / 16, 1)
              .setPosition(x, y + 0.5)
              .setElevation(top)
              .setTint(PROP_TINT),
          );
        });
      }
    }
  }

  /** Há cerca neste tile: ele bloqueia a passagem. */
  public at(x: number, y: number): boolean {
    return this.tiles.has(`${x},${y}`);
  }

  public destroy(): void {
    for (const b of this.bodies) b.destroy();
    this.bodies.length = 0;
  }
}
