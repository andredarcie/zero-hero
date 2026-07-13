// The hero has no Phaser GameObject any more: he is plain state (HeroView) drawn by the 3D
// billboard alone. Everything the old invisible sprite used to carry — the walk cycle, the
// facing flip, the knockback shove, the hurt blink, the idle breathing and the death pose —
// now has to come from that state. This walks each one and watches the billboard.
export default {
  name: 'hero-view',
  description: 'Walk cycle, flip, knockback, hurt blink, breathing and the death stand-in.',
  needsGame: true,
  async run({ driver, shot, assert }) {
    const { page } = driver;

    const hero = () => page.evaluate(() => {
      const s = window.__scene;
      const h = s.hero;
      const b = s.heroBillboard;
      return {
        x: h.x, y: h.y, frame: h.frame, flipX: h.flipX, alpha: h.alpha, tint: h.tint,
        scaleY: h.scaleY, walking: h.walking, sizePx: h.sizePx,
        bbY: b?.y, bbVisible: b?.visible, bbFrame: b?.texKey, bbAlpha: b?.alpha,
        centreX: s.camera.screenCenterX,
        deathHero: Boolean(s.deathHero),
      };
    });

    // ── Walk cycle ───────────────────────────────────────────────────────────
    // Phaser's animation component used to cycle the frame; a hand-rolled ticker does it now.
    // Sample the frame across a horizontal step: it must actually move through the walk frames.
    const frames = await page.evaluate(async () => {
      const s = window.__scene;
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
        seen.add(s.hero.frame);
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

    // ── Breathing: the feet must stay planted ────────────────────────────────
    // The old sprite flipped its origin to the bottom to grow upward; the billboard already
    // stands on its feet. If the foot line moves while breathing, the hero visibly hops.
    await driver.settle(1200); // let the idle breathing tween get going
    const breath = await page.evaluate(async () => {
      const s = window.__scene;
      const feet = [];
      const scales = [];
      for (let i = 0; i < 45; i++) {
        feet.push(s.heroBillboard.y);
        scales.push(s.hero.scaleY);
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

    // ── Hurt: knockback shove + red blink ────────────────────────────────────
    const hurt = await page.evaluate(async () => {
      const s = window.__scene;
      const before = { x: s.hero.x, centre: s.camera.screenCenterX };
      // Take a real hit from a stand-in attacker one tile to the hero's left.
      s.handleEnemyAttackPlayer({
        worldX: s.playerWorld.worldX - 1,
        worldY: s.playerWorld.worldY,
        triggerKnockback: () => {},
        isAlive: true,
      });
      await new Promise((r) => requestAnimationFrame(r));
      const shoved = { x: s.hero.x, tint: s.hero.tint };
      return { before, shoved };
    });
    assert(
      'A hit shoves the hero off centre',
      Math.abs(hurt.shoved.x - hurt.before.centre) > 1,
      `x=${hurt.shoved.x} centre=${hurt.before.centre}`,
    );
    assert('A hit tints the hero red', hurt.shoved.tint === 0xff4444, `tint=${hurt.shoved.tint}`);
    await shot('hurt', { note: 'knockback shove + red tint' });

    // The shove eases back to centre and the blink restores full alpha.
    await driver.settle(1400);
    const settled = await hero();
    assert(
      'The shove eases the hero back to centre',
      Math.abs(settled.x - settled.centreX) < 1,
      `x=${settled.x} centre=${settled.centreX}`,
    );
    assert('The hurt blink restores alpha and clears the tint',
      settled.alpha === 1 && settled.tint === null, `alpha=${settled.alpha} tint=${settled.tint}`);

    // ── Death: the 2D stand-in takes over, the 3D body goes ──────────────────
    await page.evaluate(() => window.__scene.triggerDeath());
    await driver.settle(600);
    const dead = await hero();
    assert('Death strikes a 2D stand-in for the elegy', dead.deathHero === true);
    assert('Death hides the 3D body', dead.bbVisible === false, `bbVisible=${dead.bbVisible}`);
    await shot('death', { note: 'the 2D stand-in carries the elegy; the billboard is gone' });
  },
};
