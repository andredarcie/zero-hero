// 96 of the frame's 120 draw calls are billboards. Which ones, and how many of them are drawing
// nothing at all (a fire glow on a dead fire, a shadow at zero opacity)? A draw call that paints
// no pixels still costs a state change and a submit.
export default {
  name: '_quad-census',
  description: 'temp: census the billboard quads that actually reach the GPU',
  needsGame: true,
  async run({ driver, log }) {
    const { page } = driver;
    await driver.settle(1500);

    const out = await page.evaluate(() => {
      const w3 = window.__scene.world3d;
      const cam = w3.camera;
      cam.updateMatrixWorld();
      const THREE = w3.THREE ?? window.__THREE;

      // Reproduce three.js's own cull so we count what really gets submitted.
      const proj = new (cam.projectionMatrix.constructor)();
      const frustum = { planes: null };
      const m = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
      const f = new (window.__FRUSTUM ?? Object)();

      const rows = [];
      w3.scene.traverse((o) => {
        if (!o.isMesh || o.geometry?.type !== 'PlaneGeometry') return;
        if (!o.visible) return;
        const mat = o.material;
        rows.push({
          tex: mat.map?.name || mat.map?.userData?.key || mat.type,
          opacity: +(mat.opacity ?? 1).toFixed(3),
          blending: mat.blending,
          transparent: !!mat.transparent,
          depthWrite: !!mat.depthWrite,
          scale: +(o.scale.x * o.scale.y).toFixed(4),
          matType: mat.type,
        });
      });

      const zeroAlpha = rows.filter((r) => r.opacity <= 0.005).length;
      const zeroScale = rows.filter((r) => r.scale <= 1e-5).length;

      const byMat = new Map();
      for (const r of rows) {
        const k = `${r.matType} ${r.transparent ? 'transp' : 'opaque'} blend${r.blending} dw${r.depthWrite ? 1 : 0}`;
        byMat.set(k, (byMat.get(k) ?? 0) + 1);
      }

      return {
        visibleQuads: rows.length,
        zeroAlpha,
        zeroScale,
        byMat: [...byMat.entries()].sort((a, b) => b[1] - a[1]),
        materials: w3.renderer.info.memory,
      };
    });

    log(`  ${out.visibleQuads} quads flagged visible · ${out.zeroAlpha} at ZERO opacity · ${out.zeroScale} at ZERO scale`);
    for (const [k, n] of out.byMat) log(`    ${String(n).padStart(4)}x  ${k}`);
  },
};
