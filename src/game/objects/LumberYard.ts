import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { PropKind } from '@/game/world/worldSchema';
import { getYardProps } from '@/game/world/WorldData';

import { PROP_TINT, TILESET as P, flushTextures, hash, texture, type Put } from './nature/kit';

/**
 * O QUINTAL DO LENHADOR (pedido do autor: "adicione mais coisas pra tornar o lugar que o lenhador mora mais único").
 * Dentro da cerca de madeira (objects/WoodFence), o que só a casa de quem vive de lenha tem:
 *
 *   · `woodpile`     a PILHA DE LENHA: toras empilhadas de ponta, o corte à mostra (anéis), estacas segurando dos lados;
 *   · `sawhorse`     o CAVALETE com uma tora deitada e a serra de arco parada no meio do corte;
 *   · `stump`        um TOCO de árvore cortada, raízes abrindo no chão;
 *   · `axeStump`     o toco com o MACHADO cravado (o do dia a dia: o da quest é outro, e esse ninguém tira);
 *   · `wheelbarrow`  o CARRINHO DE MÃO carregado de lenha;
 *   · `yardSign`     a PLACA no portão, com um machado queimado na tábua.
 *
 * Em volta do cavalete e dos tocos, SERRAGEM e lascas no chão (um decalque deitado, que se pisa).
 *
 * Tudo prop do world.json (o editor põe e apaga; scripts/quintal-do-lenhador.mjs monta o quintal), na arte do tileset:
 * 16 px por tile, as cores das cascas do bosque e da cerca, granulado, sem contorno, a linha preta de contato no pé.
 * Bloqueia pelo próprio prop (`at`).
 */
export const YARD_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(['woodpile', 'sawhorse', 'stump', 'axeStump', 'wheelbarrow', 'yardSign']);
type YardKind = 'woodpile' | 'sawhorse' | 'stump' | 'axeStump' | 'wheelbarrow' | 'yardSign';

/** O veio da madeira (o mesmo da cerca): um pixel aqui e ali mais fundo. */
const grain = (x: number, y: number, seed: number, base: string): string => (hash(x, y, seed) < 0.2 ? P.barkDeep : base);

/** A ponta cortada de uma tora (5×5): casca na borda, os anéis claros, o miolo. `old` = madeira mais seca, mais escura. */
const logEnd = (put: Put, x: number, y: number, old: boolean): void => {
  const rows = ['.DBD.', 'DFSFD', 'BSOSB', 'DFSFD', '.DBD.'];
  const c: Record<string, string> = { D: P.barkDk, B: P.bark, F: old ? P.ochre : P.fur, S: old ? P.fur : P.sand, O: P.ochre };
  rows.forEach((row, j) => {
    for (let i = 0; i < 5; i += 1) if (row[i] !== '.') put(x + i, y + j, c[row[i]]);
  });
};

/** A linha de sombra de contato, como no pé das árvores do tileset. */
const contact = (put: Put, y: number, x0: number, x1: number): void => {
  for (let x = x0; x <= x1; x += 1) put(x, y, P.ink, x === x0 || x === x1 ? 0.5 : 1);
};

const SIZES: Readonly<Record<YardKind, { w: number; h: number }>> = {
  woodpile: { w: 16, h: 15 },
  sawhorse: { w: 16, h: 14 },
  stump: { w: 16, h: 11 },
  axeStump: { w: 16, h: 16 },
  wheelbarrow: { w: 16, h: 13 },
  yardSign: { w: 16, h: 19 },
};

const paintWoodpile = (v: number) => (put: Put): void => {
  // As estacas dos lados (atrás das toras).
  for (let y = 3; y <= 12; y += 1) {
    put(0, y, y === 3 ? P.sand : P.fur);
    put(15, y, y === 3 ? P.sand : P.barkDk);
  }
  // De cima para baixo: a de baixo sustenta a de cima e fica na frente dela.
  const logs: Array<[number, number]> = [[5, 0], [2, 4], [8, 4], [0, 8], [5, 8], [10, 8]];
  // O vão entre as toras: escuro (a pilha tem fundo).
  for (let y = 4; y <= 12; y += 1) for (let x = 1; x <= 14; x += 1) put(x, y, P.night);
  logs.forEach(([x, y], i) => logEnd(put, x, y, hash(i, v, 61) < 0.35));
  // A casca de cima da pilha: uma faixa de lado, a tora de trás aparecendo.
  for (let x = 6; x <= 8; x += 1) put(x, 0, P.bark);
  contact(put, 13, 0, 15);
  for (let x = 1; x <= 14; x += 1) if (hash(x, v, 62) < 0.3) put(x, 14, P.sand, 0.7);
};

