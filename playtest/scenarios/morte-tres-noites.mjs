// AS TRÊS NOITES DA MORTE — pedido do autor: ela vem nas três primeiras noites dormidas no colchão do acampamento,
// uma por noite, no caminho de Nietzsche (o diagnóstico, a travessia, a afirmação), e na quarta não vem mais.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEYS = ['death/visit', 'death/visit2', 'death/visit3'];

export default {
  name: 'morte-tres-noites',
  description: 'A Morte vem nas três primeiras noites no acampamento, uma por noite e em ordem; na quarta, não.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('morte3')) return;
      sessionStorage.setItem('morte3', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);

    const night = async (n) => {
      // Ao lado do colchão, de frente para ele: o Z deita.
      await page.evaluate(() => {
        const s = window.__scene; window.gameTime.set(0.6);
        s.playerWorld.worldX = 54; s.playerWorld.worldY = 48; s.movementController.interruptMovement(54, 48); s.movementController.faceTo(-1, 0); s.streamChunks(true);
      });
      await sleep(600);
      await page.keyboard.press('z');
      await sleep(1500);
      const lying = await page.evaluate(() => window.__scene.camp.rest.isSleeping && window.__scene.camp.rest.sleepingAtCamp);
      assert(`Noite ${n}: deitado no colchão`, lying, '');
      const before = await page.evaluate((keys) => keys.filter((k) => window.__scene.seenDialogKeys.has(k)), KEYS);
      // A noite passa: a hora de dormir, e depois a manhã.
      await page.evaluate(() => window.gameTime.set(0.95));
      await sleep(800);
      await page.evaluate(() => window.gameTime.set(0.235));
      let first = null;
      for (let i = 0; i < 50; i += 1) {
        const st = await state();
        if (st.dialogOpen) {
          if (first === null) {
            await sleep(1800);
            first = await page.evaluate(() => document.querySelector('[data-zh-ui] .zh-dialog-text, .zh-dialog-text')?.textContent ?? '');
            await shot(`noite-${n}`, { note: `A Morte, noite ${n}` });
          }
          await page.keyboard.press('z');
        }
        await sleep(300);
      }
      const after = await page.evaluate((keys) => keys.filter((k) => window.__scene.seenDialogKeys.has(k)), KEYS);
      log(`  noite ${n}: ${JSON.stringify(before)} → ${JSON.stringify(after)} | ${first}`);
      // Levanta e se afasta do colchão.
      for (let i = 0; i < 10 && (await state()).resting; i += 1) { await page.keyboard.press('ArrowUp'); await sleep(400); }
      await sleep(600);
      return { before, after, came: first !== null };
    };

    for (let n = 1; n <= 3; n += 1) {
      const r = await night(n);
      assert(`Noite ${n}: a Morte veio`, r.came, JSON.stringify(r));
      assert(`Noite ${n}: só a visita ${n}, em ordem`, r.after.length === n && r.after[n - 1] === KEYS[n - 1] && r.before.length === n - 1, JSON.stringify(r));
    }
    const r4 = await night(4);
    assert('Noite 4: ela não vem mais', !r4.came && r4.after.length === 3, JSON.stringify(r4));
    const scythes = await page.evaluate(() => window.__scene.itemManager.snapshot().filter((i) => i.kind === 'scythe').length);
    assert('Só uma foice no mundo (a da primeira noite)', scythes === 1, String(scythes));
  },
};
