// The walk used to be a chain of per-tile tweens eased `Sine.Out`, and touch drove it through a
// key-repeat engine of its own. Both are measurable, and both were bad:
//
//   * `Sine.Out` drops the speed to ZERO at the end of every tile, and the next tween was only
//     born in the following update() — so a straight walk was a lurch, with a dead frame per tile.
//   * touch queued a step every 140ms against a step that took 87ms, so the hero stood still ~53ms
//     on every tile: the phone walked ~40% slower than the keyboard, and juddered.
//   * the walk cycle restarted on every step (setHeroWalking resets on the not-walking→walking
//     edge, and the tween's onComplete cleared it), so at 87ms a tile it never got past frame 1.
//
// This measures the walk rather than eyeballing it: sample the camera every frame and look at how
// much the per-frame speed varies. A constant-speed walk has a tight spread; a lurch does not.
//
// A wall would poison every one of those numbers (a hero jammed against rock reads as a hero who
// has stalled), so each run first picks a lane it can actually finish.

/**
 * Hold a direction for `tiles` tiles' worth of time, sampling the camera every frame.
 * `useTouch` drives the same run through a synthetic drag instead of the keyboard.
 */
const SAMPLE = `async (dir, tiles, useTouch) => {
  const s = window.__scene;
  const KEY = {
    left:  ['ArrowLeft', 37, -1, 0], right: ['ArrowRight', 39, 1, 0],
    up:    ['ArrowUp',   38, 0, -1], down:  ['ArrowDown', 40, 0, 1],
  }[dir];
  const [keyName, keyCode, dx, dy] = KEY;

  const key = (type) => {
    const e = new KeyboardEvent(type, { key: keyName, code: keyName, bubbles: true });
    Object.defineProperty(e, 'keyCode', { get: () => keyCode });
    window.dispatchEvent(e);
  };
  const touch = (type, x, y) => {
    const t = new Touch({ identifier: 7, target: document.body, clientX: x, clientY: y });
    window.dispatchEvent(new TouchEvent(type, {
      changedTouches: [t], touches: type === 'touchend' ? [] : [t], bubbles: true,
    }));
  };

  const ox = window.innerWidth / 2, oy = window.innerHeight / 2;
  if (useTouch) {
    touch('touchstart', ox, oy);
    // A real thumb travels rather than teleporting; drag out along the direction and hold there.
    for (let i = 1; i <= 6; i++) touch('touchmove', ox + dx * i * 8, oy + dy * i * 8);
  } else {
    key('keydown');
  }

  const horizontal = dx !== 0;
  const camAt = () => (horizontal ? s.camera.camX : s.camera.camY);
  const tileAt = () => (horizontal ? s.playerWorld.worldX : s.playerWorld.worldY);

  const startTile = tileAt();
  const samples = [];
  const frames = new Set();
  const bobs = [];

  // Sample from inside the game's own POST_UPDATE, not from a rAF of our own. Two rAF callbacks
  // on one frame have no fixed order, so an outside sampler reads the camera and the clock on
  // either side of the game's step and the pairing drifts — a rock-steady walk then measures as a
  // 2× speed swing. Here the distance and the delta are the same frame's, by construction.
  let prev = camAt();
  const onFrame = (_t, delta) => {
    const at = camAt();
    if (delta > 0) samples.push({ dist: Math.abs(at - prev), dt: delta });
    frames.add(s.hero.frame);
    bobs.push(s.hero.bobLift);
    prev = at;
  };
  s.events.on('postupdate', onFrame);

  const deadline = performance.now() + tiles * 140 + 200;
  while (performance.now() < deadline) {
    // Stop the moment a wall comes into view. A hero jammed against rock reads exactly like a
    // hero who has stalled, and it would poison every number below.
    if (s.isSolidForEntities(s.playerWorld.worldX + dx, s.playerWorld.worldY + dy, false)) break;
    await new Promise((r) => requestAnimationFrame(r));
  }

  s.events.off('postupdate', onFrame);
  const tilesMoved = Math.abs(tileAt() - startTile);
  if (useTouch) touch('touchend', ox + dx * 48, oy + dy * 48);
  else key('keyup');

  // Drop the first few frames: they cover the press itself, not the walk that follows it.
  const walk = samples.slice(3);
  const speeds = walk.map((x) => x.dist / (x.dt / 1000)); // tiles/s
  const totalDist = walk.reduce((a, x) => a + x.dist, 0);
  const totalMs = walk.reduce((a, x) => a + x.dt, 0);
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const sd = Math.sqrt(speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length);
  return {
    tilesPerSec: totalDist / (totalMs / 1000),
    cv: sd / mean,                                            // 0 = a perfectly constant speed
    stalledPct: walk.filter((x) => x.dist < 1e-6).length / walk.length,
    frames: [...frames].sort(),
    bobPeak: Math.max(...bobs),
    tilesMoved,
  };
}`;

