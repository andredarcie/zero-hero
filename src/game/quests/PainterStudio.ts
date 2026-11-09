// A MESA E O CAVALETE DA SISI: as flores viram tinta na mesa, as tintas enchem os potes, e o quadro se pinta no
// cavalete. A horta é a PainterGarden; as falas, a PainterQuest.

import { getSoundManager } from '@/game/audio/SoundManager';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import { tLines, type I18nLine } from '@/game/i18n/i18n';
import { DYE_KINDS, DYE_TINTS, PLOT_COUNT } from '@/game/quests/dyePlants';
import { EASEL_ART_TEXTURE, paintTableTexture, publishEaselArt } from '@/game/render3d/paintTextures';
import { PaintingOverlay, readPainting } from '@/game/runtime/PaintingOverlay';
import type { PainterQuest } from './PainterQuest';

export const SIZE_TABLE = 1;
export const SIZE_EASEL = 1.1;
/** Pouca tinta, e tinta de sobra: "não sobrou um canto" tem de ser verdade, ela olha para o quadro. */
const COVERAGE_SPARSE = 0.06;
const COVERAGE_FULL = 0.8;
const EASEL_POP_MS = 320;
/** O tempo de ver o quadro nascer antes de o pincel voar. */
const BRUSH_AFTER_EASEL_MS = 520;
const ring = (r: number): Array<readonly [number, number]> => {
  const tiles: Array<readonly [number, number]> = [];
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r) tiles.push([dx, dy]);
    }
  }
  return tiles;
};
// Nada diretamente atrás dela: o "!" e o keycap sobre a cabeça da Sisi cairiam em cima do quadro.
// Depois dos lugares bons, qualquer canto em volta: sem tile livre a quest travaria.
export const EASEL_SPOTS: ReadonlyArray<readonly [number, number]> = [[-2, 0], [2, 0], [-2, -1], [2, -1], [-2, 1], [2, 1], ...ring(3), ...ring(4)];

export class PainterStudio {
  private draft?: HTMLCanvasElement;

  public constructor(private readonly host: PainterQuest) {}

  /** Ela arma o quadro em branco, e só agora: num tile livre, nunca embaixo do herói. */
  private placeEasel(): void {
    const tile = this.host.pick(EASEL_SPOTS, [this.host.tableTile, this.host.host.hero()]);
    if (!tile) return;
    this.host.save.easel = tile;
    this.host.showEasel(tile);
    const { easel, npc } = this.host;
    if (easel) {
      easel.setDisplaySize(SIZE_EASEL * 0.2, SIZE_EASEL * 0.2);
      this.host.host.scene.tweens.add({ targets: easel, displayWidth: SIZE_EASEL, displayHeight: SIZE_EASEL, duration: EASEL_POP_MS, ease: 'Back.easeOut' });
    }
    if (npc) this.host.host.hop(npc.worldX, npc.worldY);
    this.host.host.sparkle(tile.x, tile.y);
    getSoundManager().work.playBridgePlank();
  }

  public useTableAt(x: number, y: number): boolean {
    const { npc } = this.host;
    if (this.host.tableTile?.x !== x || this.host.tableTile.y !== y || !npc || !this.host.garden.flowersReady()) return false;
    this.makePaint(this.host.dialogBase(), npc);
    return true;
  }

