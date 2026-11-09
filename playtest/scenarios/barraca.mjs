// BARRACA — pedido do autor: o mago manda o herói dormir no colchão do acampamento (a barraca saiu) ("você não dorme de verdade desde
// que a guerra começou"), e a primeira noite ali é quando a Morte aparece pela primeira vez — e deixa a foice.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'barraca',
  description: 'O mago manda dormir na barraca; a primeira noite nela traz a primeira visita da Morte e a foice.',
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

    // O mago: a abertura manda para a barraca, e a conversa de depois lembra dela até a primeira noite.
    const wizard = await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => u.includes('/i18n/i18n.ts'));
      const { tLines } = await import(url);
      return { intro: tLines('wizard.intro').map((l) => l.text).join(' '), line: window.__scene.wizardLine() };
    });
    assert('A abertura do mago manda o herói descansar no acampamento', /acampamento/i.test(wizard.intro) && /descansar/i.test(wizard.intro), wizard.intro);
    assert('Antes da primeira noite, o mago lembra do acampamento', wizard.line === 'tent', wizard.line);

    // Ao lado do colchão, de frente para ele, o Z leva o herói para cima dele e o deita.
    await page.evaluate(() => {
      const s = window.__scene; window.gameTime.set(0.6);
      s.playerWorld.worldX = 54; s.playerWorld.worldY = 48; s.movementController.interruptMovement(54, 48); s.movementController.faceTo(-1, 0); s.streamChunks(true);
    });
    await sleep(600);
    await page.keyboard.press('z');
    // O passo até o colchão é animado: com a máquina carregada ele atrasa, então espera ele deitar (até 6 s), em vez
    // de olhar num instante fixo (era isso que fazia o cenário falhar às vezes com o herói já no colchão, de pé).
    await page.waitForFunction(() => window.__scene.rest.isResting && window.__scene.rest.isSleeping, null, { timeout: 6000 }).catch(() => {});
    await sleep(300);
    const lying = await page.evaluate(() => {
      const s = window.__scene;
      return {
        resting: s.rest.isResting, sleeping: s.rest.isSleeping, camp: s.rest.sleepingAtCamp, at: [s.playerWorld.worldX, s.playerWorld.worldY],
        probe: { cutscene: s.cutsceneActive, dialog: s.dialogOpen, tScale: s.tweens.timeScale, paused: s.tweens.paused, tweens: s.tweens.getTweens?.().length, sceneTime: s.time.timeScale, frame: s.game.loop.frame },
      };
    });
    assert('O Z diante do colchão deita o herói em cima dele para dormir', lying.resting && lying.sleeping && lying.camp && lying.at[0] === 53 && lying.at[1] === 48, JSON.stringify({ ...lying, frameAgain: await page.evaluate(() => window.__scene.game.loop.frame) }));
    await shot('00-dormindo', { note: 'O herói dormindo no colchão do acampamento' });

    // A noite passa (o relógio é empurrado): na volta da hora de dormir, a Morte vem.
    await page.evaluate(() => window.gameTime.set(0.95));
    await sleep(800);
    await page.evaluate(() => window.gameTime.set(0.235));
    let deathSeen = false;
    for (let i = 0; i < 40; i += 1) {
      const st = await state();
      if (st.dialogOpen) {
        if (!deathSeen) { deathSeen = true; await sleep(600); await shot('01-morte', { note: 'A primeira visita da Morte, ao lado das pedras do acampamento' }); }
        await page.keyboard.press('z');
      }
      await sleep(350);
    }
    const after = await page.evaluate(() => ({
      visited: window.__scene.seenDialogKeys.has('death/visit'),
      death: window.__scene.rest.deathTile ?? null,
      line: window.__scene.wizardLine(),
    }));
    log(`  depois da noite: ${JSON.stringify(after)}`);
    assert('Na primeira noite na barraca, a Morte aparece', deathSeen && after.visited, JSON.stringify({ deathSeen, ...after }));
    assert('Depois dela, o mago avisa que ela volta e manda dormir de novo', after.line === 'again', after.line);

    // Ao levantar, a foice ficou onde ela esteve, no chão do acampamento.
    await page.keyboard.down('ArrowDown'); await sleep(150); await page.keyboard.up('ArrowDown');
    await sleep(1200);
    const scythe = await page.evaluate(() => window.__scene.itemManager.snapshot().filter((i) => i.kind === 'scythe').map((i) => [i.worldX, i.worldY]));
    log(`  foice: ${JSON.stringify(scythe)}`);
    assert('A foice que ela deixou está no acampamento', scythe.some(([x, y]) => x >= 51 && x <= 56 && y >= 46 && y <= 51), JSON.stringify(scythe));

    // Acordado em cima do colchão, ele sai dele andando (o colchão é sólido para quem chega, não para quem está nele).
    for (let i = 0; i < 10 && (await state()).cutsceneActive; i += 1) await sleep(300);
    const from = await page.evaluate(() => [window.__scene.playerWorld.worldX, window.__scene.playerWorld.worldY, window.__scene.rest.isResting]);
    await page.keyboard.down('ArrowUp'); await sleep(250); await page.keyboard.up('ArrowUp');
    await sleep(700);
    const to = await page.evaluate(() => [window.__scene.playerWorld.worldX, window.__scene.playerWorld.worldY]);
    log(`  saindo do colchão: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
    assert('Acordado, o herói sai do colchão andando', from[2] === false && (to[0] !== from[0] || to[1] !== from[1]), JSON.stringify({ from, to }));
  },
};