const paintSawhorse = (put: Put): void => {
  const H = 14;
  // As pernas em X das duas pontas.
  const leg = (x0: number, y0: number, x1: number, y1: number, c: string): void => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i += 1) put(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  };
  leg(1, H - 2, 5, 6, P.barkDk); leg(5, H - 2, 1, 6, P.bark);
  leg(10, H - 2, 14, 6, P.barkDk); leg(14, H - 2, 10, 6, P.bark);
  // A tora deitada: vista de lado, a ponta cortada à esquerda.
  for (let x = 2; x <= 15; x += 1) {
    put(x, 4, P.fur);
    put(x, 5, grain(x, 5, 63, P.bark));
    put(x, 6, grain(x, 6, 63, P.bark));
    put(x, 7, P.barkDk);
  }
  const end = ['.DD.', 'DSOD', 'DOSD', '.DD.'];
  end.forEach((row, j) => { for (let i = 0; i < 4; i += 1) if (row[i] !== '.') put(i, 4 + j, row[i] === 'D' ? P.barkDk : row[i] === 'S' ? P.sand : P.ochre); });
  // O corte começado e a SERRA DE ARCO parada nele: o arco de madeira e a lâmina entrando na tora.
  put(10, 5, P.night); put(10, 6, P.night);
  for (let x = 7; x <= 13; x += 1) put(x, 0, x === 7 || x === 13 ? P.barkDk : P.bark);
  for (let y = 1; y <= 3; y += 1) { put(7, y, P.fur); put(13, y, P.barkDk); }
  for (let x = 8; x <= 12; x += 1) put(x, 4, x % 2 ? P.grey : P.pale);
  put(10, 1, P.ochre); put(10, 2, P.ochre); // a corda torcida que estica a lâmina
  contact(put, H - 1, 0, 15);
};

const paintStump = (axe: boolean) => (put: Put): void => {
  const H = axe ? 16 : 11;
  const top = H - 9; // a linha do meio do tampo
  // Raízes e casca do lado.
  for (let y = top + 1; y <= H - 3; y += 1) {
    for (let x = 4; x <= 11; x += 1) put(x, y, x === 4 ? P.fur : x === 11 ? P.barkDk : grain(x, y, 64, P.bark));
  }
  for (const [x, y, c] of [[3, H - 3, P.bark], [2, H - 2, P.barkDk], [12, H - 3, P.barkDk], [13, H - 2, P.barkDk], [3, H - 2, P.bark], [12, H - 2, P.bark]] as const) put(x, y, c);
  // O tampo cortado: os anéis, de cima.
  for (let y = top - 2; y <= top + 1; y += 1) {
    for (let x = 4; x <= 11; x += 1) {
      const d = Math.hypot((x - 7.5) / 4, (y - top + 0.5) / 1.8);
      if (d > 1.05) continue;
      put(x, y, d > 0.85 ? P.barkDk : d > 0.62 ? P.sand : d > 0.36 ? P.fur : P.ochre);
    }
  }
  if (axe) {
    // O cabo, em diagonal, saindo do tampo; a cabeça do machado cravada nele.
    const handle: Array<[number, number]> = [[9, top - 3], [10, top - 4], [11, top - 5], [12, top - 6], [13, top - 7]];
    handle.forEach(([x, y], i) => { put(x, y, i % 2 ? P.sand : P.fur); put(x, y + 1, P.barkDk); });
    for (let x = 5; x <= 8; x += 1) {
      put(x, top - 3, x === 5 ? P.pale : P.grey);
      put(x, top - 2, x === 5 ? P.pale : P.greyDk);
    }
    put(6, top - 1, P.night); put(7, top - 1, P.night); // a fenda onde o fio entrou
  }
  contact(put, H - 1, 2, 13);
};

const paintWheelbarrow = (put: Put): void => {
  const H = 13;
  // A roda (à esquerda) e o pé (à direita).
  const wheel = ['.KKK.', 'KGgGK', 'KgPgK', 'KGgGK', '.KKK.'];
  wheel.forEach((row, j) => { for (let i = 0; i < 5; i += 1) if (row[i] !== '.') put(i, 7 + j, row[i] === 'K' ? P.ink : row[i] === 'G' ? P.greyDk : row[i] === 'g' ? P.grey : P.pale); });
  for (let y = 8; y <= H - 2; y += 1) put(11, y, P.barkDk);
  // A caçamba de tábuas: mais larga em cima.
  for (let y = 3; y <= 8; y += 1) {
    const x0 = 3 + Math.floor((y - 3) / 2);
    const x1 = 13 - Math.floor((y - 3) / 3);
    for (let x = x0; x <= x1; x += 1) put(x, y, y === 3 ? P.fur : y === 8 ? P.barkDk : (x - x0) % 4 === 3 ? P.barkDk : grain(x, y, 65, P.bark));
  }
  // Os cabos.
  put(14, 6, P.fur); put(15, 7, P.fur); put(14, 7, P.barkDk);
  // A lenha dentro, de ponta.
  logEnd(put, 4, 0, false);
  logEnd(put, 8, 0, true);
  for (let x = 4; x <= 12; x += 1) put(x, 4, P.barkDk);
  contact(put, H - 1, 1, 12);
};

