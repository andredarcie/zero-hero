// DESCANSO — sentar numa fogueira acesa e ver o tempo passar: o Z senta, o relogio corre depressa,
// e uma seta levanta (o relogio volta ao normal).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = async (page, key) => { await page.keyboard.down(key); await sleep(50); await page.keyboard.up(key); await sleep(250); };

export default {
  name: 'descanso',
  description: 'Z numa fogueira acesa senta o heroi; o tempo corre; uma seta levanta.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await page.evaluate(() => window.gameTime.set(0.85));
    await sleep(900);
    // Uma fogueira acesa com o tile ao sul livre: o heroi fica ali, olhando para o norte.
    const spot = await page.evaluate(() => {
      const s = window.__scene;
      const f = s.campfires.find((c) => c.isLit && !s.isSolidForEntities(c.worldX, c.worldY + 1));
      s.playerWorld.worldX = f.worldX; s.playerWorld.worldY = f.worldY + 1;
      s.movementController.interruptMovement(f.worldX, f.worldY + 1);
      s.streamChunks(true);
      return { x: f.worldX, y: f.worldY };
    });
    await sleep(400);
    await tap(page, 'ArrowUp');
    await tap(page, 'z');
    await sleep(400);
    const t0 = await page.evaluate(() => window.gameTime.get().phase);
    assert('O Z na fogueira acesa senta o heroi', (await driver.getState()).resting, JSON.stringify(spot));
    await sleep(2500);
    await shot('sentado', { note: 'Sentado na fogueira, o tempo passando' });
    const t1 = await page.evaluate(() => window.gameTime.get().phase);
    const hours = (((t1 - t0) % 1) + 1) % 1 * 24;
    assert('Sentado, o tempo corre depressa', hours > 1.5, `${hours.toFixed(2)}h em 2,5s`);
    await tap(page, 'ArrowLeft');
    await sleep(300);
    const after = await driver.getState();
    assert('Uma seta levanta', !after.resting, '');
    assert('Levantar nao anda (so levanta)', after.player.worldX === spot.x && after.player.worldY === spot.y + 1, JSON.stringify(after.player));
    const t2 = await page.evaluate(() => window.gameTime.get().phase);
    await sleep(2000);
    const t3 = await page.evaluate(() => window.gameTime.get().phase);
    const normal = (((t3 - t2) % 1) + 1) % 1 * 24 * 60;
    assert('De pe, o relogio volta ao normal', normal < 20, `${normal.toFixed(1)} min em 2s`);
  },
};
