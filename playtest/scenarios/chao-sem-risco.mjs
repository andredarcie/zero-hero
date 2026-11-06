// CHÃO SEM RISCO — o chão não muda de cor numa linha reta de um tile para o outro (pedido do autor). Mede na
// própria geometria do mundo, o mapa inteiro:
//
//  1. Onde dois pedaços de chão se encostam (o chão comum, o beiço da serra, a margem dos lagos, a borda do
//     calçamento), o mesmo ponto tem a MESMA cor — bioma × sombra de canto. Só se aceita a diferença entre o topo
//     de pedra de uma montanha e o topo de grama de um planalto, que são dois materiais.
//  2. Nenhum tile de grama ou de terra ilhado (um quadrado de quatro bordas retas no meio do outro tipo).
//  3. Nenhum quadro de chão inteiro (grama, terra) posto como enfeite na camada de decoração.
//
// Tira fotos dos lugares onde o defeito aparecia, para o olho conferir.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'chao-sem-risco',
  description: 'O chão não muda de cor numa linha reta: emendas, tiles ilhados e enfeites de tile inteiro.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);

    const seams = await page.evaluate(() => {
      const w3 = window.__scene.world3d;
      const meshes = w3.terrainMeshes.filter((m) => {
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        return mat?.vertexColors && m.geometry.getAttribute('color') && m.geometry.getAttribute('normal');
      });
      // O material do chão é o que mais vértices tem.
      const weight = new Map();
      for (const m of meshes) {
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        weight.set(mat, (weight.get(mat) ?? 0) + m.geometry.getAttribute('position').count);
      }
      const ground = [...weight.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const pts = new Map();
      for (const m of meshes) {
        if ((Array.isArray(m.material) ? m.material[0] : m.material) !== ground) continue;
        const pos = m.geometry.getAttribute('position');
        const col = m.geometry.getAttribute('color');
        const nrm = m.geometry.getAttribute('normal');
        for (let i = 0; i < pos.count; i += 1) {
          if (nrm.getY(i) < 0.9) continue;
          const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
          if (x < -0.5 || x > 59.5 || z < -0.5 || z > 59.5) continue;
          const k = `${Math.round(x * 1000)},${Math.round(y * 100)},${Math.round(z * 1000)}`;
          const at = pts.get(k) ?? { x, y, z, list: [] };
          at.list.push([col.getX(i), col.getY(i), col.getZ(i)]);
          pts.set(k, at);
        }
      }
      const bad = [];
      for (const { x, y, z, list } of pts.values()) {
        let worst = 0;
        for (let a = 0; a < list.length; a += 1) for (let b = a + 1; b < list.length; b += 1) {
          worst = Math.max(worst, ...[0, 1, 2].map((j) => Math.abs(list[a][j] - list[b][j])));
        }
        if (worst > 0.03) bad.push({ x, y, z, worst });
      }
      return bad;
    });
    // A pedra de cima de uma montanha encostada na grama de um planalto: dois materiais, não um risco.
    const material = await page.evaluate((list) => {
      const s = window.__scene;
      return list.map((p) => {
        const near = [[0, 0], [-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]].map(([dx, dz]) => [Math.round(p.x + dx), Math.round(p.z + dz)]);
        return near.some(([x, z]) => s.world3d.solidTiles?.some((t) => t.x === x && t.z === z && (t.frame === 39 || t.frame === 40)));
      });
    }, seams);
    const real = seams.filter((_, i) => !material[i]);
    log(`  emendas: ${seams.length} pontos com cor diferente, ${seams.length - real.length} são pedra encostada em grama`);
    assert('1. Onde o chão se encosta, a cor é a mesma (nenhum risco reto de cor ou de sombra)', real.length === 0, JSON.stringify(real.slice(0, 8)));

    const tiles = await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => u.includes('/game/constants.ts'));
      const { groundFrameAt } = await import(url);
      const earth = (x, y) => groundFrameAt(5, x, y) !== 5;
      const isolated = [];
      for (let y = 1; y < 59; y += 1) {
        for (let x = 1; x < 59; x += 1) {
          const me = earth(x, y);
          const same = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => earth(x + dx, y + dy) === me).length;
          if (same === 0) isolated.push([x, y]);
        }
      }
      const world = await (await fetch('/world.json', { cache: 'no-store' })).json();
      const GROUND_ART = new Set([5, 6, 52, 53, 54, 55, 56]);
      const decorGround = [];
      for (const c of world.chunks) {
        c.upper.forEach((row, ly) => row.forEach((f, lx) => {
          if (GROUND_ART.has(f)) decorGround.push([c.cx * world.meta.chunkColumns + lx, c.cy * world.meta.chunkRows + ly, f]);
        }));
      }
      return { isolated, decorGround };
    });
    assert('2. Nenhum tile de grama ou terra ilhado no meio do outro tipo', tiles.isolated.length === 0, JSON.stringify(tiles.isolated.slice(0, 10)));
    assert('3. Nenhum tile de chão inteiro posto como enfeite', tiles.decorGround.length === 0, JSON.stringify(tiles.decorGround));

    // As fotos: o lago de lava (os selos verdes), a borda de um planalto com escada e o jardim do fim.
    for (const [name, x, y] of [['lago-de-lava', 6, 6], ['planalto-e-escada', 6, 46], ['jardim-alto', 30, 33]]) {
      await page.evaluate(([px, py]) => {
        const s = window.__scene; window.gameTime.set(0.5);
        s.playerWorld.worldX = px; s.playerWorld.worldY = py; s.movementController.interruptMovement(px, py); s.streamChunks(true);
        s.actionPrompt?.destroy(); s.actionPrompt = undefined;
        void s.dollyTo(1.5, 100);
      }, [x, y]);
      await sleep(1800);
      await shot(name, { note: `o chão em volta de (${x}, ${y})` });
    }
  },
};
