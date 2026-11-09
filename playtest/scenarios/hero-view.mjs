// The hero has no 2D GameObject any more: he is plain state (HeroView) drawn by the 3D
// billboard alone. Everything the old invisible sprite used to carry — the walk cycle, the
// facing flip and the idle breathing — now has to come from that state. This walks each one and
// watches the billboard. (The knockback, the hurt blink and the death stand-in left the game with
// the combat; their asserts went with them.)
export default {
  name: 'hero-view',
  description: 'Walk cycle, flip, the item on the back and the breathing that keeps the feet planted.',
  needsGame: true,
  async run({ driver, shot, assert }) {
    const { page } = driver;

    const hero = () => page.evaluate(() => {
      const g = window.gameDebug;
      const h = g.hero.view();
      const b = g.hero.billboard();
      return {
        x: h.x, y: h.y, frame: h.frame, flipX: h.flipX, alpha: h.alpha, tint: h.tint,
        scaleY: h.scaleY, walking: h.walking, sizePx: h.sizePx,
        bbY: b?.y, bbVisible: b?.visible, bbFrame: b?.texKey, bbAlpha: b?.alpha,
        centreX: g.scene.cameraCentreX(),
      };
    });

    // ── Walk cycle ───────────────────────────────────────────────────────────
    // The engine's animation component used to cycle the frame; a hand-rolled ticker does it now.
    // Sample the frame across a horizontal step: it must actually move through the walk frames.
    const frames = await page.evaluate(async () => {
      const g = window.gameDebug;
      const seen = new Set();
      const t0 = performance.now();
      // Hold "right" long enough for a couple of steps, sampling the frame each rAF.
      const ev = (type) => {
        const e = new KeyboardEvent(type, { key: 'ArrowRight', code: 'ArrowRight', bubbles: true });
        Object.defineProperty(e, 'keyCode', { get: () => 39 });
        window.dispatchEvent(e);
      };
      ev('keydown');
      while (performance.now() - t0 < 900) {
        seen.add(g.hero.view().frame);
        await new Promise((r) => requestAnimationFrame(r));
      }
      ev('keyup');
      return [...seen].sort();
    });
    assert('Walk cycle animates the hero frame', frames.length >= 2, `frames seen: ${frames}`);
    assert('Walk frames are the walk set (0..3)', frames.every((f) => f >= 0 && f <= 3), `${frames}`);

    await driver.settle(400);
    const afterRight = await hero();
    assert('Facing right does not flip the sprite', afterRight.flipX === false, `flipX=${afterRight.flipX}`);
    assert('Walk cycle stopped when the step ended', afterRight.walking === false, `walking=${afterRight.walking}`);

    await driver.walk('left', 1);
    await driver.settle(400);
    const afterLeft = await hero();
    assert('Facing left flips the sprite', afterLeft.flipX === true, `flipX=${afterLeft.flipX}`);
    await shot('walked', { note: 'after walking right then left' });

    // ── The item slung on the back ───────────────────────────────────────────
    // The item billboard is CENTRED, so its -35° tilt pivots about its middle. With the
    // default foot origin it pivoted about its bottom edge and the blade swung clean out of
    // the hero's silhouette. Facing down, the body should hide all but the tip.
    await page.evaluate(() => {
      const g = window.gameDebug;
      g.items.hold('sword');
      g.fire.douse();
    });
    await driver.settle(400);
    await shot('back-item', { note: 'sword slung on the back: only the tip clears the shoulder' });

    // ── Breathing: the feet must stay planted ────────────────────────────────
    // The old sprite flipped its origin to the bottom to grow upward; the billboard already
    // stands on its feet. If the foot line moves while breathing, the hero visibly hops.
    await driver.settle(1200); // let the idle breathing tween get going
    const breath = await page.evaluate(async () => {
      const g = window.gameDebug;
      const feet = [];
      const scales = [];
      for (let i = 0; i < 45; i++) {
        feet.push(g.hero.billboard().y);
        scales.push(g.hero.view().scaleY);
        await new Promise((r) => requestAnimationFrame(r));
      }
      const span = (a) => Math.max(...a) - Math.min(...a);
      return { footSpan: span(feet), scaleSpan: span(scales) };
    });
    assert('Idle breathing is stretching the hero', breath.scaleSpan > 0.001, `scaleY span=${breath.scaleSpan}`);
    assert(
      'Breathing keeps the feet planted (no hop)',
      breath.footSpan < 0.002,
      `billboard foot moved ${breath.footSpan} tiles while breathing`,
    );

    // At rest the hero sits on the camera's centre, at full alpha and with no tint.
    const settled = await hero();
    assert('At rest the hero is centred on the camera', Math.abs(settled.x - settled.centreX) < 1, `x=${settled.x} centre=${settled.centreX}`);
    assert('At rest the hero is fully opaque and untinted', settled.alpha === 1 && settled.tint === null, `alpha=${settled.alpha} tint=${settled.tint}`);
  },
};
