// A CHUVA — pedido do autor: "melhore a qualidade da chuva" (entities/ValleyWeather.ts, runtime/seasons.rainAmountAt).
// O dia 1 é o primeiro dia de chuva (das 15h às 17h24). O cenário pula para ele, confere que a garoa do começo tem
// menos pingos que o miolo, que os pingos respingam no chão e fazem anéis na água (o herói fica na beira do lago das
// carpas), e fotografa a garoa, o forte e o fim.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'chuva',
  description: 'A chuva: garoa que engrossa, pingos em camadas inclinados pelo vento, respingos no chão e anéis na água.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);
    await page.evaluate(() => {
      const s = window.__scene;
      s.playerWorld.worldX = 51; s.playerWorld.worldY = 58; s.movementController.interruptMovement(51, 58); s.movementController.faceTo(1, 0); s.streamChunks(true);
      window.gameTime.setDay(1);
    });
    const read = () => page.evaluate(() => {
      const w = window.__scene.weather;
      return { rain: +w.rain.toFixed(2), drops: w.dropCount, splash: w.splashCount, rings: w.ringCount, weather: w.weather };
    });

    // A garoa do começo (a chuva começa às 0,625).
    await page.evaluate(() => window.gameTime.set(0.632));
    await sleep(5000);
    const drizzle = await read();
    log(`  garoa: ${JSON.stringify(drizzle)}`);
    await shot('00-garoa', { note: 'O começo da chuva: garoa' });

    // O miolo, o forte.
    await page.evaluate(() => window.gameTime.set(0.675));
    await sleep(6000);
    const heavy = await read();
    log(`  forte: ${JSON.stringify(heavy)}`);
    assert('No dia 1 às 16h está chovendo', heavy.weather === 'rain', JSON.stringify(heavy));
    assert('A garoa tem menos pingos que o miolo da chuva', drizzle.drops < heavy.drops * 0.6, `${drizzle.drops} < ${heavy.drops}`);
    assert('No forte há bastante pingo no ar', heavy.drops >= 60, String(heavy.drops));
    assert('Os pingos respingam no chão e fazem anéis na água', heavy.splash > 10 && heavy.rings > 5, JSON.stringify(heavy));
    await shot('01-forte', { note: 'O miolo da chuva, na beira do lago' });
    await sleep(400);
    await shot('02-forte-2', { note: 'O miolo da chuva, um instante depois' });

    // Passou: o céu abre de novo.
    await page.evaluate(() => window.gameTime.set(0.74));
    await sleep(14000);
    const after = await read();
    log(`  depois: ${JSON.stringify(after)}`);
    assert('Depois da chuva, os pingos vão embora', after.weather === 'clear' && after.drops < 10, JSON.stringify(after));
  },
};
