import Phaser from 'phaser';

import { ASSET_KEYS, ITEM_FRAMES, SCENE_DEPTHS } from '@/game/constants';

const SLASH_DURATION    = 155;
const SLASH_SWEEP_DEG   = 155;   // wide dramatic arc
const SLASH_HANDLE_FACTOR = 0.26; // handle sits this fraction of tileSize from player center
const SLASH_BLADE_FACTOR  = 1.08; // blade length relative to tileSize
const SLASH_FADE_DURATION = 65;

// Motion-blur trail ghosts — index 0 is closest to the main sprite
const TRAIL_COUNT  = 4;
const TRAIL_ALPHAS = [0.50, 0.30, 0.16, 0.07] as const;
const TRAIL_DEPTH  = SCENE_DEPTHS.player; // behind main sprite

// ── Standing in the world's light ────────────────────────────────────────────
//
// The swing is the last WORLD object drawn on the Phaser canvas, which sits ABOVE the 3D one:
// it gets no lighting, no tone mapping and no night grade. Left alone it renders at full art
// brightness over a night-dark world, so a light-palette tool (the steel axe is greys and bone)
// swung like a lightbulb while the hero holding it stood in shadow — the "branco estourado".
// So the sprite is TINTED by the light where the hero is standing (World3D.lightLevelAt):
// moonlight at 0, the art's own colours at 1. It only has to sit in the hero's value range.
const SWING_DARK = 0x5a5c78; // the multiply tint under moonlight alone — cool, like the night
/** Blend the night tint toward white by `level` (0..1) and pack it back into a Phaser tint. */
const swingTint = (level: number): number => {
  const t = Math.max(0, Math.min(1, level));
  const lerp = (dark: number): number => Math.round(dark + (255 - dark) * t);
  return (lerp((SWING_DARK >> 16) & 0xff) << 16)
    | (lerp((SWING_DARK >> 8) & 0xff) << 8)
    | lerp(SWING_DARK & 0xff);
};

// ── The mining swing ─────────────────────────────────────────────────────────
//
// A pickaxe is not a sword. The slash above is a flat sweep that passes THROUGH its target and
// out the other side; a pick is heavy — it is hauled up over the head, HANGS there while its
// weight gathers, and is then driven into one single spot, and the stone hands it straight back
// to you. Those four beats are the whole animation, and the hang is the one that sells it: cut
// the pause and the same arc reads as a fly-swat.
//
// The head always travels OVER the hero and never up through the ground: it sweeps in ONE
// direction, from a wind-up behind him to the strike. The rotation is driven through a scratch
// object rather than the sprite's own `angle`, because Phaser wraps that getter into [-180, 180]
// — a tween reading it back would take the long way round (the same trap the slash documents).
const CHOP_REAR_MS    = 125;  // hauling it up and back: the slow beat that gives it weight
const CHOP_HANG_MS    = 50;   // held at the top of the swing
const CHOP_DRIVE_MS   = 70;   // and down — fast, the only beat that leaves a trail
const CHOP_RECOIL_MS  = 130;  // granite gives nothing back but the pick
const CHOP_FADE_MS    = 90;

const CHOP_CARRY_DEG  = 28;   // where it rests in his hands before the swing (tipped back)
const CHOP_REAR_DEG   = 152;  // how far behind the strike the wind-up reaches
const CHOP_BURY_DEG   = 16;   // driven a little PAST the target: the point bites in
const CHOP_RECOIL_DEG = 34;   // and is kicked back out of the stone
const CHOP_TRAIL_DEG  = 13;   // spacing of the motion-blur ghosts along the drive

// The head may never wind up BELOW the horizon. "Behind the hero" is a direction on the ground,
// but on screen it is a direction on the clock face — and when he chops NORTH, behind him is
// straight DOWN the screen: a 152° wind-up put the pick under his feet and he read as a man
// sweeping a floor. Capped, the head always rises above his shoulder, whichever way he faces.
const CHOP_REAR_CAP = 78;
// A chop up or down the screen barely rotates (the rock is above his head, so the blade already
// points at it) — so what has to sell it is the pick SHRINKING as it is driven away from the
// camera, and swelling as it is driven toward it. Sideways chops have the arc and need neither.
const CHOP_AWAY_SIZE   = 0.82;
const CHOP_TOWARD_SIZE = 1.04;

