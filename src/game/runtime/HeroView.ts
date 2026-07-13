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
  /** Walk cycle state: only a horizontal step animates; everything else holds a frame. */
  walking: boolean;
  walkMs: number;
}

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
  walkMs: 0,
});

const WALK_FRAME_COUNT = HERO_FRAMES.walkEnd - HERO_FRAMES.walkStart + 1;
const WALK_FRAME_MS = 1000 / TIMINGS.walkFrameRate;

/** Advance the walk cycle — what Phaser's animation component used to do for the sprite. */
export const tickHeroView = (hero: HeroView, deltaMs: number): void => {
  if (!hero.walking) return;
  hero.walkMs += deltaMs;
  const step = Math.floor(hero.walkMs / WALK_FRAME_MS) % WALK_FRAME_COUNT;
  hero.frame = HERO_FRAMES.walkStart + step;
};

/**
 * Start or stop the walk cycle. Starting always restarts at the first frame, which is what
 * `play(heroWalk, true)` did: each step stopped the animation on completion, so the next one
 * began it afresh.
 */
export const setHeroWalking = (hero: HeroView, walking: boolean): void => {
  if (walking && !hero.walking) {
    hero.walkMs = 0;
    hero.frame = HERO_FRAMES.walkStart;
  }
  hero.walking = walking;
};

/** The hero's foot line in screen px — where the billboard plants him on the ground. */
export const heroFootY = (hero: HeroView): number => hero.y + hero.sizePx * 0.5;
