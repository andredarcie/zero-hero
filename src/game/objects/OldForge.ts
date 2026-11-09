import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { PropKind } from '@/game/world/worldSchema';
import { getForgeProps, getFurnaces } from '@/game/world/WorldData';

import { PROP_TINT, TILESET as P, flushTextures, hash, texture, type Put } from './nature/kit';

/**
 * A FORJA VELHA (pedido do autor: a Thea caiu do céu e não tem casa, então o forno e a bigorna ao lado dela "tem que
 * ser algo de alguém, que ficou para trás antes"). Ali morou um FERREIRO, muito antes de tudo, e foi embora. Da
 * oficina sobrou:
 *
 *   · o pedaço de parede com a boca da lareira e a placa (o achado `smithy`, objects/ValleyFinds — esse se lê);
 *   · `forgeRubble`  a CHAMINÉ CAÍDA: pedras tombadas e uma viga queimada saindo do monte;
 *   · `forgeRack`    o SUPORTE DE FERRAMENTAS: tenaz, martelo e ferraduras penduradas, comidos de ferrugem;
 *   · o PISO DE LAJES da oficina debaixo do forno e da bigorna — rachado, com capim nas juntas e lajes faltando.
 *
 * A Thea não trouxe nada disso: caiu do lado, e usa o que ficou. Arte do tileset (16 px por tile, granulado, sem
 * contorno), como a cerca e o quintal do lenhador. Bloqueia pelo próprio prop (`at`); o piso se pisa.
 */
export const FORGE_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(['forgeRubble', 'forgeRack']);
type ForgeKind = 'forgeRubble' | 'forgeRack';

const SIZES: Readonly<Record<ForgeKind, { w: number; h: number }>> = {
  forgeRubble: { w: 16, h: 12 },
  forgeRack: { w: 16, h: 17 },
};

/** Uma pedra tombada: um bloco com o alto aceso, a sombra embaixo e o veio. */
const stone = (put: Put, x: number, y: number, w: number, h: number, seed: number): void => {
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const corner = (i === 0 || i === w - 1) && (j === 0 || j === h - 1);
      if (corner) continue;
      const c = j === 0 ? P.pale : j === h - 1 ? P.slate : i === w - 1 ? P.stoneDk : hash(x + i, y + j, seed) < 0.22 ? P.stoneDk : P.stone;
      put(x + i, y + j, c);
    }
  }
};

const paintRubble = (put: Put): void => {
  const H = 12;
  // A viga queimada atravessando o monte (atrás das pedras).
  for (let i = 0; i < 11; i += 1) {
    put(3 + i, 2 + Math.floor(i / 3), i % 4 === 0 ? P.barkDeep : P.night);
    put(3 + i, 3 + Math.floor(i / 3), P.ink);
  }
  put(2, 2, P.ochre); put(2, 3, P.barkDeep); // a ponta que não queimou
  // As pedras da chaminé, tombadas umas sobre as outras.
  stone(put, 1, 6, 5, 4, 71);
  stone(put, 9, 6, 6, 4, 72);
  stone(put, 5, 4, 5, 4, 73);
  stone(put, 11, 3, 3, 3, 74);
  stone(put, 5, 8, 4, 3, 75);
  // Fuligem numa pedra (era a de dentro da chaminé) e musgo nas de cima.
  put(6, 5, P.slateDk); put(7, 5, P.slateDk); put(7, 6, P.slate);
  for (const [x, y, c] of [[5, 4, P.moss], [6, 4, P.leaf], [12, 3, P.moss], [1, 6, P.leaf], [2, 6, P.moss]] as const) put(x, y, c);
  for (let x = 0; x <= 15; x += 1) put(x, H - 1, P.ink, x < 1 || x > 14 ? 0.5 : 1);
};

const paintRack = (put: Put): void => {
  const H = 17;
  // Os dois montantes e a travessa.
  for (let y = 1; y <= H - 2; y += 1) {
    put(1, y, P.fur); put(2, y, y % 5 === 2 ? P.barkDeep : P.barkDk);
    put(13, y, P.fur); put(14, y, P.barkDk);
  }
  for (let x = 0; x <= 15; x += 1) { put(x, 1, P.fur); put(x, 2, x % 6 === 4 ? P.barkDeep : P.bark); }
  put(0, 1, P.sand); put(15, 1, P.sand);
  // Os ganchos.
  for (const x of [4, 8, 11]) { put(x, 3, P.greyDk); }
  // A TENAZ: duas hastes compridas que se cruzam no pino, as bocas embaixo.
  for (let y = 4; y <= 12; y += 1) { put(4 - (y > 9 ? 1 : 0), y, y > 9 ? P.rust : P.greyDk); put(5 + (y > 9 ? 1 : 0), y, y > 9 ? P.rustDk : P.grey); }
  put(4, 7, P.pale);
  // O MARTELO: cabo de madeira e a cabeça enferrujada.
  for (let y = 4; y <= 10; y += 1) put(8, y, y === 4 ? P.greyDk : P.fur);
  for (let x = 6; x <= 10; x += 1) { put(x, 11, x === 6 ? P.grey : P.rust); put(x, 12, P.rustDk); }
  // A FERRADURA pendurada pelo gancho: um U de ferrugem.
  for (const [x, y] of [[10, 4], [12, 4], [10, 5], [12, 5], [10, 6], [12, 6]] as const) put(x, y, P.rust);
  put(11, 7, P.rustDk); put(10, 7, P.rustDk); put(12, 7, P.rustDk);
  put(10, 4, P.ochre);
  // Capim subindo pelos pés (faz tempo que ninguém mexe nisso).
  for (const [x, y, c] of [[0, H - 3, P.olive], [1, H - 4, P.oliveDk], [3, H - 3, P.olive], [12, H - 3, P.olive], [15, H - 3, P.oliveDk], [14, H - 4, P.olive]] as const) put(x, y, c);
  for (let x = 0; x <= 15; x += 1) if (x <= 3 || x >= 12) put(x, H - 1, P.ink, x === 0 || x === 15 ? 0.5 : 1);
};

