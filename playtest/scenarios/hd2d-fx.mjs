// HD-2D phase 5: the FX that moved out of the 2D overlay and into the 3D pipeline —
// the torch flame (an emissive billboard on the stick's tip), the danger vignette and
// the death fade (both post-chain uniforms). Each one used to be a flat image pasted
// over the canvas, outside the bloom, the grade and the tone mapping.
//
// Drives the scene straight through its own fields (window.__scene is the live GameScene
// in dev) instead of walking the hero to a torch and waiting for a siege to build.
export default {
  name: 'hd2d-fx',
  description: 'Torch-flame billboard, danger vignette and death fade in the 3D post chain.',
  needsGame: true,
  async run({ driver, shot, assert }) {
    const { page } = driver;

    // ── Torch flame ──────────────────────────────────────────────────────────
    await page.evaluate(() => {
      const s = window.__scene;
      s.heldItem = 'wood';
      s.heldOnFire = true;
      s.torchFuelMs = 60000; // a healthy flame, far from guttering
      s.updateBackItem();
    });
    await driver.settle(500);
    await shot('torch-flame', { note: 'Lit torch: the flame is a 3D emissive billboard on the tip' });

    const torch = await page.evaluate(() => {
      const bb = window.__scene.torchFlameBb;
      return bb ? { visible: bb.visible, w: bb.displayWidth, tex: bb.texKey } : null;
    });
    assert('Torch flame is a visible billboard', torch?.visible === true, JSON.stringify(torch));
    assert('Torch flame uses the tiny-fire art', String(torch?.tex).startsWith('tiny-fire'), `tex=${torch?.tex}`);

    // ── One-shot world FX (sparks, shockwaves, motes, smoke) ─────────────────
    // They used to be Phaser circles/rectangles drawn over the canvas; now they are billboards
    // living in the world. Fired straight at the scene so we don't have to stage a fight.
    const fx = await page.evaluate(() => {
      const s = window.__scene;
      const before = s.world3d.scene.children.length;
      const { worldX, worldY } = s.playerWorld;
      s.spawnHitSpark(worldX + 1, worldY, true);   // hot flash + sparks
      s.spawnDeflect(worldX - 1, worldY);          // cold shockwave + shards
      s.spawnFireHitEffect(worldX, worldY - 1);    // little fires
      s.spawnSmokePuff(worldX + 1, worldY - 1);    // grey puffs
      s.spawnHealBurst();                          // warm ground wave under the hero
      s.spawnHealMote();                           // a mote streaming fire → hero
      return { before, after: s.world3d.scene.children.length };
    });
    // The fast FX (the hit flash lives 150ms) would be long gone by the time a screenshot lands,
    // so freeze the scene mid-flight, capture, and let it go again.
    await driver.settle(90);
    await page.evaluate(() => window.__scene.scene.pause());
    await shot('world-fx', { note: 'Hit flash + sparks, shockwaves, fires, smoke, heal mote' });
    await page.evaluate(() => window.__scene.scene.resume());
    assert('One-shot FX spawned into the 3D world', fx.after > fx.before, JSON.stringify(fx));

    // ── Danger vignette (post uniform, driven by the spawn director's meter) ──
    await page.evaluate(() => { window.__scene.spawnDirector.dangerLevel = 0.95; });
    await driver.settle(150);
    await shot('danger-vignette', { note: 'Danger meter ~0.95 → red vignette inside the post' });

    const danger = await page.evaluate(
      () => window.__scene.world3d.finishPass.uniforms.uDanger.value,
    );
    assert('Danger vignette reached the post uniform', danger > 0.1, `uDanger=${danger}`);

    // ── Frame rate ────────────────────────────────────────────────────────────
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

    // ── Death fade (post uniform, replacing the 2D black rectangle) ───────────
    await page.evaluate(() => window.__scene.triggerDeath());
    await driver.settle(1800);
    await shot('death-fade', { note: 'Death: the world drains and sinks to black in the post' });

    const after = await page.evaluate(() => ({
      fade: window.__scene.world3d.finishPass.uniforms.uFade.value,
      danger: window.__scene.world3d.finishPass.uniforms.uDanger.value,
    }));
    assert('World faded to black', after.fade > 0.98, `uFade=${after.fade}`);
    assert('Danger vignette cleared on death', after.danger === 0, `uDanger=${after.danger}`);
  },
};