  /** A MESA: as flores viram tinta, uma planta por fala, e os potes enchem junto. */
  public makePaint(base: DialogScript, at: { worldX: number; worldY: number }): void {
    const hero = this.host.host.hero();
    const tile = this.host.tableTile ?? { x: at.worldX, y: at.worldY };
    this.host.host.removeFromHand('dyeBundle', this.host.host.heldCount('dyeBundle'));
    this.host.host.fling('dyeBundle', hero.x, hero.y, tile.x, tile.y);
    getSoundManager().ui.playItemStash();
    const lines: I18nLine[] = [
      ...tLines('npc.painterMake.intro'),
      ...DYE_KINDS.flatMap((kind) => tLines(`npc.painterMake.${kind}`)),
      ...tLines('npc.painterMake.binder'),
      ...tLines('npc.painterMake.brush'),
    ];
    const introLines = tLines('npc.painterMake.intro').length;
    this.host.host.say({
      ...base,
      lines,
      onLine: (index) => {
        const dye = DYE_KINDS[index - introLines];
        if (!dye) return;
        this.fillPots(index - introLines + 1, tile, DYE_TINTS[dye]);
      },
    }, at, () => {
      this.host.save.stage = 'paint';
      this.host.table?.setTexture(paintTableTexture(PLOT_COUNT), 0);
      this.placeEasel();
      this.host.host.persist();
      this.host.host.scene.time.delayedCall(BRUSH_AFTER_EASEL_MS, () => this.host.resupply('brush', at));
      this.host.host.markHeard();
    });
  }

  private fillPots(filled: number, tile: { x: number; y: number }, tint: number): void {
    this.host.table?.setTexture(paintTableTexture(filled), 0);
    this.host.burst(tile.x, tile.y, tint, 14);
    getSoundManager().nature.playFurnaceBreath();
    const table = this.host.table;
    if (!table) return;
    // A mesa trabalha: um socão do pilão, em altura, sem esticar a arte.
    this.host.host.scene.tweens.killTweensOf(table);
    table.setDisplaySize(SIZE_TABLE, SIZE_TABLE);
    this.host.host.scene.tweens.add({
      targets: table, displayHeight: SIZE_TABLE * 0.9, displayWidth: SIZE_TABLE * 1.05, duration: 90, yoyo: true, repeat: 2, ease: 'Sine.easeInOut',
    });
  }

  public openEaselAt(x: number, y: number): boolean {
    if (this.host.easelTile?.x !== x || this.host.easelTile.y !== y) return false;
    if (this.host.save.stage !== 'paint') {
      if (this.host.save.stage !== 'done') this.host.host.scene.tweens.add({ targets: this.host.easel, elevation: 0.05, duration: 70, yoyo: true });
      return true;
    }
    if (this.host.host.held() !== 'brush') return true;
    if (this.host.overlay) return true;
    this.host.host.freeze(true);
    this.host.host.showButtons(false);
    const sound = getSoundManager();
    sound.ui.playPaperUnfold();
    this.host.overlay = new PaintingOverlay({
      onStroke: () => sound.work.playSandTrickle(),
      onPick: () => sound.ui.playItemBonk(),
      onCancel: (canvas) => {
        this.draft = canvas;
        this.closeEasel();
      },
      onDone: (canvas) => this.finishPainting(canvas),
    }, this.draft);
    return true;
  }

  private closeEasel(): void {
    this.host.overlay?.destroy();
    this.host.overlay = undefined;
    this.host.host.freeze(false);
    this.host.host.showButtons(true);
  }

  /** Terminou: o desenho vai ao quadro e ao save. O que ela acha dele fica para quando o herói voltar. */
  private finishPainting(canvas: HTMLCanvasElement): void {
    this.host.save.review = this.readReview(readPainting(canvas));
    publishEaselArt(canvas);
    this.host.easel?.setTexture(EASEL_ART_TEXTURE, 0);
    this.host.save.art = canvas.toDataURL('image/png');
    this.draft = undefined;
    this.host.save.stage = 'review';
    this.closeEasel();
    if (this.host.easelTile) this.host.host.sparkle(this.host.easelTile.x, this.host.easelTile.y);
    this.host.host.persist();
  }

  /** O comentário lê o desenho de verdade: quanto cobriu e que cor mandou. */
  private readReview(reading: ReturnType<typeof readPainting>): { form: string; color: string } {
    return {
      form: reading.coverage < COVERAGE_SPARSE ? 'sparse' : reading.coverage > COVERAGE_FULL ? 'full' : 'middle',
      color: reading.used.length >= DYE_KINDS.length ? 'all' : reading.dominant,
    };
  }
}
