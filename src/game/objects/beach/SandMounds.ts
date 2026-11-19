import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { textureImage } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';
import { getDay } from '@/game/runtime/timeOfDay';

import { hash, texture } from '@/game/objects/nature/kit';

import type { BeachFrame, BeachSystem } from './kit';

/**
 * OS MONTINHOS DE AREIA (pedido do autor, 2026-11-19: "faça um montinho de areia em alguns lugares, em que o usuário com
 * um balde poderá interagir para pegar areia. É dessa maneira que o herói vai pegar areia para o astronauta. A areia que
 * o astronauta pede só poderá ser obtida com areia da praia... Quando ele pega, o montinho se desfaz").
 *
 * Cinco montinhos na areia seca, de ponta a ponta da praia, longe da onda. Cada um é sólido (barra o passo, como um
 * coqueiro), e com o BALDE vazio nas costas o X o recolhe: o balde sai cheio de areia (`bucketSand`, scenes/game/
 * WaterWork.scoopSand) e o montinho se desfaz, afundando. O vento junta outro no MESMO lugar no dia seguinte — é a
 * única areia do jogo, e um jogador que despejou o balde fora não pode ficar sem.
 */

/** Onde ficam: areia seca, a três tiles ou mais do mar, sem coqueiro nem enfeite (scripts/praia-do-norte.mjs --map). */
export const SAND_MOUND_TILES: ReadonlyArray<{ x: number; y: number }> = [
  // (o de 47,-12 saiu de 41,-12: ali ele ficava no primeiro plano de quem senta na cadeira do guarda-sol, BeachSeat;
  // o de 34,-15 saiu de 33,-15, onde o mar ficava a três tiles)
  { x: 9, y: -13 }, { x: 20, y: -13 }, { x: 34, y: -15 }, { x: 47, y: -12 }, { x: 52, y: -14 },
];

/** O desenho: um domo de areia, 16 × 9, aceso pela esquerda (a regra da casa), com o grão de ocre salpicado. */
const MOUND_W = 16;
const MOUND_H = 9;
const MOUND = texture('sand-mound', MOUND_W, MOUND_H, (put) => {
  const cx = 7.5;
  const rx = 7.4;
  const ry = 8.6;
  for (let y = 0; y < MOUND_H; y += 1) {
    for (let x = 0; x < MOUND_W; x += 1) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - MOUND_H) / ry;
      if (nx * nx + ny * ny > 1) continue;
      // a luz vem do alto à esquerda: o quanto este pedaço do domo olha para ela
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lit = -0.55 * nx - 0.45 * ny + 0.7 * nz;
      const base = y === MOUND_H - 1;
      let color = lit > 0.82 ? '#ccbd99' : lit > 0.55 ? '#8e897d' : lit > 0.3 ? '#7b776d' : '#5e5a56';
      if (base && lit < 0.6) color = '#5e5a56';
      // o grão de ocre, em pontos soltos (nunca no realce, que fica limpo)
      if (color !== '#ccbd99' && hash(x, y, 907) < 0.16) color = '#a2895b';
      put(x, y, color);
    }
  }
});
/** O tamanho no mundo (tiles): um palmo de altura. */
const SIZE = { w: MOUND_W / 16, h: MOUND_H / 16 };
const SHADOW = { rx: 0.42, rz: 0.16, alpha: 0.22 };
/** O tom das peças da praia: a luz do vale estoura os claros (nature/kit PROP_TINT; um pouco mais claro saía amarelo-vivo). */
const TINT = 0xa8a49e;
/** Quanto leva para desfazer (afundar) e para o vento juntar de novo, à vista (ms). */
const SINK_MS = 520;
const RISE_MS = 900;

interface Mound { x: number; y: number; bb?: Billboard3D; takenDay?: number; sinking?: number; rising?: number }

export class SandMounds implements BeachSystem {
  private readonly mounds: Mound[] = SAND_MOUND_TILES.map((t) => ({ ...t }));
  private built = false;
  /** Quantos o balde já recolheu (o playtest lê). */
  public taken = 0;

  /** Há um montinho em pé neste tile (sólido, e é com ele que o balde fala). */
  public at(x: number, y: number): boolean {
    return this.mounds.some((m) => m.x === x && m.y === y && m.bb !== undefined && m.sinking === undefined);
  }

  /** Os montinhos e se estão em pé (a janela do playtest). */
  public get list(): Array<{ x: number; y: number; standing: boolean }> {
    return this.mounds.map((m) => ({ x: m.x, y: m.y, standing: m.bb !== undefined && m.sinking === undefined }));
  }

  /** O balde levou a areia: o montinho se desfaz, afundando, e volta no dia seguinte. */
  public take(x: number, y: number): boolean {
    const m = this.mounds.find((k) => k.x === x && k.y === y && k.bb !== undefined && k.sinking === undefined);
    if (!m) return false;
    m.sinking = 0;
    m.takenDay = getDay();
    this.taken += 1;
    return true;
  }

  public update(f: BeachFrame): void {
    // a textura nasce quando a praia acorda (o registro de texturas só aceita depois que o World3D carregou as dele)
    if (!this.built) {
      if (!textureImage(MOUND)) return;
      this.built = true;
      for (const m of this.mounds) this.raise(m, false);
    }
    const day = getDay();
    for (const m of this.mounds) {
      if (m.sinking !== undefined && m.bb) {
        m.sinking += f.dt * 1000;
        const k = Math.min(1, m.sinking / SINK_MS);
        // afunda achatando: a areia escorre para os lados e some no chão
        m.bb.setDisplaySize(SIZE.w * (1 + 0.25 * k), Math.max(1 / 16, SIZE.h * (1 - k))).setAlpha(1 - k * k);
        if (k >= 1) {
          m.bb.destroy();
          m.bb = undefined;
          m.sinking = undefined;
        }
      } else if (!m.bb && m.takenDay !== undefined && day > m.takenDay
        && (Math.round(f.hero.x) !== m.x || Math.round(f.hero.y) !== m.y)) {
        // (nunca debaixo do herói: o montinho é sólido, e ele ficaria preso dentro)
        this.raise(m, true);
      } else if (m.rising !== undefined && m.bb) {
        m.rising += f.dt * 1000;
        const k = Math.min(1, m.rising / RISE_MS);
        m.bb.setDisplaySize(SIZE.w, Math.max(1 / 16, Math.round(SIZE.h * k * 16) / 16));
        if (k >= 1) m.rising = undefined;
      }
    }
  }

  private raise(m: Mound, grow: boolean): void {
    m.takenDay = undefined;
    m.bb = world3d().objects.addBillboard(MOUND, 0, { groundShadow: SHADOW })
      .setTint(TINT)
      .setDisplaySize(SIZE.w, grow ? 1 / 16 : SIZE.h)
      .setPosition(m.x, m.y + 0.08);
    m.rising = grow ? 0 : undefined;
  }

  public destroy(): void {
    for (const m of this.mounds) m.bb?.destroy();
    for (const m of this.mounds) m.bb = undefined;
  }
}
