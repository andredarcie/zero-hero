// A CACHOEIRA DO ACAMPAMENTO — pedido do autor: "veja um lugar ideal, faça uma fonte da água caindo tipo cachoeira".
// A nascente brota na beira do planalto baixo ao sul do acampamento, cai a parede e enche o poço que escorre para o
// laguinho (objects/Waterfall.ts, scripts/cachoeira.mjs). O cenário confere que ela está no mapa (nascente e poço
// sólidos), que a água corre (os quadros andam), que o marulho cresce perto dela, e fotografa de dia e de noite.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SPRING = { x: 53, y: 55 };
const POOL = { x: 53, y: 56 };

export default {
  name: 'cachoeira',
  description: 'A cachoeira do acampamento: nascente e poço no mapa, a água correndo, o marulho perto, de dia e de noite.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);
    const put = (x, y, fx, fy) => page.evaluate(([px, py, dx, dy]) => {
      const s = window.__scene;
      s.playerWorld.worldX = px; s.playerWorld.worldY = py; s.movementController.interruptMovement(px, py); s.movementController.faceTo(dx, dy); s.streamChunks(true);
    }, [x, y, fx, fy]);

    // Diante da queda, na beira do poço, de dia.
    await page.evaluate(() => window.gameTime.set(0.42));
    await put(51, 58, 1, 0);
    await sleep(1500);
    const map = await page.evaluate(([sp, po]) => {
      const s = window.__scene;
      return {
        exists: !!s.waterfall,
        springSolid: s.isSolidForEntities(sp.x, sp.y),
        poolSolid: s.isSolidForEntities(po.x, po.y),
        poolWater: s.isOpenWaterAt(po.x, po.y),
        sideFree: !s.isSolidForEntities(51, 58),
        pondWater: [52, 53, 54, 55, 56].every((x) => [56, 57, 58].every((y) => s.isOpenWaterAt(x, y))),
        koi: s.koiPond?.fish.length ?? 0,
        streamSolid: s.isSolidForEntities(52, 54) && s.isSolidForEntities(53, 54),
      };
    }, [SPRING, POOL]);
    assert('A cachoeira está na cena', map.exists, JSON.stringify(map));
    assert('A nascente e o poço são sólidos, e o poço é água', map.springSolid && map.poolSolid && map.poolWater, JSON.stringify(map));
    assert('A beira do laguinho (51,58) continua livre para o herói olhar', map.sideFree, JSON.stringify(map));
    assert('O riacho do alto (52,54)-(53,54) é sólido', map.streamSolid, JSON.stringify(map));
    assert('O lago das carpas (5×3) é água, com 7 carpas', map.pondWater && map.koi === 7, JSON.stringify(map));

    const frames = new Set();
    for (let i = 0; i < 12; i += 1) {
      frames.add(await page.evaluate(() => window.__scene.waterfall.currentFrame));
      await sleep(70);
    }
    log(`  quadros vistos: ${[...frames].join(',')}`);
    assert('A água corre: os quadros da queda andam', frames.size >= 3, [...frames].join(','));
    await shot('00-dia', { note: 'A cachoeira de dia, da beira do laguinho' });

    // As carpas nadam, e com o herói parado na beira elas vêm para perto dele.
    const fishA = await page.evaluate(() => window.__scene.koiPond.fish);
    await sleep(6000);
    const fishB = await page.evaluate(() => window.__scene.koiPond.fish);
    const moved = fishA.some((f, i) => Math.hypot(f.x - fishB[i].x, f.y - fishB[i].y) > 0.15);
    const inside = fishB.every((f) => f.x >= 51.79 && f.x <= 56.21 && f.y >= 55.79 && f.y <= 57.89);
    const nearHero = fishB.filter((f) => Math.hypot(f.x - 51, f.y - 58) < 1.8).length;
    log(`  carpas: ${fishB.map((f) => `${f.x.toFixed(2)},${f.y.toFixed(2)}`).join('  ')} (perto do herói: ${nearHero})`);
    assert('As carpas nadam, sem sair do laguinho', moved && inside, JSON.stringify(fishB));
    assert('Com o herói na beira, as carpas se juntam perto dele', nearHero >= 2, String(nearHero));
    await shot('00b-carpas', { note: 'As carpas juntas na beira, perto do herói' });

    await sleep(900);

    // O lago inteiro, da margem sul (a câmera olha para o norte: dali se vê a queda, o riacho do alto e as taboas).
    await put(55, 59, 0, -1);
    await sleep(1400);
    await shot('01-do-sul', { note: 'O lago inteiro, da margem sul' });

    // De noite.
    await put(51, 58, 1, 0);
    await page.evaluate(() => window.gameTime.set(0.9));
    await sleep(1800);
    await shot('02-noite', { note: 'A cachoeira de noite' });
  },
};
