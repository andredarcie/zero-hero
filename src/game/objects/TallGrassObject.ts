import Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d, type FireLight3D } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// Tall grass ("mato alto") blocks its tile and sways in the wind. The scythe cuts it — a
// short cutting animation plays and it settles into low stubble (which keeps a gentler
// wind sway) — and fire burns it to the same stubble, charred. Collision is owned here
// (see `blocking`), like the other runtime props.

const WIND_FRAME_MS = 420;
const TALL_WIND = ['tall-grass-wind-0', 'tall-grass-wind-1'] as const;
const CUT_WIND = ['cut-grass-wind-0', 'cut-grass-wind-1'] as const;

const CUTTING_FRAME_MS = 90;
const CUTTING = ['cutting-grass-0', 'cutting-grass-1', 'cutting-grass-2', 'cutting-grass-3'] as const;

const BURN_MS = 1700; // licking flames, then it settles into charred stubble
const FIRE_FRAME_MS = 110;
const FIRE_KEYS = ['tiny-fire-0', 'tiny-fire-1', 'tiny-fire-2'] as const;

// The grass BURNS — it does not turn into a picture of fire. The old ignite() swapped the
// grass billboard for the grass_fre_* art, a near-black card with a few ember specks; upright
// and camera-facing, it read as a sheet of paper floating over the tile, and no amount of
// emissive was going to fix a texture that is mostly black. So: the grass stays grass and
// chars from green to ash, exactly like DryBushObject, and the FLAMES are separate little
// tiny-fire billboards licking up off it — the same flame art the campfire and the torch use.
//
// Grass burns low and wide, not tall like a bush: the flames sit close to the ground, spread
// across the tile, and each runs a frame out of phase so the patch flickers instead of
// pulsing in lockstep.
const FIRE_SPOTS = [
  { ox: -0.24, oy: 0.08, scale: 0.42, phase: 0 },
  { ox: 0.22, oy: 0.12, scale: 0.36, phase: 1 },
  { ox: -0.02, oy: -0.04, scale: 0.5, phase: 2 },
] as const;

// Burning grass IS a light source — the same warm firelight model as a campfire or a burning
// bush, just lower and briefer.
const BURN_LIGHT_SCALE = 0.42; // under the bush's 0.55: grass burns low and fast
const grassLightCurve = (p: number): number =>
  (p < 15 ? p / 15 : p < 70 ? 1 : Math.max(0, (100 - p) / 30));

const WHITE = new Phaser.Display.Color(255, 255, 255);
const ASH = new Phaser.Display.Color(88, 84, 80);
const CHARRED_TINT = 0x585450;

type GrassState = 'tall' | 'cutting' | 'burning' | 'cut';

