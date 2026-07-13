// Regression guard for the burning-bush stall — over the WHOLE player sequence:
// pick up the graveto → light it → set the bush alight → let it burn to ash.
//
// There were TWO stalls on that path, ~550ms each, and they had the same cause. three.js keys
// every compiled shader program on the scene's light COUNTS, so ANY scene.add(pointLight) mid-run
// throws away and recompiles every lit material in the world (ground, decor, solids, every
// billboard). Lighting the torch created its PointLight lazily → freeze. Igniting the bush added
// another → freeze. Burning out removed it → freeze again.
//
// The fix builds every light up front and hands a small fixed pool to whichever fires are nearest
// the camera (World3D: FIRE_LIGHT_SLOTS), so the count never moves.
//
// Guarding only `bush.ignite()` in isolation would have missed the torch stall entirely — which
// is exactly what happened the first time. Drive the sequence the player actually performs.
export default {
  name: 'perf-burn',
  description: 'Pick up a stick, light it, burn a bush: no shader recompiles, no dropped frames.',
  needsGame: true,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;

    const staged = await page.evaluate(() => {
      const s = window.__scene;
      const bush = s.dryBushes.find((b) => !b.isAsh);
      if (!bush) return null;
      s.__bush = bush;
      return { worldX: bush.worldX, worldY: bush.worldY, bushes: s.dryBushes.length };
    });
    assert('Found an unburnt bush to set alight', staged !== null, JSON.stringify(staged));
    if (!staged) return;

    await shot('before', { note: 'Before the sequence' });

    const run = await page.evaluate(async () => {
      const s = window.__scene;
      const w3 = s.world3d;
      const bush = s.__bush;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));

      window.__prof.spikeMs = 24;
      window.__prof.start();
      await frame();
      const lights0 = w3.lightCount;
      const programs0 = w3.rendererInfo.programs.length;

      // The real player sequence, through the real code paths.
      window.__prof.mark('pickup.wood');
      s.onCollectItem({ kind: 'wood', worldX: s.playerWorld.worldX, worldY: s.playerWorld.worldY });
      await wait(900);

      // Lighting the torch is where the FIRST stall lived: the torch PointLight was lazy.
      window.__prof.mark('torch.light');
      s.igniteHeldItem();
      await wait(900);

      s.playerWorld = { worldX: bush.worldX, worldY: bush.worldY + 1 };
      await frame();
      window.__prof.mark('bush.ignite');
      s.swingHeld(bush.worldX, bush.worldY);
      bush.ignite();
      s.spawnFireHitEffect(bush.worldX, bush.worldY);

      // Hold past BURN_MS (2200) so the burnout — which used to stall a THIRD time, when the
      // light was removed — is inside the profiled window too.
      await wait(3200);
      window.__prof.stop();

      const report = window.__prof.report();
      return {
        report,
        lights0,
        lights1: w3.lightCount,
        programs0,
        programs1: w3.rendererInfo.programs.length,
        isAsh: bush.isAsh,
        torchLit: s.isTorchLit,
      };
    });

    await shot('after', { note: 'The bush has burned down to ash' });

    const r = run.report;
    log(`  ${r.fps.toFixed(1)} fps · p99 ${r.dt.p99}ms · worst ${r.dt.max}ms · ${r.bound}-bound` +
        `${r.gpu ? ` (cpu ${r.cpu.p50}ms / gpu ${r.gpu.p50}ms)` : ''}`);
    log(`  lights ${run.lights0}→${run.lights1} · programs ${run.programs0}→${run.programs1} · heap ${r.memory.heapGrowthMb >= 0 ? '+' : ''}${r.memory.heapGrowthMb}MB`);
    for (const sp of r.spikes) log(`    SPIKE f${sp.frame} ${sp.dt}ms [${sp.marks.join(',')}] — ${sp.cause}`);

    assert('The torch lit', run.torchLit === true, `torchLit=${run.torchLit}`);
    assert('The bush burned to ash', run.isAsh === true, `isAsh=${run.isAsh}`);

    // ── The invariants the fix rests on ──────────────────────────────────────
    // Assert on these, not just on fps: a fast machine can absorb a 500ms compile without
    // dipping below the fps bar, but a mid-run compile is always a bug.
    assert(
      'Point-light count never moves (torch + ignite + burnout)',
      run.lights1 === run.lights0,
      `${run.lights0} → ${run.lights1} lights — any change recompiles EVERY lit material`,
    );
    assert(
      'No shader compiled during the sequence',
      r.programs.compiledDuringRun === 0,
      `${r.programs.compiledDuringRun} compiled (${run.programs0} → ${run.programs1} programs)`,
    );

    // ── And what the player feels ────────────────────────────────────────────
    // Assert on the FIRE frames specifically. Picking an item up carries its own ~45ms hitch
    // (the item-get overlay + audio, on main too) which has nothing to do with fire — folding
    // it into one global budget would either mask a fire regression or fail at random.
    const FIRE_MARKS = ['torch.light', 'bush.ignite', 'bush.ash'];
    const fireSpikes = r.spikes.filter((s) => s.marks.some((m) => FIRE_MARKS.includes(m)));
    assert(
      'No spike on lighting the torch, igniting the bush, or the burnout',
      fireSpikes.length === 0,
      fireSpikes.map((s) => `f${s.frame} ${s.dt}ms [${s.marks.join(',')}] ${s.cause}`).join(' | ') || 'none',
    );
    assert('No spikes attributed to a shader compile', r.spikes.every((s) => s.programsAdded === 0),
      r.spikes.map((s) => `f${s.frame}: ${s.cause}`).join(' | ') || 'none');
    // The old bug blew this by an order of magnitude (~550ms, twice), so a loose absolute bar
    // still catches any return of it while tolerating the known pickup hitch.
    assert('No frame over 100ms in the whole sequence', r.dt.max <= 100, `worst frame ${r.dt.max}ms`);
    assert('Holds 55+ fps through the sequence', r.fps >= 55, `fps=${r.fps.toFixed(1)}`);
  },
};
