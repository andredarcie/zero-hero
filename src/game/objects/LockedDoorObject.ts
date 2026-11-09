import type * as Engine from '@/game/engine';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

// A locked door prop. It blocks its tile until the hero bumps it while holding a key, which
// opens it for good. Like DryBushObject, its collision lives here (see `blocking`) and is
// resolved at runtime, not baked into the collision grid. Uses the existing locked_door tile.
export class LockedDoorObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Engine.Scene;
  private readonly sprite: Billboard3D;
  private open = false;
  // A floodgate: opening it drains the water it holds back (GameScene.openFloodgate). It reads as
  // a water gate rather than a plain door — same lock, different consequence.
  private readonly floodgate: boolean;
  /** O portão do jardim alto: arte própria (portão clássico coberto de ramos) e folhas que giram ao abrir. */
  private readonly garden: boolean;

  public constructor(scene: Engine.Scene, worldX: number, worldY: number, floodgate = false, garden = false) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.floodgate = floodgate;
    this.garden = garden;
    this.sprite = world3d()
      .objects.addBillboard(garden ? 'garden-gate-object' : 'locked-door-object', 0, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.98, 0.98)
      // Same treatment as the rocks: the door's white bars bloomed under the night ambient.
      // Neutral so the bars stay white — only the glow goes. A floodgate is tinted cool blue to
      // telegraph that it holds water, not just a room.
      .setTint(floodgate ? 0x7fb0d8 : 0xcfcfcf);
  }

  /** True if opening this door should drain the water it dams (a floodgate, not a plain door). */
  public get isFloodgate(): boolean {
    return this.floodgate;
  }

  /** The tile is impassable while the door is shut. */
  public get blocking(): boolean {
    return !this.open;
  }

  public get isOpen(): boolean {
    return this.open;
  }

  /** Open the door (key consumed by the caller); only a shut door can open. */
  public unlock(): boolean {
    if (this.open) return false;
    this.open = true;
    if (this.garden) {
      // As duas folhas giram para dentro do jardim: entreaberto, depois aberto. O arco e os ramos ficam.
      this.sprite.setTexture('garden-gate-object', 1);
      this.scene.time.delayedCall(170, () => this.sprite.setTexture('garden-gate-object', 2));
      return true;
    }
    // Swing open: fold thin and fade to a faint frame so the doorway reads as passable.
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 0.2,
      alpha: 0.25,
      duration: 260,
      ease: 'Back.easeIn',
    });
    return true;
  }

  /** O portão do jardim já aberto ao carregar o jogo: direto no último quadro, sem o gesto. */
  public setOpenInstantly(): void {
    this.open = true;
    this.sprite.setTexture(this.garden ? 'garden-gate-object' : 'locked-door-object', this.garden ? 2 : 0);
    if (!this.garden) this.sprite.setDisplaySize(0.2, 0.98).setAlpha(0.25);
  }

  /** O tranco do trinco cedendo: um sacolejo curto e pequeno, menor que o de um esbarrão. */
  public jolt(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite, angle: { from: -1.6, to: 1.6 }, duration: 45, yoyo: true, repeat: 1,
      ease: 'Sine.easeInOut', onComplete: () => this.sprite.setAngle(0),
    });
  }

  /** Brief shake so bumping the shut door (without a key) reads as a solid obstacle. */
  public shake(): void {
    if (this.open) return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -5, to: 5 },
      duration: 55,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