const paintSign = (put: Put): void => {
  const H = 19;
  // O poste.
  for (let y = 0; y <= H - 2; y += 1) { put(7, y, P.fur); put(8, y, y < 9 ? P.bark : P.barkDk); }
  // A tábua, pregada no alto do poste.
  for (let y = 2; y <= 9; y += 1) {
    for (let x = 1; x <= 14; x += 1) {
      const edge = y === 2 || y === 9 || x === 1 || x === 14;
      // Tábua CLARA (madeira nova, aplainada): o machado queimado tem de se ler de longe.
      put(x, y, y === 2 ? P.boneDk : edge ? P.barkDk : hash(x, y, 66) < 0.18 ? P.fur : P.sand);
    }
  }
  put(2, 3, P.greyDk); put(13, 3, P.greyDk);
  // O machado QUEIMADO na tábua: o cabo em diagonal e a cabeça, a lâmina larga.
  for (const [x, y] of [[4, 8], [5, 7], [6, 6], [7, 5], [8, 4]] as const) put(x, y, P.barkDeep);
  for (const [x, y] of [[8, 3], [9, 3], [10, 3], [9, 4], [10, 4], [11, 4], [11, 5], [10, 5], [11, 6], [12, 5], [12, 6]] as const) put(x, y, P.ink);
  contact(put, H - 1, 5, 10);
};

/** A serragem e as lascas no chão (deitada; 24×16 px = 1,5 × 1 tile). */
const paintChips = (v: number) => (put: Put): void => {
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      const d = Math.hypot((x - 11.5) / 12, (y - 7.5) / 8);
      const r = hash(x, y, 67 + v);
      if (r > (1 - d) * 0.55) continue;
      put(x, y, r < 0.05 ? P.sand : r < 0.16 ? P.fur : r < 0.3 ? P.ochre : P.bark, 0.55 + (1 - d) * 0.4);
    }
  }
};

const key = (kind: YardKind, v = 0): string => `yard-${kind}-${v}`;
/** O ícone de cada peça no editor. */
export const yardIconKey = (kind: PropKind): string => key(kind as YardKind, 0);

let registered = false;
/** Desenha e registra os quadros do quintal (o jogo e o editor). */
export const registerYardTextures = (): void => {
  if (registered) return;
  flushTextures();
  for (let v = 0; v < 2; v += 1) {
    texture(key('woodpile', v), SIZES.woodpile.w, SIZES.woodpile.h, paintWoodpile(v));
    texture(`yard-chips-${v}`, 24, 16, paintChips(v));
  }
  texture(key('sawhorse'), SIZES.sawhorse.w, SIZES.sawhorse.h, paintSawhorse);
  texture(key('stump'), SIZES.stump.w, SIZES.stump.h, paintStump(false));
  texture(key('axeStump'), SIZES.axeStump.w, SIZES.axeStump.h, paintStump(true));
  texture(key('wheelbarrow'), SIZES.wheelbarrow.w, SIZES.wheelbarrow.h, paintWheelbarrow);
  texture(key('yardSign'), SIZES.yardSign.w, SIZES.yardSign.h, paintSign);
  registered = true;
};

/** Quem deixa serragem no chão em volta. */
const CHIPPY: ReadonlySet<YardKind> = new Set<YardKind>(['sawhorse', 'stump', 'axeStump']);

export class LumberYard {
  private readonly tiles = new Set<string>();
  private readonly bodies: Billboard3D[] = [];

  public constructor() {
    registerYardTextures();
    const w3 = world3d();
    for (const p of getYardProps()) {
      const kind = p.type as YardKind;
      const { worldX: x, worldY: y } = p;
      this.tiles.add(`${x},${y}`);
      const v = kind === 'woodpile' ? Math.floor(hash(x, y, 68) * 2) : 0;
      const { w, h } = SIZES[kind];
      this.bodies.push(
        w3.objects.addBillboard(key(kind, v), 0, { groundShadow: { rx: kind === 'yardSign' ? 0.16 : 0.42, rz: 0.14, alpha: 0.28 } })
          .setDisplaySize(w / 16, h / 16)
          .setPosition(x, y)
          // Espelhado num lugar e não no outro: duas peças iguais vizinhas não ficam gêmeas.
          .setFlipX(kind !== 'yardSign' && hash(x, y, 69) < 0.5)
          .setTint(PROP_TINT),
      );
      if (CHIPPY.has(kind)) {
        this.bodies.push(
          w3.objects.addBillboard(`yard-chips-${Math.floor(hash(x, y, 70) * 2)}`, 0, { flat: true, flatY: 0.013, depthWrite: false, alphaTest: 0.05, depthLayer: 'ground' })
            .setDisplaySize(1.5, 1)
            .setPosition(x, y + 0.15)
            .setTint(PROP_TINT),
        );
      }
    }
  }

  /** Há uma peça do quintal neste tile: ele bloqueia a passagem. */
  public at(x: number, y: number): boolean {
    return this.tiles.has(`${x},${y}`);
  }

  public destroy(): void {
    for (const b of this.bodies) b.destroy();
    this.bodies.length = 0;
  }
}
