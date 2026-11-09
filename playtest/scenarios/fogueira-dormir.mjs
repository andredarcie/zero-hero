// FOGUEIRA E DORMIR — só se dorme no acampamento do herói (pedido do autor). Na fogueira de um vizinho o X
// nunca faz dormir: nem apagada de dia, nem pegando fogo, nem com a chama inteira e o vizinho já de volta.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = async (page, key) => { await page.keyboard.down(key); await sleep(50); await page.keyboard.up(key); await sleep(250); };

export default {
  name: 'fogueira-dormir',
  description: 'Na fogueira de vizinho o herói nunca dorme, nem com o fogo aceso e inteiro: só no acampamento.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    // Meio-dia: toda fogueira comum está apagada.
    await page.evaluate(() => window.gameTime.set(0.5));
    await sleep(900);

    // A fogueira da Thea (42,5), com ela ao lado: o herói fica ao sul, olhando para o norte. Os vizinhos só
    // existem com o chunk carregado, então primeiro o herói vai até lá.
    await page.evaluate(() => {
      const g = window.gameDebug;
      g.hero.teleport(42, 6);
    });
    await sleep(900);
    const spot = await page.evaluate(() => {
      const g = window.gameDebug;
      const npcs = g.npcs.list();
      const f = g.camp.campfire(42, 5);
      if (!f || g.world.solid(42, 6)) return null;
      const owner = npcs.some((n) => Math.max(Math.abs(n.worldX - f.x), Math.abs(n.worldY - f.y)) === 1);
      return owner ? { x: f.x, y: f.y } : null;
    });
    assert('Há uma fogueira de vizinho para testar', spot !== null, JSON.stringify(spot));
    if (!spot) return;
    await sleep(400);
    await tap(page, 'ArrowUp');

    const look = () => page.evaluate(([x, y]) => {
      const g = window.gameDebug;
      const f = g.camp.campfire(x, y);
      return {
        lit: f.lit,
        full: f.full,
        keeper: f.keeper,
        verb: g.verbs.use(x, y),
        sleeping: g.camp.rest().sleeping === true,
        resting: g.camp.rest().resting === true,
      };
    }, [spot.x, spot.y]);

    // ── 1. De dia, apagada ──
    let st = await look();
    assert('De dia a fogueira está apagada', !st.lit, JSON.stringify(st));
    assert('Apagada, o balão não oferece dormir', st.verb !== 'sleep', JSON.stringify(st));
    await tap(page, 'x');
    await sleep(500);
    st = await look();
    assert('Apagada, o X não faz dormir', !st.sleeping && !st.resting, JSON.stringify(st));
    await shot('apagada', { note: 'De dia: lenha apagada, sem dormir' });

    // ── 2. Anoitece: o vizinho vai acender, e o fogo cresce aos poucos ──
    await page.evaluate(() => window.gameTime.set(0.85));
    const kindling = await page.waitForFunction(([x, y]) => {
      const f = window.gameDebug.camp.campfire(x, y);
      return f.lit && !f.full;
    }, [spot.x, spot.y], { timeout: 30000, polling: 50 }).then(() => true, () => false);
    assert('O vizinho acende e o fogo começa pequeno', kindling, JSON.stringify(await look()));
    if (kindling) {
      st = await look();
      assert('Pegando fogo, o balão ainda não oferece dormir', st.verb !== 'sleep', JSON.stringify(st));
      await tap(page, 'x');
      await sleep(400);
      st = await look();
      assert('Pegando fogo, o X ainda não faz dormir', !st.sleeping, JSON.stringify(st));
      await shot('acendendo', { note: 'O fogo crescendo: ainda sem dormir' });
    }

    // ── 3. O fogo terminou de pegar e o vizinho voltou: mesmo assim não dorme ──
    const ready = await page.waitForFunction(([x, y]) => {
      const f = window.gameDebug.camp.campfire(x, y);
      return f.full && !f.keeper;
    }, [spot.x, spot.y], { timeout: 30000, polling: 100 }).then(() => true, () => false);
    st = await look();
    assert('O fogo termina de pegar e o vizinho vai embora', ready, JSON.stringify(st));
    assert('Com o fogo inteiro, o balão não oferece dormir', st.verb !== 'sleep', JSON.stringify(st));
    await tap(page, 'x');
    await sleep(800);
    st = await look();
    assert('Com o fogo inteiro, o X não faz dormir', !st.sleeping, JSON.stringify(st));
    await shot('acesa', { note: 'Fogo aceso de vizinho: o herói não dorme aqui' });
  },
};