/** O PISO DE LAJES da oficina (deitado): 52×44 px = 3,25 × 2,75 tiles. */
const FLOOR_W = 52;
const FLOOR_H = 44;
const paintFloor = (put: Put): void => {
  // Lajes irregulares: uma grade torta de células, cada uma uma pedra (ou nenhuma: faltando, capim no lugar).
  const cell = (x: number, y: number): [number, number] => {
    const jx = Math.floor((x + Math.floor(hash(Math.floor(y / 9), 0, 81) * 6)) / 10);
    return [jx, Math.floor(y / 9)];
  };
  for (let y = 0; y < FLOOR_H; y += 1) {
    for (let x = 0; x < FLOOR_W; x += 1) {
      // A borda do piso some aos poucos (oval gasto pelo tempo).
      const d = Math.hypot((x - FLOOR_W / 2) / (FLOOR_W / 2), (y - FLOOR_H / 2) / (FLOOR_H / 2));
      const [cx, cy] = cell(x, y);
      const gone = hash(cx, cy, 82) < 0.12 + Math.max(0, d - 0.55) * 1.6;
      if (gone) continue;
      const [lx] = cell(x - 1, y);
      const joint = lx !== cx || y % 9 === 0;
      if (joint) {
        put(x, y, hash(x, y, 83) < 0.45 ? P.olive : P.slate);
        continue;
      }
      const tone = hash(cx, cy, 84);
      const base = tone < 0.33 ? P.stone : tone < 0.66 ? P.stoneDk : P.greyDk;
      const r = hash(x, y, 85);
      // Rachaduras e a fuligem velha perto de onde ficava o fogo.
      const soot = Math.hypot(x - 34, y - 14) < 9 && r < 0.35;
      put(x, y, soot ? P.slate : r < 0.07 ? P.slate : r < 0.12 ? P.pale : base);
    }
  }
};

const key = (kind: ForgeKind): string => `forge-${kind}`;
export const forgeIconKey = (kind: PropKind): string => key(kind as ForgeKind);
const FLOOR_KEY = 'forge-floor';

let registered = false;
/** Desenha e registra os quadros da forja velha (o jogo e o editor). */
export const registerForgeTextures = (): void => {
  if (registered) return;
  flushTextures();
  texture(key('forgeRubble'), SIZES.forgeRubble.w, SIZES.forgeRubble.h, paintRubble);
  texture(key('forgeRack'), SIZES.forgeRack.w, SIZES.forgeRack.h, paintRack);
  texture(FLOOR_KEY, FLOOR_W, FLOOR_H, paintFloor);
  registered = true;
};

export class OldForge {
  private readonly tiles = new Set<string>();
  private readonly bodies: Billboard3D[] = [];

  public constructor() {
    registerForgeTextures();
    const w3 = world3d();
    const pieces = getForgeProps();
    for (const p of pieces) {
      const kind = p.type as ForgeKind;
      this.tiles.add(`${p.worldX},${p.worldY}`);
      const { w, h } = SIZES[kind];
      this.bodies.push(
        w3.objects.addBillboard(key(kind), 0, { groundShadow: { rx: 0.45, rz: 0.16, alpha: 0.28 } })
          .setDisplaySize(w / 16, h / 16)
          .setPosition(p.worldX, p.worldY)
          .setTint(PROP_TINT),
      );
    }
    // O piso da oficina: debaixo de cada forno que tem resto da forja perto (o forno é o coração dela).
    for (const f of getFurnaces()) {
      if (!pieces.some((p) => Math.hypot(p.worldX - f.worldX, p.worldY - f.worldY) <= 4)) continue;
      this.bodies.push(
        w3.objects.addBillboard(FLOOR_KEY, 0, { flat: true, flatY: 0.012, depthWrite: false, alphaTest: 0.05, depthLayer: 'ground' })
          .setDisplaySize(FLOOR_W / 16, FLOOR_H / 16)
          // O fogo ficava no forno; a bigorna, a sudoeste dele: o piso pega os dois.
          .setPosition(f.worldX - 0.45, f.worldY + 0.55)
          .setTint(PROP_TINT),
      );
    }
  }

  /** Há um resto da forja neste tile: ele bloqueia a passagem. */
  public at(x: number, y: number): boolean {
    return this.tiles.has(`${x},${y}`);
  }

  public destroy(): void {
    for (const b of this.bodies) b.destroy();
    this.bodies.length = 0;
  }
}