export class TallGrassObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D;
  private fires: Billboard3D[] = [];
  private fireLight?: FireLight3D;
  private fireFrame = 0;
  private state: GrassState = 'tall';
  private charred = false;
  private windFrame = 0;
  private windTimer: Phaser.Time.TimerEvent;
  private actionTimer?: Phaser.Time.TimerEvent;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    // FLAT on the ground, like the lava and the river — not standing up.
    //
    // grass_wind0.png is a TOP-DOWN tile with an opaque dark background (the same family of
    // art as lava_floor and water_*). Stood upright as a camera-facing billboard it could only
    // ever read as a sheet of dark paper hovering over the tile, casting a hard shadow behind
    // it — which is exactly what it looked like. A top-down texture belongs on the floor.
    //
    // It still BLOCKS (see `blocking`): this is a thicket you push through, not a wall you see
    // over, and the fire that runs across it now visibly runs across the GROUND.
    this.sprite = world3d()
      .addBillboard(TALL_WIND[0], 0, { flat: true, flatY: 0.02 })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1);

    // Desynchronize neighbouring patches so a field doesn't sway in lockstep.
    this.windFrame = Phaser.Math.Between(0, 1);
    this.windTimer = scene.time.addEvent({
      delay: WIND_FRAME_MS + Phaser.Math.Between(-60, 60),
      callback: this.advanceWind,
      callbackScope: this,
      loop: true,
    });
  }

  public get blocking(): boolean {
    return this.state === 'tall' || this.state === 'burning';
  }

  public get isTall(): boolean {
    return this.state === 'tall';
  }

  /** Scythe swing: play the cutting animation, then settle into passable stubble. */
  public cut(): boolean {
    if (this.state !== 'tall') return false;
    this.state = 'cutting';

    let frame = 0;
    this.sprite.setTexture(CUTTING[0]);
    this.actionTimer?.destroy();
    this.actionTimer = this.scene.time.addEvent({
      delay: CUTTING_FRAME_MS,
      repeat: CUTTING.length - 1,
      callback: () => {
        frame += 1;
        if (frame < CUTTING.length) this.sprite.setTexture(CUTTING[frame]);
        if (frame >= CUTTING.length - 1) this.toCut(false);
      },
    });
    return true;
  }

  /** Fire (flaming item / bomb / a neighbour alight): burn, then settle into charred stubble. */
  public ignite(): boolean {
    if (this.state !== 'tall') return false;
    this.state = 'burning';

    // The grass keeps being grass — it just catches. Flames are separate emissive billboards
    // licking up off the blades (see FIRE_SPOTS), so nothing ever becomes a flat card of fire.
    this.actionTimer?.destroy();
    for (let i = 0; i < FIRE_SPOTS.length; i += 1) {
      const spot = FIRE_SPOTS[i];
      const fire = world3d()
        .addBillboard(FIRE_KEYS[i % FIRE_KEYS.length], 0, { emissive: true })
        .setPosition(this.worldX + spot.ox, this.worldY + spot.oy)
        .setDisplaySize(spot.scale, spot.scale * 1.25);
      this.fires.push(fire);
    }
    this.actionTimer = this.scene.time.addEvent({
      delay: FIRE_FRAME_MS,
      callback: this.advanceFire,
      callbackScope: this,
      loop: true,
    });

    // Real firelight while it burns — borrowed from the pool, never a new THREE light (adding
    // one mid-run recompiles every lit material in the world; see World3D.FIRE_LIGHT_SLOTS).
    this.fireLight = world3d().addFireLight(this.worldX, this.worldY, true);
    this.fireLight.setIntensityScale(0);

    // Char the blades from green to ash across the burn, with the light riding the same clock.
    this.scene.tweens.addCounter({
      from: 0,
      to: 100,
      duration: BURN_MS,
      onUpdate: (tween) => {
        const progress = tween.getValue() ?? 0;
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(WHITE, ASH, 100, progress);
        this.sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
        this.fireLight?.setIntensityScale(BURN_LIGHT_SCALE * grassLightCurve(progress));
      },
      onComplete: () => this.toCut(true),
    });

    return true;
  }

  private advanceFire(): void {
    this.fireFrame += 1;
    this.fires.forEach((fire, i) => {
      fire.setTexture(FIRE_KEYS[(this.fireFrame + FIRE_SPOTS[i].phase) % FIRE_KEYS.length]);
    });
  }

  /** Brief rustle for a bump without the scythe, so it reads as solid. */
  public shake(): void {
    if (this.state !== 'tall') return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -5, to: 5 },
      duration: 60,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  private toCut(charred: boolean): void {
    this.state = 'cut';
    this.charred = charred;
    this.actionTimer?.destroy();
    this.actionTimer = undefined;
    this.fires.forEach((fire) => fire.destroy());
    this.fires = [];
    this.fireLight?.destroy(); // the curve already faded it out — just release the pool slot
    this.fireLight = undefined;

    // The stubble is the same flat ground quad, just the cut art (and charred if fire did the
    // cutting) — no resize, because a flat quad is already lying down.
    this.sprite.setTexture(CUT_WIND[this.windFrame % CUT_WIND.length]);
    if (charred) this.sprite.setTint(CHARRED_TINT).setAlpha(0.85);
  }

  private advanceWind(): void {
    this.windFrame = (this.windFrame + 1) % 2;
    if (this.state === 'tall') this.sprite.setTexture(TALL_WIND[this.windFrame]);
    else if (this.state === 'cut') this.sprite.setTexture(CUT_WIND[this.windFrame]);
  }

  public render(_tileSize: number, _camera: WorldCamera): void {
    // Static in world space — the 3D camera does the moving now.
  }

  public destroy(): void {
    this.windTimer.destroy();
    this.actionTimer?.destroy();
    this.fires.forEach((fire) => fire.destroy());
    this.fires = [];
    this.fireLight?.destroy();
    this.fireLight = undefined;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
