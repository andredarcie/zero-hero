// ACAMPAMENTO — o canto do herói (pedido do autor; objects/HeroCamp.ts, scripts/acampamento.mjs): uma cabana
// improvisada e um círculo de pedras na beira do laguinho, a leste do começo; e, a cada pedido fechado, a lembrança
// de quem pediu aparece ali.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'acampamento',
  description: 'O acampamento do herói: a cabana, as pedras e a lembrança que chega quando um pedido fecha.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);

    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);

    const camp = await page.evaluate(() => {
      const g = window.gameDebug;
      return {
        bed: g.valley.campAt(53, 48),
        ring: g.valley.campAt(53, 49),
        solid: [g.world.solid(53, 48), g.world.solid(53, 49), g.world.solid(52, 49)],
        front: [g.world.solid(54, 48)],
        mementos: g.valley.mementos(),
        easel: g.valley.campAt(55, 47),
      };
    });
    log(`  acampamento: ${JSON.stringify(camp)}`);
    assert('O colchão fica no acampamento, com as pedras ao lado', camp.bed === 'bed' && camp.ring === 'ring', JSON.stringify(camp));
    assert('As peças são sólidas, e o lado do colchão fica livre', camp.solid.every(Boolean) && !camp.front.some(Boolean), JSON.stringify(camp));
    assert('No começo, nenhuma lembrança (nenhum pedido fechado)', camp.mementos === 0 && camp.easel === null, JSON.stringify(camp));

    // O herói chega a pé, do começo, até a frente da cabana.
    const reach = await page.evaluate(() => {
      const g = window.gameDebug;
      const hero = g.hero.at();
      const start = [hero.x, hero.y];
      const seen = new Set([start.join(',')]);
      const q = [start];
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${x + dx},${y + dy}`;
          if (seen.has(k) || g.world.solid(x + dx, y + dy) || seen.size > 4000) continue;
          seen.add(k); q.push([x + dx, y + dy]);
        }
      }
      return seen.has('54,48');
    });
    assert('Do começo, o herói chega ao lado do colchão', reach, String(reach));

    // O pedido da Sisi fecha (pelo mesmo evento do jogo): o quadro dela aparece no acampamento.
    await page.evaluate(() => {
      const g = window.gameDebug; window.gameTime.set(0.45);
      g.hero.teleport(54, 51, 0, -1);
      g.quest.event({ type: 'paint' });
    });
    for (let i = 0; i < 20; i += 1) {
      const st = await state();
      if (st.dialogOpen || st.itemGetOpen) await page.keyboard.press('z');
      await sleep(250);
    }
    const after = await page.evaluate(() => ({ mementos: window.gameDebug.valley.mementos(), easel: window.gameDebug.valley.campAt(55, 47), solid: window.gameDebug.world.solid(55, 47) }));
    assert('Fechado o pedido da Sisi, o quadro dela aparece no acampamento', after.mementos === 1 && after.easel === 'easel' && after.solid, JSON.stringify(after));
    await shot('00-acampamento', { note: 'O acampamento com o quadro da Sisi' });

  },
};
