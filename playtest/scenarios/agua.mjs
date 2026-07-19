// Diagnostico: "a agua sumiu, so ficou o buraco" apos um tempo de jogo.
// Hipotese principal: o RESTART (botao novo / morte) reconstroi a cena e os quads d'agua
// nao voltam. Boot -> foto do rio -> restart pelo botao -> foto do rio -> compara estado.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'agua',
  description: 'Diagnostico: os quads d agua sobrevivem a um restart do level?',
  needsGame: true,
  route: '/?play&level=1',
  async run({ driver, shot, assert, log }) {
    const state = () => driver.getState();
    const waterSnapshot = () => driver.page.evaluate(() => {
      const tiles = window.__scene.waterTiles ?? [];
      const spr = (w) => {
        const s = w.sprite;
        if (!s) return null;
        return {
          alpha: s.alpha ?? null,
          visible: typeof s.visible === 'boolean' ? s.visible : (s.mesh ? s.mesh.visible : null),
          tex: s.texKey ?? null,
        };
      };
      return {
        count: tiles.length,
        hidden: tiles.filter((w) => { const p = spr(w); return !p || p.visible === false || p.alpha === 0; })
          .map((w) => `${w.worldX},${w.worldY}`),
        sample: tiles.slice(0, 3).map((w) => ({ x: w.worldX, y: w.worldY, ...spr(w) })),
      };
    });

    await driver.settle(1500);
    const before = await waterSnapshot();
    log(`Boot: ${before.count} tiles d'agua, escondidos: [${before.hidden.join(' ')}]`);
    await shot('agua-boot', { note: `Rio no boot — ${before.count} tiles, ${before.hidden.length} escondidos` });
    assert('No boot, nenhum quad d agua escondido', before.hidden.length === 0, JSON.stringify(before));

    log('Reinicia pelo botao flutuante (2 toques) e olha o rio de novo');
    await driver.page.evaluate(() => document.getElementById('zh-level-restart').click());
    await sleep(250);
    await driver.page.evaluate(() => document.getElementById('zh-level-restart').click());
    for (let i = 0; i < 40; i += 1) {
      await sleep(400);
      try {
        const s = await state();
        if (s && s.player && s.player.worldX === 6 && s.player.worldY === 7) break;
      } catch { /* cena renascendo */ }
    }
    await driver.settle(1500);

    const after = await waterSnapshot();
    log(`Pos-restart: ${after.count} tiles d'agua, escondidos: [${after.hidden.join(' ')}]`);
    await shot('agua-restart', { note: `Rio pos-restart — ${after.count} tiles, ${after.hidden.length} escondidos` });
    assert('Pos-restart, os quads d agua todos voltaram', after.count === before.count && after.hidden.length === 0,
      JSON.stringify({ before: before.count, after }));

    // Segundo restart em sequencia — vazamentos costumam compor.
    await driver.page.evaluate(() => document.getElementById('zh-level-restart').click());
    await sleep(250);
    await driver.page.evaluate(() => document.getElementById('zh-level-restart').click());
    for (let i = 0; i < 40; i += 1) {
      await sleep(400);
      try {
        const s = await state();
        if (s && s.player && s.player.worldX === 6 && s.player.worldY === 7) break;
      } catch { /* cena renascendo */ }
    }
    await driver.settle(1500);
    const after2 = await waterSnapshot();
    log(`Pos-restart 2: ${after2.count} tiles, escondidos: [${after2.hidden.join(' ')}]`);
    await shot('agua-restart2', { note: `Rio pos-restart #2 — ${after2.count} tiles, ${after2.hidden.length} escondidos` });
    assert('Dois restarts seguidos e a agua segue inteira', after2.count === before.count && after2.hidden.length === 0,
      JSON.stringify(after2));
  },
};
