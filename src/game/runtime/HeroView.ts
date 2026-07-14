import { HERO_FRAMES, TIMINGS } from '@/game/constants';

/**
 * The hero's whole visual state — plain data, no Phaser GameObject.
 *
 * The hero used to be an INVISIBLE Phaser sprite that drew nothing: it carried the state
 * (position, frame, flip, tint, alpha) and `syncHeroBillboard` mirrored it onto the 3D
 * billboard the player actually sees. Now the state simply IS the state, and the billboard
 * is its only view. Phaser still animates it — tweens take any object, not just GameObjects —
 * so the knockback shove, the hurt blink, the breathing and the death fade are untouched.
 * The one thing a plain object cannot borrow from Phaser is the animation component, so the
 * walk cycle is ticked here (see tickHeroView).
 */
export interface HeroView {
  /** Screen px: the centre pin the hero is nailed to, displaced by a knockback shove. */
  x: number;
  y: number;
  /** One tile on screen. The hero's FEET sit half a tile below (x, y). */
  sizePx: number;
  /**
   * Breathing squash/stretch, 1 = at rest. The billboard grows out of its planted feet, so
   * scaleY never shifts the foot line — the old sprite had to flip its origin to the bottom
   * (and shift y half a tile back) to get the same thing.
   */
  scaleX: number;
  scaleY: number;
  alpha: number;
  frame: number;
  flipX: boolean;
  /** null = no tint. */
  tint: number | null;
  walking: boolean;
  /**
   * Tiles walked, ever. The walk cycle and the bob are driven by DISTANCE, not by time —
   * so the feet never skate when the speed changes (the shop's boots upgrade), and, above
   * all, so the cycle survives a tile boundary. It used to be a plain `walkMs` timer that
   * `setHeroWalking` reset on every step: with a 87ms step against a 12fps cycle the hero
   * barely reached frame 1 before snapping back to frame 0, so he walked on the spot.
   */
  walkDist: number;
  /**
   * The frames the walk cycle runs through, set by whoever owns the facing. The art has a
   * front-facing 4-frame cycle (0..3) and a SINGLE back-facing frame (4) — so walking up
   * has no leg cycle of its own, and leans on the bob alone for its life.
   */
  walkFrames: readonly number[];
  /** Elevation in tiles: the bounce of a footfall. The contact shadow ignores it, by design. */
  bobLift: number;
}

/** Front-facing cycle. The sides borrow it flipped — at 16px that reads fine. */
export const WALK_CYCLE_FRAMES: readonly number[] = Array.from(
  { length: HERO_FRAMES.walkEnd - HERO_FRAMES.walkStart + 1 },
  (_, i) => HERO_FRAMES.walkStart + i,
);
/** There is exactly one frame of the hero's back, so "up" holds it and bobs. */
export const WALK_CYCLE_FRAMES_UP: readonly number[] = [HERO_FRAMES.idleUp];

export const createHeroView = (): HeroView => ({
  x: 0,
  y: 0,
  sizePx: 1,
  scaleX: 1,
  scaleY: 1,
  alpha: 1,
  frame: HERO_FRAMES.idleDown,
  flipX: false,
  tint: null,
  walking: false,
  walkDist: 0,
  walkFrames: WALK_CYCLE_FRAMES,
  bobLift: 0,
});

/** Tiles covered by one frame of the cycle. Two frames = one footfall, four = a full stride. */
const TILES_PER_FRAME = TIMINGS.walkCycleTiles / 4;
const TILES_PER_FOOTFALL = TILES_PER_FRAME * 2;
/** Peak of the bounce, in tiles — about one pixel on a 16px sprite. Keep it small. */
const BOB_LIFT_TILES = 0.055;
/** Fraction of a footfall spent rising. Well under half: the hero pops up and sinks back. */
const BOB_RISE = 0.35;

/**
 * Advance the walk cycle — what Phaser's animation component used to do for the sprite.
 *
 * Driven by `walkDist`, so it is the hero's *movement* that turns his legs over rather than a
 * wall clock that happens to run alongside it.
 */
export const tickHeroView = (hero: HeroView, _deltaMs: number): void => {
  if (!hero.walking) {
    hero.bobLift = 0;
    return;
  }

  const frames = hero.walkFrames;
  hero.frame = frames[Math.floor(hero.walkDist / TILES_PER_FRAME) % frames.length];

  // The bounce. A natural walk does not ride a sine wave — it rises fast off the back foot and
  // sinks slowly onto the front one (SLYNYRD, Pixelblog 55: "down 1, down 1, up 2"). A symmetric
  // curve here reads as a robot hovering.
  const phase = (hero.walkDist / TILES_PER_FOOTFALL) % 1;
  hero.bobLift = BOB_LIFT_TILES * (phase < BOB_RISE
    ? phase / BOB_RISE
    : 1 - (phase - BOB_RISE) / (1 - BOB_RISE));
};

/** Start or stop the walk cycle. Starting restarts the stride from its first contact frame. */
export const setHeroWalking = (hero: HeroView, walking: boolean): void => {
  if (walking && !hero.walking) {
    hero.walkDist = 0;
    hero.frame = hero.walkFrames[0];
  }
  if (!walking) hero.bobLift = 0;
  hero.walking = walking;
};

/** The hero's foot line in screen px — where the billboard plants him on the ground. */
export const heroFootY = (hero: HeroView): number => hero.y + hero.sizePx * 0.5;