/** The longest clear run, in tiles, in each cardinal direction from where the hero stands. */
const CLEAR_RUNS = `(max) => {
  const s = window.__scene;
  const out = {};
  for (const [dir, dx, dy] of [['right', 1, 0], ['left', -1, 0], ['down', 0, 1], ['up', 0, -1]]) {
    let n = 0;
    while (n < max && !s.isSolidForEntities(
      s.playerWorld.worldX + dx * (n + 1), s.playerWorld.worldY + dy * (n + 1), false,
    )) n++;
    out[dir] = n;
  }
  return out;
}`;

export default {
  name: 'movement-feel',
  description: 'The walk runs at a constant speed, touch matches the keyboard, the legs turn over.',
  needsGame: true,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    const sample = (dir, tiles, touch = false) =>
      page.evaluate(`(${SAMPLE})('${dir}', ${tiles}, ${touch})`);
    const clearRuns = (max = 10) => page.evaluate(`(${CLEAR_RUNS})(${max})`);

    // A skeleton wandering into the lane blocks the hero, and a blocked hero reads exactly like a
    // stalled one. Clear them out; this scenario is about the walk, not about combat.
    await page.evaluate(() => window.__scene.enemyManager?.despawnAll());
    await driver.settle(300);

    // Each run below leaves the hero wherever the wall stopped him, which would leave the next one
    // measuring a lane it never checked. So every phase starts from the same measured tile: put him
    // back on it first, and no run has to reason about what the one before it did.
    const home = await page.evaluate(() => ({ ...window.__scene.playerWorld }));
    const goHome = async () => {
      await page.evaluate((h) => {
        const s = window.__scene;
        s.playerWorld = { worldX: h.worldX, worldY: h.worldY };
        s.movementController.syncPlayerToWorld(h.worldX, h.worldY, s.tileSize);
      }, home);
      await driver.settle(250); // and let the last walk's stride settle, so it can't bleed onward
    };
    const runs = await clearRuns();

    // ── Walking up and down is animated at all ───────────────────────────────
    // Vertical movement used to hold ONE frozen frame — and with the hero pinned dead centre of
    // the screen, that meant nothing about him moved at all. Down runs the front-facing cycle
    // (that IS what the art is); up has a single frame of his back, so it lives on the bob.
    assert(
      'Found vertical room to measure the up/down walk in',
      runs.down >= 2 && runs.up >= 2,
      `clear tiles from the hero: ${JSON.stringify(runs)}`,
    );

    const vLane = Math.min(runs.down, runs.up, 5);
    const down = await sample('down', vLane);
    // A short lane can't fit a whole 3.2-tile stride, so this asks only that the legs move at
    // all — which is the regression: walking down used to hold frame 3 and nothing else.
    assert(
      'Walking down animates the legs',
      down.frames.length >= 2,
      `frames seen walking down: [${down.frames}] — it used to hold frame 3 alone`,
    );
    await goHome();
    const up = await sample('up', vLane);
    assert(
      'Walking up bounces, since its art is a single frame',
      up.bobPeak > 0.01,
      `bob peaked at ${up.bobPeak.toFixed(3)} tiles — no bob existed at all before`,
    );

    // ── The walk holds one speed ─────────────────────────────────────────────
    const across = runs.right >= runs.left ? 'right' : 'left';
    assert(
      'Found a lane long enough to measure a walk in',
      runs[across] >= 4,
      `clear tiles from the hero: ${JSON.stringify(runs)}`,
    );
    const lane = Math.min(runs[across], 7);

    // The old chain of `Sine.Out` tweens braked to a standstill at the end of every tile, and lost
    // a whole frame between tweens on top of that. A constant-speed walk barely varies at all.
    await goHome();
    const kb = await sample(across, lane);
    assert(
      'The walk covers the ground it was asked to',
      kb.tilesMoved >= lane - 1,
      `moved ${kb.tilesMoved} of ${lane} tiles ${across} — a wall would invalidate the run`,
    );
    assert(
      'The walk holds one speed (no per-tile braking)',
      kb.cv < 0.2,
      `speed varies by cv=${kb.cv.toFixed(2)} — mean ${kb.tilesPerSec.toFixed(1)} tiles/s`,
    );
    assert(
      'No frame is spent standing still mid-walk',
      kb.stalledPct < 0.03,
      `${(kb.stalledPct * 100).toFixed(0)}% of frames did not move`,
    );

    // ── The legs actually turn over ──────────────────────────────────────────
    // The cycle used to restart on every tile, so it never reached frame 2 or 3: the hero walked
    // on the spot. It is driven by distance now, so a stride survives a tile boundary.
    assert(
      'The walk cycle runs its whole stride',
      kb.frames.length >= 3,
      `frames seen while walking: [${kb.frames}] — the full set is [0,1,2,3]`,
    );
    assert(
      'The walk bounces',
      kb.bobPeak > 0.01,
      `bob peaked at ${kb.bobPeak.toFixed(3)} tiles`,
    );

    await shot('walking', { note: 'mid-stride: the walk cycle and the bob are live' });

    // ── Touch walks like the keyboard ────────────────────────────────────────
    // This is the whole mobile complaint. Same gesture as before (drag out and hold), but it now
    // feeds the same held direction a key does, instead of a 280ms-then-every-140ms repeat timer.
    // The identical lane, so the two numbers are comparable and nothing else differs.
    await goHome();
    const touch = await sample(across, lane, true);
    assert(
      'The drag walks the hero',
      touch.tilesMoved >= lane - 1,
      `drag moved ${touch.tilesMoved} of ${lane} tiles ${across}`,
    );
    const ratio = touch.tilesPerSec / kb.tilesPerSec;
    assert(
      'Touch walks at the same speed as the keyboard',
      ratio > 0.9 && ratio < 1.1,
      `touch ${touch.tilesPerSec.toFixed(1)} vs keyboard ${kb.tilesPerSec.toFixed(1)} tiles/s `
        + `(${((ratio - 1) * 100).toFixed(0)}%)`,
    );
    assert(
      'Touch does not stall between tiles',
      touch.stalledPct < 0.03,
      `${(touch.stalledPct * 100).toFixed(0)}% of frames frozen`,
    );

    // ── A tap during a step is not eaten ─────────────────────────────────────
    // Input used to be ignored outright while a step was in flight: `if (isMoving) return`.
    //
    // The taps have to be HELD for a few frames. Phaser's Key.onUp clears `_justDown`, so a
    // press and release inside one frame is erased before the game's JustDown() poll can ever
    // see it — see the same warning in GameDriver.press. A real thumb holds a key for dozens of
    // frames; only a synthetic one can be this fast.
    await goHome();
    const buffered = await page.evaluate(async () => {
      const s = window.__scene;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const key = (type, name, code) => {
        const e = new KeyboardEvent(type, { key: name, code: name, bubbles: true });
        Object.defineProperty(e, 'keyCode', { get: () => code });
        window.dispatchEvent(e);
      };
      const tap = async (name, code, holdMs = 30) => {
        key('keydown', name, code);
        await wait(holdMs);
        key('keyup', name, code);
      };
      const free = (dx, dy) => !s.isSolidForEntities(
        s.playerWorld.worldX + dx, s.playerWorld.worldY + dy, false,
      );
      // Pick a horizontal opener with a free tile below it, so neither leg can hit a wall.
      const openers = [[1, 0, 'ArrowRight', 39], [-1, 0, 'ArrowLeft', 37]]
        .filter(([dx]) => free(dx, 0) && free(dx, 1) && free(0, 1));
      if (openers.length === 0) return { skipped: true };
      const [, , name, code] = openers[0];

      const before = { x: s.playerWorld.worldX, y: s.playerWorld.worldY };
      await tap(name, code);
      // DOWN lands squarely inside the ~100ms step the tap above has just started.
      await tap('ArrowDown', 40);
      await wait(600);
      return { before, after: { x: s.playerWorld.worldX, y: s.playerWorld.worldY } };
    });
    if (buffered.skipped) {
      assert('Tap-during-step: no clear corner to test it in', true, 'skipped');
    } else {
      assert(
        'A tap landing mid-step still gets its tile',
        buffered.after.y === buffered.before.y + 1,
        `y went ${buffered.before.y} → ${buffered.after.y}: the buffered DOWN should have landed`,
      );
    }

    // ── Standing still is standing still ─────────────────────────────────────
    await driver.settle(400);
    const idle = await page.evaluate(() => ({
      walking: window.__scene.hero.walking,
      bob: window.__scene.hero.bobLift,
    }));
    assert(
      'The bob drops when the walk ends',
      idle.walking === false && idle.bob === 0,
      `walking=${idle.walking} bob=${idle.bob}`,
    );
  },
};
