import Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d, type FireLight3D } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

// Tall grass ("mato alto") blocks its tile and sways in the wind. The scythe cuts it — the tuft
// topples and settles into low stubble (which keeps a gentler wind sway) — and fire burns it to
// the same stubble, charred. Collision is owned here (see `blocking`), like the other props.
//
// The grass STANDS now. The old art (grass_wind0) was a TOP-DOWN tile with an opaque background,
// so the object had to lie flat on the ground — upright it read as a sheet of dark paper. The
// sprite factory's tall_grass_up sheet is the same olive grass REDRAWN side-on (a fan of blades
// on a transparent background, like the bush and the trees), so the tuft is finally a standing
// billboard: taller than every low prop, lit by the world's fires, swaying against the night.
// The stubble is frame 4 of the SAME sheet — the tuft mown to pale-faced stubs, not some
// unrelated ground-cover art: what the scythe leaves is recognisably this plant, shorter.

// The standing tuft is a FOUR-frame wave (spritefactory/sprites/tall-grass-up.mjs): the gust
// travels west→east through the blades, one blade dipping a frame after its neighbour — which
// is what makes wind read as weather instead of a two-frame metronome. ~300ms a frame gives
// the full wave a ~1.2s period; each tile jitters its clock and starts on a random frame, so
// a field never sways in lockstep.
const WIND_FRAME_MS = 300;
const TALL_WIND_FRAMES = 4;
const TALL_SHEET = 'tall-grass-up';
// Frame 4 of the same sheet: the tuft mown to stubs — the SAME plant after the scythe/fire,
// pale cut faces on the stems, not some unrelated ground-cover art.
const STUMP_FRAME = 4;

const TUFT_W = 0.98; // fills the tile, never overflows it (the fundamental sprite rule)
const TUFT_H = 0.98;
const CUT_COLLAPSE_MS = 210; // the mowed tuft drops out of the scythe's arc into stubble

// Standing grass OWNS its tile (it blocks), so it lives on the actor plane. The moment it is
// mown the tile opens and the hero can stand on the stump — two upright quads on one spot — so
// it moves to the GROUND depth layer as it falls. See DEPTH_LAYER in Billboard3D.

const BURN_MS = 1700; // licking flames, then it settles into charred stubble
const FIRE_FRAME_MS = 110;
const FIRE_KEYS = ['tiny-fire-0', 'tiny-fire-1', 'tiny-fire-2'] as const;

// The grass BURNS — it does not turn into a picture of fire. The blades stay grass and char
// from green to ash, and the FLAMES are separate little tiny-fire billboards — the same flame
// art the campfire and the torch use.
//
// Upright grass burns the way real grass does: it catches LOW, at the dry base, and the fire
// CLIMBS the blades — so each flame starts near the ground and rides up its `climb` over the
// burn, while the tuft itself WILTS (grass collapses as its structure burns out from under it).
// Three flames, staggered heights and phases, so the tuft flickers instead of pulsing.
const FIRE_SPOTS = [
  { ox: -0.2, elev: 0.06, scale: 0.4, phase: 0, climb: 0.34 },
  { ox: 0.18, elev: 0.12, scale: 0.34, phase: 1, climb: 0.46 },
  { ox: -0.02, elev: 0.02, scale: 0.5, phase: 2, climb: 0.6 },
] as const;
const WILT_FRAC = 0.48; // the burning tuft sinks to roughly half height before it gives way

// Burning grass IS a light source — the same warm firelight model as a campfire or a burning
// bush, just lower and briefer.
const BURN_LIGHT_SCALE = 0.42; // under the bush's 0.55: grass burns low and fast
const grassLightCurve = (p: number): number =>
  (p < 15 ? p / 15 : p < 70 ? 1 : Math.max(0, (100 - p) / 30));

const WHITE = new Phaser.Display.Color(255, 255, 255);
const ASH = new Phaser.Display.Color(88, 84, 80);
const CHARRED_TINT = 0x585450;

type GrassState = 'tall' | 'cutting' | 'burning' | 'cut';

