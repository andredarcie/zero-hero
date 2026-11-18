// ACAMPAMENTO — o canto do herói (pedido do autor; objects/HeroCamp.ts, scripts/acampamento.mjs): na beira do laguinho,
// a leste do começo. Desde 2026-11-17 ele COMEÇA só com o colchão, o fogo com a panela e o caderno; o resto o jogador
// põe pela bancada (o cenário `lar`). A lembrança de quem pediu não aparece mais sozinha: ela fica à espera na bancada.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'acampamento',
  description: 'O acampamento começa com o colchão, o fogo e o caderno; a lembrança de um pedido fica à espera na bancada.',
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
        notebook: g.valley.campAt(53, 47),
        solid: [g.world.solid(53, 48), g.world.solid(53, 49), g.world.solid(53, 47)],
        front: [g.world.solid(54, 48)],
        pieces: g.valley.pieces(),
        log: g.valley.campAt(52, 49),
      };
    });
    log(`  acampamento: ${JSON.stringify(camp)}`);
    assert('O acampamento começa com o colchão, o fogo com a panela e o caderno', camp.bed === 'bed' && camp.ring === 'ring' && camp.notebook === 'notebook', JSON.stringify(camp));
    assert('As peças são sólidas, e o lado do colchão fica livre', camp.solid.every(Boolean) && !camp.front.some(Boolean), JSON.stringify(camp));
    assert('E só isso: nada posto, nem o tronco de antes', camp.pieces.length === 0 && camp.log === null, JSON.stringify(camp));

    // O herói chega a pé, do começo, até a frente do colchão.
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
      return { bed: seen.has('54,48'), bench: seen.has('54,45') };
    });
    assert('Do começo, o herói chega ao lado do colchão e à frente da bancada', reach.bed && reach.bench, JSON.stringify(reach));

    // O pedido da Sisi fecha (pelo mesmo evento do jogo): o quadro dela NÃO aparece sozinho; fica à espera na bancada.
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
    const after = await page.evaluate(() => ({ pieces: window.gameDebug.valley.pieces(), easel: window.gameDebug.valley.campAt(55, 47) }));
    assert('Fechado o pedido da Sisi, o quadro dela não aparece sozinho no acampamento', after.pieces.length === 0 && after.easel === null, JSON.stringify(after));
    await page.evaluate(() => window.gameDebug.hero.teleport(54, 45, 1, 0));
    await sleep(400);
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.gameDebug.camp.build().open, null, { timeout: 8000 });
    const build = await page.evaluate(() => window.gameDebug.camp.build());
    log(`  bancada: ${JSON.stringify(build.cards)}`);
    assert('Na bancada, o quadro da Sisi espera para ser posto (de graça)', build.cards.some((c) => c.kind === 'easel' && c.state === 'ready'), JSON.stringify(build.cards));
    await shot('00-acampamento', { note: 'A bancada com o quadro da Sisi à espera' });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.gameDebug.camp.build().open, null, { timeout: 8000 });
    assert('O Esc fecha a bancada e o jogo volta', !(await page.evaluate(() => window.gameDebug.camp.build().paused)), '');
  },
};