// The pick's handle travels too — the arms haul back on the wind-up and shove into the blow.
// Fractions of a tile from the hero's centre; negative = drawn back behind him.
const CHOP_HAND_REAR   = -0.08;
const CHOP_HAND_LIFT   = 0.16;  // ...and up (screen-up is -y): the hands rise past his head
const CHOP_HAND_STRIKE = 0.44;
const CHOP_HAND_REST   = 0.30;

/** When the head lands, counted from the swing starting: the blow belongs on this frame. */
export const CHOP_IMPACT_MS = CHOP_REAR_MS + CHOP_HANG_MS + CHOP_DRIVE_MS;
/** When the head starts falling — where the whoosh belongs, not at the sleepy wind-up. */
export const CHOP_DRIVE_AT_MS = CHOP_REAR_MS + CHOP_HANG_MS;
/** The whole strike, wind-up to fade: how long the pick is out of the hero's hands. */
export const CHOP_TOTAL_MS = CHOP_IMPACT_MS + CHOP_RECOIL_MS + CHOP_FADE_MS;

export class SwordSlash {
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly trails: Phaser.GameObjects.Sprite[];

  private onFire = false;
  /** Light where the swing happens, 0..1 — see SWING_DARK. Set by the caller before each swing. */
  private lightLevel = 1;

  // kept across onUpdate so we don't recalculate each frame
  private slashHandleX = 0;
  private slashHandleY = 0;
  private slashSize    = 0;
  private trailStep    = 0;

  // The chop's pose, tweened as plain numbers and written onto the sprite each frame (see above).
  // `trail` is how far the motion blur has faded in (0 on the wind-up, 1 through the drive).
  private readonly chop$ = { angle: 0, handX: 0, handY: 0, size: 0, trail: 0, spin: 1 };

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const makeSprite = (depth: number) =>
      scene.add
        .sprite(0, 0, ASSET_KEYS.swordItem, ITEM_FRAMES.swordIdle)
        // pivot at bottom-centre = pommel/handle, blade extends upward
        .setOrigin(0.5, 1.0)
        .setDepth(depth)
        .setAlpha(0)
        .setVisible(false);