export class TallGrassObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D; // the standing tuft — and, after the cut, its stubs
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
    // Upright, foot on its tile, lit like the bush/trees. This is a thicket you push through,
    // and now also one you SEE — it stands taller than every ground prop around it. It throws
    // a shadow like the tree does (every standing prop casts one), just softer: grass is wisps,
    // not trunk — the dry shrub set the precedent for the lighter alpha.
    this.sprite = world3d()
      .addBillboard(TALL_SHEET, 0, { groundShadow: { alpha: 0.35 } })
      .setPosition(worldX, worldY)
      .setDisplaySize(TUFT_W, TUFT_H);

    // Desynchronize neighbouring tufts so a field doesn't sway in lockstep.
    this.windFrame = Phaser.Math.Between(0, TALL_WIND_FRAMES - 1);
    this.sprite.setTexture(TALL_SHEET, this.windFrame);
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

  /** Ardendo AGORA — enquanto durar, este tile e uma fonte de calor (ver GameScene.fireHeatAt). */
  public get isBurning(): boolean {
    return this.state === 'burning';
  }

  /** Scythe swing: the tuft drops out of the arc and settles into passable stubble. */
  public cut(): boolean {
    if (this.state !== 'tall') return false;
    this.state = 'cutting';
    // The tile stops blocking NOW — the hero can step in mid-collapse, so the layer change
    // belongs to the state change, not to the stump art that arrives 210ms later.
    this.sprite.setDepthLayer('ground');
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      displayHeight: TUFT_H * 0.12,
      angle: 8, // the swathe leans with the blade as it goes down
      duration: CUT_COLLAPSE_MS,
      ease: 'Quad.easeIn',
      onComplete: () => this.toCut(false),
    });
    return true;
  }

  /** Fire (a flaming item / bomb / a neighbour alight): catch low, climb, wilt, char. */
  public ignite(): boolean {
    if (this.state !== 'tall') return false;
    this.state = 'burning';

    this.actionTimer?.destroy();
    for (let i = 0; i < FIRE_SPOTS.length; i += 1) {
      const spot = FIRE_SPOTS[i];
      const fire = world3d()
        .addBillboard(FIRE_KEYS[i % FIRE_KEYS.length], 0, { emissive: true })
        .setPosition(this.worldX + spot.ox, this.worldY)
        .setElevation(spot.elev)
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

    // One clock drives the whole burn: the blades char green→ash, the flames CLIMB from the
    // base toward the tips, the tuft wilts down as its structure gives out, and the light
    // rides the same curve. At the end the remains settle into charred flat stubble.
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.addCounter({
      from: 0,
      to: 100,
      duration: BURN_MS,
      onUpdate: (tween) => {
        const progress = tween.getValue() ?? 0;
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(WHITE, ASH, 100, progress);
        this.sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
        this.sprite.setDisplaySize(TUFT_W, TUFT_H * (1 - WILT_FRAC * (progress / 100)));
        for (let i = 0; i < this.fires.length; i += 1) {
          this.fires[i].setElevation(FIRE_SPOTS[i].elev + FIRE_SPOTS[i].climb * (progress / 100));
        }
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

  /**
   * Planted grass springing out of a watered mound (see PlantSpotObject): the blades scale in
   * with a vegetal overshoot. Only meaningful right after construction, while still 'tall'.
   */
  public sproutIn(): void {
    if (this.state !== 'tall') return;
    this.sprite.setDisplaySize(TUFT_W * 0.15, TUFT_H * 0.15);
    this.scene.tweens.add({
      targets: this.sprite,
      displayWidth: TUFT_W,
      displayHeight: TUFT_H,
      duration: 700,
      ease: 'Back.easeOut',
    });
  }

  /** Brief rustle for a bump without the scythe — the standing tuft shivers, solid. */
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

  // The tuft is down: the SAME billboard swaps to the sheet's stump frame — the same plant
  // mown to stubs (pale cut faces on the stems), charred if fire did the cutting. The blades
  // fell in the collapse/burn; the frame swap is what remains standing. Stubs don't sway.
  private toCut(charred: boolean): void {
    this.state = 'cut';
    this.charred = charred;
    this.actionTimer?.destroy();
    this.actionTimer = undefined;
    this.fires.forEach((fire) => fire.destroy());
    this.fires = [];
    this.fireLight?.destroy(); // the curve already faded it out — just release the pool slot
    this.fireLight = undefined;

    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite
      .setTexture(TALL_SHEET, STUMP_FRAME)
      .setDisplaySize(TUFT_W, TUFT_H) // undo the collapse/wilt scale — the stump art is short by itself
      .setAngle(0)
      .setDepthLayer('ground'); // the burn path skips cut(), so claim the layer here too
    if (charred) this.sprite.setTint(CHARRED_TINT).setAlpha(0.85);
  }

  private advanceWind(): void {
    this.windFrame = (this.windFrame + 1) % TALL_WIND_FRAMES;
    if (this.state === 'tall') this.sprite.setTexture(TALL_SHEET, this.windFrame);
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
