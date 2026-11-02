import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { CHUNK_COLUMNS, CHUNK_ROWS, SOLID_UPPER_FRAMES } from '@/game/constants';
import {
  HOME_PAINTERS, homeGlowTexture, homeTexture, homeYardTexture, YARD_DEPTH, YARD_WIDTH, type HomeKind,
} from '@/game/render3d/homeTextures';
import { WHITE_SAFE_TINT } from '@/game/render3d/pixelForms';
import { world3d } from '@/game/render3d/World3D';
import { getChunkTerrain } from '@/game/world/WorldData';

/**
 * A CASA DE CADA VIZINHO, ao lado de onde ele fica. Três tiles de largura por dois de fundo são sólidos, e
 * o desenho sobe a partir daí. Os lugares foram escolhidos no mapa, um a um, para não fechar passagem nem
 * esconder pedra, árvore ou o que as quests põem no chão. De noite as janelas acendem; a da Vega apaga de
 * vez quando ele vai embora.
 */

const HOME_SIZE = 2.5;
/** A largura e o fundo do que é sólido, a partir do centro e da linha de baixo. */
const HALF_WIDTH = 1;
const DEPTH = 2;
/** A luz do mundo estoura os tons claros de uma parede grande; o tom abaixa antes da luz, não a rampa. */
const HOME_TINT = 0xa8a4a0;

/** O tile do meio da linha de baixo da casa. */
const HOMES: Readonly<Record<HomeKind, { x: number; y: number }>> = {
  astronaut: { x: 37, y: 8 },
  businessMan: { x: 50, y: 7 },
  painter: { x: 17, y: 13 },
  radiationSuit: { x: 5, y: 37 },
};

/** O terreiro fica centrado um pouco à frente da casa: mais chão diante da porta do que atrás. */
const YARD_FORWARD = 0.5;
const YARD_Y = 0.012;
/** Até onde o capim e as pedrinhas saem, um pouco menos que a mancha para a beira não ficar pelada. */
const YARD_CLEAR_X = 2.2;
const YARD_CLEAR_Y = 1.5;

/**
 * Tira o capim, as flores e as pedrinhas de enfeite do terreiro. É um diff por cima do world.json, como o
 * dos buracos cavados, e por isso roda antes do World3D assar o terreno. Árvore, parede e prop ficam.
 */
export const clearHomeYards = (): void => {
  for (const { x, y } of Object.values(HOMES)) {
    for (let wy = Math.floor(y - YARD_CLEAR_Y); wy <= Math.ceil(y + YARD_FORWARD + YARD_CLEAR_Y); wy += 1) {
      for (let wx = Math.floor(x - YARD_CLEAR_X); wx <= Math.ceil(x + YARD_CLEAR_X); wx += 1) {
        const nx = (wx - x) / YARD_CLEAR_X;
        const ny = (wy - y - YARD_FORWARD) / YARD_CLEAR_Y;
        if (nx * nx + ny * ny > 1) continue;
        const terrain = getChunkTerrain(Math.floor(wx / CHUNK_COLUMNS), Math.floor(wy / CHUNK_ROWS));
        const lx = wx % CHUNK_COLUMNS;
        const ly = wy % CHUNK_ROWS;
        const upper = terrain.upper[ly][lx];
        if (upper !== null && !SOLID_UPPER_FRAMES.has(upper) && !terrain.collisions[ly][lx]) terrain.upper[ly][lx] = null;
      }
    }
  }
};

export class NpcHomes {
  private readonly glows = new Map<HomeKind, Billboard3D>();
  private readonly bodies: Billboard3D[] = [];
  private shown = '';

  public constructor() {
    for (const kind of Object.keys(HOME_PAINTERS) as HomeKind[]) {
      const { x, y } = HOMES[kind];
      this.bodies.push(world3d()
        .addBillboard(homeYardTexture(kind), 0, { flat: true, flatY: YARD_Y })
        .setDisplaySize(YARD_WIDTH, YARD_DEPTH)
        .setPosition(x, y + YARD_FORWARD));
      this.bodies.push(world3d()
        .addBillboard(homeTexture(kind), 0, { groundShadow: { rx: 1.25, rz: 0.6, alpha: 0.3 } })
        .setDisplaySize(HOME_SIZE, HOME_SIZE)
        .setTint(kind === 'astronaut' ? WHITE_SAFE_TINT : HOME_TINT)
        .setPosition(x, y + 0.3));
      this.glows.set(kind, world3d()
        .addBillboard(homeGlowTexture(kind), 0, { emissive: true, fog: false })
        .setDisplaySize(HOME_SIZE, HOME_SIZE)
        .setPosition(x, y + 0.32)
        .setVisible(false));
    }
  }

  public destroy(): void {
    for (const bb of [...this.bodies, ...this.glows.values()]) bb.destroy();
    this.bodies.length = 0;
    this.glows.clear();
  }

  public isSolidAt(x: number, y: number): boolean {
    for (const home of Object.values(HOMES)) {
      if (Math.abs(x - home.x) <= HALF_WIDTH && y <= home.y && y > home.y - DEPTH) return true;
    }
    return false;
  }

  /** Só mexe quando a hora vira: isto roda todo quadro. */
  public syncNight(night: boolean, gone: ReadonlySet<HomeKind>): void {
    const key = `${night}|${[...gone].join()}`;
    if (key === this.shown) return;
    this.shown = key;
    for (const [kind, glow] of this.glows) glow.setVisible(night && !gone.has(kind));
  }
}
