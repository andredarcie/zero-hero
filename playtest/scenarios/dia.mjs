// DIA — o turno do dia: borboletas em volta do heroi e folhas que caem das arvores DE VERDADE
// perto dele, pousam e somem. De noite elas saem de cena (os vaga-lumes entram).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'dia',
  description: 'De dia, borboletas e folhas caindo; de noite elas somem.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    // O tile andavel com mais arvores em volta: e la que as folhas tem de onde cair.
    const spot = await page.evaluate(() => {
      const s = window.__scene;
      const trees = (x, y) => {
        let n = 0;
        for (let dy = -3; dy <= 3; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
          if (s.isTreeTileAt(x + dx, y + dy)) n += 1;
        }
        return n;
      };
      let best = null;
      for (let y = 4; y < 56; y += 2) for (let x = 4; x < 56; x += 2) {
        if (s.isSolidForEntities(x, y)) continue;
        const n = trees(x, y);
        if (!best || n > best.n) best = { x, y, n };
      }
      s.playerWorld.worldX = best.x; s.playerWorld.worldY = best.y;
      s.movementController.interruptMovement(best.x, best.y);
      s.streamChunks(true);
      window.gameTime.set(0.5);
      return best;
    });
    await sleep(6000);
    const day = await page.evaluate(() => {
      const s = window.__scene;
      return {
        level: s.daylifeLevel,
        butterflies: s.butterflies.length,
        spread: Math.max(...s.butterflies.map((b) => b.bb.displayWidth)) - Math.min(...s.butterflies.map((b) => b.bb.displayWidth)),
        leaves: s.leaves.length,
        falling: s.leaves.filter((l) => l.landedMs < 0).length,
      };
    });
    await shot('meio-dia', { note: 'Borboletas e folhas ao meio-dia' });
    assert('Ao meio-dia o turno do dia esta inteiro', day.level > 0.9, JSON.stringify(day));
    assert('Borboletas voam em volta do heroi', day.butterflies === 5, JSON.stringify(day));
    assert('As asas batem (a largura muda)', day.spread > 0.02, JSON.stringify(day));
    assert('As arvores perto soltam folhas', day.leaves > 0, JSON.stringify({ ...day, spot }));

    const landed = await page.evaluate(async () => {
      const s = window.__scene;
      for (let i = 0; i < 40; i += 1) {
        if (s.leaves.some((l) => l.landedMs >= 0)) return true;
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    });
    assert('A folha pousa no chao', landed, '');

    await page.evaluate(() => window.gameTime.set(0.0));
    await sleep(7000);
    const night = await page.evaluate(() => ({
      butterflies: window.__scene.butterflies.length,
      level: window.__scene.daylifeLevel,
      fireflies: window.__scene.fireflyLevel,
    }));
    assert('De noite as borboletas vao embora', night.butterflies === 0 && night.level < 0.05, JSON.stringify(night));
    assert('E os vaga-lumes assumem', night.fireflies > 0.9, JSON.stringify(night));
  },
};
