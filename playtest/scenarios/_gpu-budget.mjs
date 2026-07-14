// Where does the frame actually go? Measure by removing one thing at a time — the only honest
// way to attribute fragment cost, which no CPU clock can see, and draw-call cost, which no
// single section timer attributes to anyone.
//
// MUST run unthrottled, or a desktop GPU simply downclocks to meet vsync and every variant
// measures the same:  PLAYTEST_UNTHROTTLED=1 PLAYTEST_SLOWMO=0 npm run playtest -- _gpu-budget
export default {
  name: '_gpu-budget',
  description: 'temp: attribute the frame pass by pass and object group by object group',
  needsGame: true,
  async run({ driver, log }) {
    const { page } = driver;
    await driver.settle(1500);

    const out = await page.evaluate(async () => {
      const w3 = window.__scene.world3d;
      const prof = window.__prof;
      const comp = w3.composer;
      const allPasses = [...comp.passes];
      const [renderPass, bloomPass, finishPass] = allPasses;

      const quads = [];
      const terrain = [];
      w3.scene.traverse((o) => {
        if (!o.isMesh) return;
        (o.geometry?.type === 'PlaneGeometry' ? quads : terrain).push(o);
      });

      const measure = async (label) => {
        prof.start();
        await new Promise((r) => setTimeout(r, 1800));
        prof.stop();
        const r = prof.report();
        const g = (k) => r.gauges.find((x) => x.gauge === k)?.avg ?? 0;
        return {
          label,
          gpu: r.gpu ? r.gpu.p50 : -1,
          cpu: r.cpu.p50,
          dt: r.dt.p50,
          draws: Math.round(g('drawCalls')),
          tris: Math.round(g('triangles')),
        };
      };
      const setPasses = (passes) => {
        comp.passes = passes;
        passes.forEach((p, i) => { p.renderToScreen = i === passes.length - 1; });
      };
      // Hide by LAYER, not by `.visible`. Billboard3D.apply() rewrites mesh.visible from its own
      // flag every frame, so a visible=false set from out here is undone on the next frame and
      // only the objects nobody happens to touch stay hidden — which reads as "billboards are
      // nearly free". Layers are not touched by apply(), so the camera simply never sees them.
      const HIDDEN_LAYER = 31;
      const show = (list, v) => {
        list.forEach((o) => { if (!v) o.layers.set(HIDDEN_LAYER); });
        return () => list.forEach((o) => o.layers.set(0));
      };

      const results = [];
      results.push(await measure('FULL FRAME (baseline)'));

      let restore = show(quads, false);
      results.push(await measure(`  minus every billboard (${quads.length} quads)`));
      restore();

      restore = show(terrain, false);
      results.push(await measure(`  minus the terrain (${terrain.length} meshes)`));
      restore();

      setPasses([renderPass, finishPass]);
      results.push(await measure('  minus UnrealBloomPass'));

      setPasses([renderPass, bloomPass]);
      results.push(await measure('  minus FinishShader (DoF/vignette/grain)'));

      setPasses([renderPass]);
      results.push(await measure('  minus the whole post chain'));

      setPasses(allPasses);
      results.push(await measure('FULL FRAME (restored)'));

      return {
        results,
        quads: quads.length,
        terrain: terrain.length,
        size: [w3.renderer.domElement.width, w3.renderer.domElement.height],
        pixelScale: w3.params.pixelScale,
      };
    });

    log(`  render target ${out.size[0]}x${out.size[1]} (pixelScale ${out.pixelScale}) · `
      + `${out.quads} billboard quads · ${out.terrain} terrain meshes`);
    log('');
    log('  variant                                     gpu      cpu       dt   draws      tris');
    for (const r of out.results) {
      log(`  ${r.label.padEnd(40)} ${String(r.gpu).padStart(6)}ms ${String(r.cpu).padStart(6)}ms `
        + `${String(r.dt).padStart(6)}ms ${String(r.draws).padStart(6)} ${String(r.tris).padStart(9)}`);
    }
  },
};
