// O MARCO MOSTRANDO (pedido do autor, 2026-11-11: "o jogador às vezes fica confuso do que fazer nessa quest"). Quando
// ele diz o que procurar, uma ÁRVORE SECA flutua no alto, ao lado dele, como os cogumelos flutuam no chão: é assim que
// ela é. Quando
// ele diz onde o galho vai, a câmera da conversa vai até o CEPO, à direita dele, e o cepo brilha. E quem volta com o
// galho na mão ouve isso sem precisar puxar conversa: ele chama.

import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { CHOP_BLOCK_TEXTURE } from '@/game/render3d/woodTextures';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { LumberQuest } from './LumberQuest';

/** A arte da árvore seca do mundo (objects/DryTreeObject), inteira, antes do machado. */
const DRY_TREE_TEXTURE = 'dry-tree';
/**
 * A árvore seca flutuando: no alto, ao lado da cabeça do Marco (à esquerda dele, longe do cepo), um pouco maior que uma
 * de verdade, respirando devagar. Bem em cima dele ela ficava miúda, colada no "!" de quem tem assunto, e num telefone
 * deitado o palco da conversa não tem altura para ela subir mais.
 */
const PICTURE_SIDE = -1.15;
const PICTURE_ELEVATION = 0.75;
const PICTURE_SIZE = 1.3;
const PICTURE_BOB = 0.07;
const PICTURE_BOB_MS = 900;
/** O cepo aceso: quantas vezes ele pulsa, e quanto dura cada pulso (ida e volta). */
const GLOW_PULSES = 3;
const GLOW_PULSE_MS = 520;
/** Quem chega com o galho na mão a esta distância do Marco (em tiles, em quadrado) ouve onde ele vai. */
export const CALL_RADIUS = 3;

/** Em que falas da conversa a árvore aparece, e em quais a câmera vai ao cepo (índices das linhas). */
export type GuideMarks = { picture?: readonly number[]; block?: readonly number[] };

export class LumberGuide {
  private picture?: Billboard3D;
  private halo?: Billboard3D;
  private glow: Billboard3D[] = [];
  /** Já chamou por este galho: só chama de novo quando o herói larga o galho e volta com outro. */
  private calledForBranch = false;

  public constructor(private readonly quest: LumberQuest) {}

  /** A conversa com as marcas: a árvore flutua nas falas de `picture`, e a câmera vai ao cepo nas de `block`. */
  public mark(script: DialogScript, marks: GuideMarks, npc: { worldX: number; worldY: number }): DialogScript {
    const before = script.onLine;
    return {
      ...script,
      onLine: (i) => {
        before?.(i);
        if (marks.picture?.includes(i)) this.showPicture(npc);
        else this.hidePicture();
        if (marks.block?.includes(i)) this.pointAtBlock(npc);
      },
    };
  }

  /** A árvore seca nasce sobre o Marco: cresce do nada, brilha e fica respirando até a fala acabar. */
  public showPicture(npc: { worldX: number; worldY: number }): void {
    if (this.picture) return;
    const { scene } = this.quest.host;
    const w3 = world3d();
    const x = npc.worldX + PICTURE_SIDE;
    this.halo = w3.objects.addBillboard(FX_DOT_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, additive: true, alphaTest: 0.02 })
      .setTint(0xfff0c0)
      .setPosition(x, npc.worldY)
      .setElevation(PICTURE_ELEVATION + PICTURE_SIZE * 0.5)
      .setDisplaySize(PICTURE_SIZE * 1.2, PICTURE_SIZE * 1.2)
      .setAlpha(0.34);
    const picture = w3.objects.addBillboard(DRY_TREE_TEXTURE, 0, { emissive: true, fog: false })
      .setPosition(x, npc.worldY + 0.01)
      .setElevation(PICTURE_ELEVATION)
      .setDisplaySize(0.01, 0.01);
    this.picture = picture;
    scene.tweens.add({ targets: picture, displayWidth: PICTURE_SIZE, displayHeight: PICTURE_SIZE, duration: 260, ease: 'Back.easeOut' });
    for (const bb of [picture, this.halo]) {
      scene.tweens.add({ targets: bb, elevation: bb.elevation + PICTURE_BOB, duration: PICTURE_BOB_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    this.quest.host.glint(x, npc.worldY, PICTURE_ELEVATION + PICTURE_SIZE);
  }

  public hidePicture(): void {
    const { scene } = this.quest.host;
    for (const bb of [this.picture, this.halo]) {
      if (!bb) continue;
      scene.tweens.killTweensOf(bb);
      bb.destroy();
    }
    this.picture = undefined;
    this.halo = undefined;
  }

  /** A câmera da conversa vai até o cepo, e ele brilha (ver DialogCamera.glanceAt). */
  public pointAtBlock(npc: { worldX: number; worldY: number }): void {
    const tile = this.quest.blockTile;
    if (!tile) return;
    this.quest.host.glance(tile, npc, () => {
      this.quest.host.glint(tile.x, tile.y, 0.75);
      this.glowBlock(tile);
    });
  }

  /** O cepo aceso: a mesma arte por cima somando luz quente, e um halo em volta, pulsando juntos algumas vezes. */
  private glowBlock(tile: { x: number; y: number }): void {
    const { scene } = this.quest.host;
    for (const old of this.glow) old.destroy();
    const w3 = world3d();
    const size = this.quest.blockSize;
    const halo = w3.objects.addBillboard(FX_DOT_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, additive: true, alphaTest: 0.02 })
      .setTint(0xffd070)
      .setPosition(tile.x, tile.y)
      .setElevation(size * 0.45)
      .setDisplaySize(size * 1.9, size * 1.9)
      .setAlpha(0);
    const glow = w3.objects.addBillboard(CHOP_BLOCK_TEXTURE, 0, { additive: true, fog: false, depthWrite: false })
      .setTint(0xffc860)
      .setPosition(tile.x, tile.y + 0.01)
      .setDisplaySize(size, size)
      .setAlpha(0);
    this.glow = [halo, glow];
    for (const [bb, peak] of [[halo, 0.55], [glow, 1]] as const) {
      scene.tweens.add({
        targets: bb,
        alpha: peak,
        duration: GLOW_PULSE_MS / 2,
        yoyo: true,
        repeat: GLOW_PULSES - 1,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          bb.destroy();
          this.glow = this.glow.filter((g) => g !== bb);
        },
      });
    }
  }

  /**
   * O CHAMADO: o herói chegou perto do Marco com um galho na mão e ainda não pôs nenhum de pé no cepo. Ele pula, e a
   * conversa do cepo abre sozinha (a mesma de quem fala com ele segurando o galho).
   */
  public update(): void {
    const q = this.quest;
    if (q.host.held() !== 'wood') {
      this.calledForBranch = false;
      return;
    }
    if (this.calledForBranch || q.save.stage !== 'gather' || q.save.standing || q.save.laid > 0 || !q.npc || !q.blockTile) return;
    if (q.host.busy()) return;
    const hero = q.host.hero();
    if (Math.max(Math.abs(hero.x - q.npc.worldX), Math.abs(hero.y - q.npc.worldY)) > CALL_RADIUS) return;
    this.calledForBranch = true;
    q.host.hop(q.npc.worldX, q.npc.worldY, 0.24);
    q.talk(q.dialogBase(), q.npc);
  }

  public destroy(): void {
    this.hidePicture();
    for (const bb of this.glow) {
      this.quest.host.scene.tweens.killTweensOf(bb);
      bb.destroy();
    }
    this.glow = [];
  }
}