    this.sprite = makeSprite(SCENE_DEPTHS.player + 1);
    this.trails = Array.from({ length: TRAIL_COUNT }, () => makeSprite(TRAIL_DEPTH));
  }

  public setOnFire(value: boolean): void {
    this.onFire = value;
  }

  /** How lit the tile the hero swings from is (World3D.lightLevelAt), 0..1. */
  public setLightLevel(level: number): void {
    this.lightLevel = level;
  }

  /**
   * dx/dy: cardinal attack direction (-1, 0, or 1). Pass `item` to swing a different sprite
   * (e.g. the key on a door, a tool) with the exact same arc — its own texture/frame, and
   * only burning if the item says so (e.g. the flaming wood club).
   */
  public slash(
    playerScreenX: number,
    playerScreenY: number,
    dx: number,
    dy: number,
    tileSize: number,
    item?: { texture: string; frame: number; onFire?: boolean; flipX?: boolean },
  ): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.chop$); // a chop still in the air would fight for the sprite
    this.trails.forEach(t => this.scene.tweens.killTweensOf(t));

    // blade points "up" in sprite-space → +90° rotates it to face attack direction
    // Normalize to [-180, 180] so startAngle stays in that range — Phaser's angle
    // getter wraps to [-180, 180], so if startAngle > 180 the tween reads a wrapped
    // value and rotates the long way around (full spin bug on left-facing attacks).
    let attackAngleDeg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (attackAngleDeg > 180) attackAngleDeg -= 360;
    const startAngle     = attackAngleDeg - SLASH_SWEEP_DEG / 2;
    const endAngle       = attackAngleDeg + SLASH_SWEEP_DEG / 2;

    const handleDist = tileSize * SLASH_HANDLE_FACTOR;
    const size       = Math.max(12, Math.floor(tileSize * SLASH_BLADE_FACTOR));

    // handle stays fixed — only the angle changes
    this.slashHandleX = playerScreenX + dx * handleDist;
    this.slashHandleY = playerScreenY + dy * handleDist;
    this.slashSize    = size;
    this.trailStep    = SLASH_SWEEP_DEG / (TRAIL_COUNT + 2);

    // A custom item burns only when it says so (flaming wood); the bare sword uses the
    // slash animator's own onFire state.
    const onFire = item ? (item.onFire ?? false) : this.onFire;
    const texture = item ? item.texture : (onFire ? ASSET_KEYS.swordOnFire : ASSET_KEYS.swordItem);
    const frame = item ? item.frame : ITEM_FRAMES.swordIdle;

    // Single-edged tools (the axe) need mirroring so the cutting edge leads the swing instead
    // of raking with the back of the blade.
    const flipX = item?.flipX ?? false;

    // A BURNING item keeps its own warm tint at full strength: it is a light source, not a lit
    // surface, so the night must not dim it. Everything else stands in the world's light.
    const litTint = swingTint(this.lightLevel);
    // hide trails until first onUpdate (they mirror the main sprite's texture/frame)
    const trailTint = onFire ? 0xff5500 : litTint;
    this.trails.forEach(t => t.setTexture(texture, frame).setFlipX(flipX).setAlpha(0).setVisible(false).setTint(trailTint));

    this.sprite
      .setTexture(texture, frame)
      .setFlipX(flipX)
      .setTint(onFire ? 0xffaa44 : litTint)
      .setPosition(this.slashHandleX, this.slashHandleY)
      .setDisplaySize(size * 1.20, size * 1.20) // starts 20% bigger for impact pop
      .setAngle(startAngle)
      .setAlpha(1)
      .setVisible(true);

    const targetScale = this.sprite.scaleX / 1.20;

    this.scene.tweens.add({
      targets: this.sprite,
      angle:  endAngle,
      scaleX: targetScale,
      scaleY: targetScale,
      duration: SLASH_DURATION,
      ease: 'Power3.easeOut', // fast launch, decelerates into the hit
      onUpdate: () => { this.updateTrails(); },
      onComplete: () => {
        // fade main + trails together
        this.scene.tweens.add({
          targets: [this.sprite, ...this.trails],
          alpha: 0,
          duration: SLASH_FADE_DURATION,
          onComplete: () => {
            this.sprite.setVisible(false);
            this.trails.forEach(t => t.setVisible(false));
          },
        });
      },
    });
  }

  private updateTrails(): void {
    const currentAngle = this.sprite.angle;
    this.trails.forEach((t, i) => {
      t.setPosition(this.slashHandleX, this.slashHandleY)
        .setDisplaySize(this.slashSize, this.slashSize)
        .setAngle(currentAngle - this.trailStep * (i + 1))
        .setAlpha(TRAIL_ALPHAS[i])
        .setVisible(true);
    });
  }

  /**
   * The overhead pickaxe strike (see the notes above `CHOP_REAR_MS`): rear back, hang, drive,
   * recoil. `dx/dy` is the cardinal direction of the blow; the head lands `CHOP_IMPACT_MS` later,
   * which is where the caller must put its hit, its debris and its sound.
   */
  public chop(
    playerScreenX: number,
    playerScreenY: number,
    dx: number,
    dy: number,
    tileSize: number,
    item: { texture: string; frame: number },
  ): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.chop$);
    this.trails.forEach(t => this.scene.tweens.killTweensOf(t));

    let attack = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (attack > 180) attack -= 360;
    // Which way round the head travels. Mirrored for a westward blow: with a single fixed spin
    // the pick would wind up ahead of the hero and scoop UP through the floor into the rock.
    const spin = attack >= 0 ? 1 : -1;
    const rear   = Phaser.Math.Clamp(attack - spin * CHOP_REAR_DEG, -CHOP_REAR_CAP, CHOP_REAR_CAP);
    const bury   = attack + spin * CHOP_BURY_DEG;
    const recoil = attack - spin * CHOP_RECOIL_DEG;

    const size = Math.max(12, Math.floor(tileSize * SLASH_BLADE_FACTOR));
    // Driven away from the camera (north) or into it (south) — see CHOP_AWAY_SIZE.
    const struckSize = size * (dy < 0 ? CHOP_AWAY_SIZE : dy > 0 ? CHOP_TOWARD_SIZE : 0.94);
    const hand = (reach: number, lift = 0) => ({
      x: playerScreenX + dx * tileSize * reach,
      y: playerScreenY + dy * tileSize * reach - tileSize * lift,
    });

    const s = this.chop$;
    const carry = hand(SLASH_HANDLE_FACTOR);
    s.spin  = spin;
    s.angle = attack - spin * CHOP_CARRY_DEG; // as it sits in his hands, tipped back
    s.handX = carry.x;
    s.handY = carry.y;
    s.size  = size * 0.92;
    s.trail = 0;

    const litTint = swingTint(this.lightLevel); // stand in the world's light — see SWING_DARK
    this.sprite
      .setTexture(item.texture, item.frame)
      .setFlipX(false)
      .setTint(litTint)
      .setAlpha(1)
      .setVisible(true);
    this.trails.forEach(t =>
      t.setTexture(item.texture, item.frame).setFlipX(false).setTint(litTint).setAlpha(0).setVisible(false));
    this.applyChop();

    const reared = hand(CHOP_HAND_REAR, CHOP_HAND_LIFT);
    const struck = hand(CHOP_HAND_STRIKE);
    const rested = hand(CHOP_HAND_REST, 0.04);

    // 1. Rear back: slow, decelerating into the hang — the pick is heavy and he is winding up.
    //    It grows as it comes up over his head (it is nearer the camera up there).
    this.scene.tweens.add({
      targets: s,
      angle: rear,
      handX: reared.x,
      handY: reared.y,
      size: size * 1.16,
      duration: CHOP_REAR_MS,
      ease: 'Sine.easeOut',
      onUpdate: () => this.applyChop(),
      onComplete: () => {
        // 2. Hang (the tween's delay), then 3. drive: accelerating all the way into the stone,
        //    smearing a motion-blur trail behind it, and shortening as it foreshortens into the
        //    ground. `size` snapping back under 1× on the last frames is the impact.
        this.scene.tweens.add({
          targets: s,
          angle: bury,
          handX: struck.x,
          handY: struck.y,
          size: struckSize,
          trail: 1,
          delay: CHOP_HANG_MS,
          duration: CHOP_DRIVE_MS,
          ease: 'Cubic.easeIn',
          onUpdate: () => this.applyChop(),
          onComplete: () => {
            // 4. Recoil: the stone throws it back out. Back.easeOut overshoots — the wrists give.
            this.scene.tweens.add({
              targets: s,
              angle: recoil,
              handX: rested.x,
              handY: rested.y,
              size,
              trail: 0,
              duration: CHOP_RECOIL_MS,
              ease: 'Back.easeOut',
              onUpdate: () => this.applyChop(),
              onComplete: () => {
                this.scene.tweens.add({
                  targets: [this.sprite, ...this.trails],
                  alpha: 0,
                  duration: CHOP_FADE_MS,
                  onComplete: () => {
                    this.sprite.setVisible(false);
                    this.trails.forEach(t => t.setVisible(false));
                  },
                });
              },
            });
          },
        });
      },
    });
  }

  /** Write the chop's tweened pose onto the pick and its motion-blur ghosts. */
  private applyChop(): void {
    const s = this.chop$;
    this.sprite
      .setPosition(s.handX, s.handY)
      .setDisplaySize(s.size, s.size)
      .setAngle(s.angle);
    if (s.trail <= 0) {
      this.trails.forEach(t => t.setVisible(false));
      return;
    }
    // The ghosts hang BEHIND the head along the arc it just swept — so they trail up the way it
    // came down, which is the only reason a 70ms drive reads as fast rather than as a teleport.
    this.trails.forEach((t, i) => {
      t.setPosition(s.handX, s.handY)
        .setDisplaySize(s.size, s.size)
        .setAngle(s.angle - s.spin * CHOP_TRAIL_DEG * (i + 1))
        .setAlpha(TRAIL_ALPHAS[i] * s.trail)
        .setVisible(true);
    });
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.chop$);
    this.trails.forEach(t => {
      this.scene.tweens.killTweensOf(t);
      t.destroy();
    });
    this.sprite.destroy();
  }
}
