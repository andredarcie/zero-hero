// HD-2D phase 5: the FX that moved out of the 2D overlay and into the 3D pipeline — the torch
// flame (an emissive billboard on the stick's tip) and the one-shot world FX (fire, smoke). Each
// one used to be a flat image pasted over the canvas, outside the bloom, the grade and the tone
// mapping.
//
// Drives the scene through the playtest probes (gameDebug.fire, gameDebug.render) instead of
// walking the hero to a fire. (The combat FX and the death fade this scenario also covered left
// the game with the combat; their asserts went with them.)
export default {
  name: 'hd2d-fx',
  description: 'Torch-flame billboard and the one-shot fire/smoke FX in the 3D post chain.',
  needsGame: true,
  async run({ driver, shot, assert }) {
    const { page } = driver;

    // ── Torch flame ──────────────────────────────────────────────────────────────
    await page.evaluate(() => {
      const g = window.gameDebug;
      g.items.hold('wood');
      g.fire.setOnFire(60000); // a healthy flame, far from guttering
    });
    await driver.settle(500);
    await shot('torch-flame', { note: 'Lit torch: the flame is a 3D emissive billboard on the tip' });

    const torch = await page.evaluate(() => window.gameDebug.fire.torch().flame);
    assert('Torch flame is a visible billboard', torch?.visible === true, JSON.stringify(torch));
    assert('Torch flame uses the tiny-fire art', String(torch?.texKey).startsWith('tiny-fire'), `tex=${torch?.texKey}`);

    // ── One-shot world FX (fire, smoke) ─────────────────────────────────────────
    // They used to be 2D circles/rectangles drawn over the canvas; now they are billboards
    // living in the world.
    const fx = await page.evaluate(() => {
      const g = window.gameDebug;
      const before = g.render.objects();
      const { x, y } = g.hero.at();
      g.fire.fireHit(x, y - 1);     // little fires
      g.fire.smokePuff(x + 1, y - 1); // grey puffs
      return { before, after: g.render.objects() };
    });
    // The fast FX would be long gone by the time a screenshot lands, so freeze the scene
    // mid-flight, capture, and let it go again.
    await driver.settle(90);
    await page.evaluate(() => window.gameDebug.scene.pauseScene());
    await shot('world-fx', { note: 'Fires and smoke in the 3D world' });
    await page.evaluate(() => window.gameDebug.scene.resumeScene());
    assert('One-shot FX spawned into the 3D world', fx.after > fx.before, JSON.stringify(fx));

    // ── Frame rate ───────────────────────────────────────────────────────────────
    // The post chain (bloom + DoF/finish pass) roughly doubles the fill rate, which was the
    // headline risk of the HD-2D plan. Measure it instead of assuming.
    const fps = await page.evaluate(() => new Promise((resolve) => {
      let frames = 0;
      const started = performance.now();
      const tick = () => {
        frames++;
        if (performance.now() - started >= 2000) resolve(frames / ((performance.now() - started) / 1000));
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    assert('Renders at 55+ fps with the full post chain', fps >= 55, `fps=${fps.toFixed(1)}`);
  },
};
