// What IS the scene? 106 draw calls and 45.7k triangles for a top-down pixel-art game is a lot;
// find out what they are before assuming.
export default {
  name: '_scene-graph',
  description: 'temp: break the scene down by mesh, material and triangle count',
  needsGame: true,
  async run({ driver, log }) {
    const { page } = driver;
    await driver.settle(1500);

    const out = await page.evaluate(() => {
      const w3 = window.__scene.world3d;
      const byKind = new Map();
      let meshes = 0;
      let tris = 0;
      const mats = new Set();
      const geos = new Set();
      const big = [];

      w3.scene.traverse((o) => {
        if (!o.isMesh && !o.isPoints && !o.isLine) return;
        meshes += 1;
        const g = o.geometry;
        const n = g?.index ? g.index.count / 3 : (g?.attributes?.position?.count ?? 0) / 3;
        tris += n;
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m.uuid));
        if (g) geos.add(g.uuid);
        const kind = o.name || `${o.type}:${o.geometry?.type ?? '?'}`;
        const e = byKind.get(kind) ?? { count: 0, tris: 0, visible: 0 };
        e.count += 1;
        e.tris += n;
        if (o.visible) e.visible += 1;
        byKind.set(kind, e);
        if (n > 200) big.push({ name: kind, tris: n, visible: o.visible, geo: g.type });
      });

      return {
        meshes,
        tris,
        materials: mats.size,
        geometries: geos.size,
        sceneChildren: w3.scene.children.length,
        byKind: [...byKind.entries()]
          .map(([k, v]) => ({ kind: k, ...v }))
          .sort((a, b) => b.tris - a.tris)
          .slice(0, 20),
        big: big.sort((a, b) => b.tris - a.tris).slice(0, 12),
      };
    });

    log(`  ${out.meshes} drawable objects · ${Math.round(out.tris)} triangles · `
      + `${out.materials} materials · ${out.geometries} geometries · ${out.sceneChildren} scene children`);
    log('  by kind (name / count / visible / triangles):');
    for (const k of out.byKind) {
      log(`    ${String(k.kind).padEnd(30)} ${String(k.count).padStart(4)}x  vis ${String(k.visible).padStart(4)}  ${String(Math.round(k.tris)).padStart(7)} tris`);
    }
  },
};
