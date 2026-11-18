// A GRADE NO CHÃO DO MUNDO (o desenho em render3d/campGridArt; o modo em BuildMode): cada tile do acampamento é um
// quadradinho de pixel art deitado no chão — na escala de pixel do mundo, atrás do mato e das peças que estão na frente
// dele —, o cursor é um par de cantos que respira, e a peça na mão aparece EM PÉ no tile apontado, translúcida, do
// tamanho que vai ter. Com o jogo parado nada se desenha sozinho: quem pede o quadro é `redraw` (o cursor respira a uns
// 30 quadros por segundo enquanto a grade está aberta).

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { GRID_PX, paintGridArt, type GridArt } from '@/game/render3d/campGridArt';
import { pixelTexture } from '@/game/render3d/pixelTexture';
import { STANDING_DECOR_ORDER } from '@/game/render3d/standingDecor';
import { registerTexture3D } from '@/game/render3d/textures3d';
import type { GridCellState } from '@/game/runtime/homeGrid';
import type { GameScene } from '../GameScene';

/** O que BuildGridView usa de GameScene. */
export type BuildGridViewHost = Pick<GameScene, 'world3d'>;

const KEY = (art: GridArt): string => `camp-grid-${art}`;
const ARTS: readonly GridArt[] = ['free', 'grass', 'blocked', 'piece', 'cursorOk', 'cursorNo'];
/** Depois do mato alto (que grava profundidade: a grade some atrás dele) e antes da decoração (que a cobre por cima). */
const CELL_ORDER = STANDING_DECOR_ORDER - 0.05;
const CURSOR_ORDER = STANDING_DECOR_ORDER - 0.04;
const STATE_ART: Readonly<Record<GridCellState, GridArt | null>> = {
  free: 'free', grass: 'grass', blocked: 'blocked', piece: 'piece', fixed: null,
};
const FRAME_MS = 33;

let registered = false;
const registerGridArt = (): void => {
  if (registered) return;
  for (const art of ARTS) registerTexture3D(KEY(art), pixelTexture(paintGridArt(art), GRID_PX, GRID_PX));
  registered = true;
};

export class BuildGridView {
  private readonly cells = new Map<string, { bb: Billboard3D; art: GridArt }>();
  private cursor?: Billboard3D;
  private ghost?: { bb: Billboard3D; texture: string };
  private raf = 0;
  private last = 0;

  public constructor(private readonly host: BuildGridViewHost, private readonly redraw: () => void) {
    registerGridArt();
  }

  /** A grade inteira, o tile apontado (ou nenhum) e o desenho da peça na mão (ou nenhuma). */
  public paint(
    cells: ReadonlyArray<{ x: number; y: number; state: GridCellState }>,
    tile: { x: number; y: number } | null,
    holding: string | null,
  ): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    const seen = new Set<string>();
    for (const c of cells) {
      const art = STATE_ART[c.state];
      if (!art) continue;
      const k = `${c.x},${c.y}`;
      seen.add(k);
      const have = this.cells.get(k);
      if (have) {
        if (have.art !== art) have.bb.setTexture(KEY(art));
        have.art = art;
        continue;
      }
      const bb = w3.objects.addBillboard(KEY(art), 0, {
        flat: true, flatY: 0.014, depthWrite: false, emissive: true, fog: false, alphaTest: 0.02, renderOrder: CELL_ORDER,
      }).setDisplaySize(1, 1).setPosition(c.x, c.y);
      this.cells.set(k, { bb, art });
    }
    for (const [k, c] of this.cells) {
      if (seen.has(k)) continue;
      c.bb.destroy();
      this.cells.delete(k);
    }
    const at = tile ? cells.find((c) => c.x === tile.x && c.y === tile.y) : undefined;
    this.placeCursor(at ?? null, holding);
  }

  private placeCursor(at: { x: number; y: number; state: GridCellState } | null, holding: string | null): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    if (!at) {
      this.cursor?.setVisible(false);
      this.ghost?.bb.setVisible(false);
      this.stopPulse();
      return;
    }
    // o cursor diz se dá: com a peça na mão, verde só no tile livre; de mão vazia, claro na peça que se levanta
    const ok = holding ? at.state === 'free' : at.state === 'piece' || at.state === 'free';
    const art: GridArt = ok ? 'cursorOk' : 'cursorNo';
    this.cursor ??= w3.objects.addBillboard(KEY(art), 0, {
      flat: true, flatY: 0.016, depthWrite: false, emissive: true, fog: false, alphaTest: 0.02, renderOrder: CURSOR_ORDER,
    }).setDisplaySize(1, 1);
    this.cursor.setTexture(KEY(art)).setPosition(at.x, at.y).setVisible(true);
    if (holding) {
      if (this.ghost?.texture !== holding) {
        this.ghost?.bb.destroy();
        this.ghost = { bb: w3.objects.addBillboard(holding, 0, { alphaTest: 0.05 }).setDisplaySize(1, 1), texture: holding };
      }
      // a peça na mão, em pé no tile: translúcida, e avermelhada onde não pode ficar
      this.ghost.bb.setPosition(at.x, at.y).setAlpha(0.72).setTint(at.state === 'free' ? 0xd8f0c8 : 0xf0a8a0).setVisible(true);
    } else {
      this.ghost?.bb.setVisible(false);
    }
    this.startPulse();
  }

  /** O cursor respira (o alfa vai e volta), e o quadro é pedido à mão, porque o jogo está parado. */
  private startPulse(): void {
    if (this.raf || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
    const tick = (now: number): void => {
      this.raf = window.requestAnimationFrame(tick);
      if (now - this.last < FRAME_MS) return;
      this.last = now;
      this.cursor?.setAlpha(0.72 + 0.28 * (0.5 + 0.5 * Math.sin(now / 260)));
      this.redraw();
    };
    this.raf = window.requestAnimationFrame(tick);
  }

  private stopPulse(): void {
    if (this.raf) window.cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  public destroy(): void {
    this.stopPulse();
    for (const c of this.cells.values()) c.bb.destroy();
    this.cells.clear();
    this.cursor?.destroy();
    this.cursor = undefined;
    this.ghost?.bb.destroy();
    this.ghost = undefined;
  }
}
