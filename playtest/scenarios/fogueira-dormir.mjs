// FOGUEIRA E DORMIR — só se dorme com fogo (pedido do autor). De dia a fogueira é lenha apagada: o X não
// oferece nem faz dormir. Ao anoitecer o vizinho vai lá e acende, e enquanto o fogo cresce continua sem
// dormir. Só quando a chama terminou de pegar e ele foi embora o balão mostra "dormir" e o X deita.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tap = async (page, key) => { await page.keyboard.down(key); await sleep(50); await page.keyboard.up(key); await sleep(250); };

export default {
  name: 'fogueira-dormir',
  description: 'Dormir só aparece e só funciona depois que o vizinho acendeu a fogueira e o fogo terminou de pegar.',
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

    // A fogueira da Vega (42,5), com ela ao lado: o herói fica ao sul, olhando para o norte. Os vizinhos só
    // existem com o chunk carregado, então primeiro o herói vai até lá.
    await page.evaluate(() => {
      const s = window.__scene;
      s.playerWorld.worldX = 42; s.playerWorld.worldY = 6;
      s.movementController.interruptMovement(42, 6);
      s.streamChunks(true);
    });
    await sleep(900);
    const spot = await page.evaluate(() => {
      const s = window.__scene;
      const npcs = s.npcManager.getActiveWorldPositions();
      const f = s.campfires.find((c) => c.worldX === 42 && c.worldY === 5);
      if (!f || s.isSolidForEntities(42, 6)) return null;
      const owner = npcs.some((n) => Math.max(Math.abs(n.worldX - f.worldX), Math.abs(n.worldY - f.worldY)) === 1);
      window.__fire = f;
      return owner ? { x: f.worldX, y: f.worldY } : null;
    });
    assert('Há uma fogueira de vizinho para testar', spot !== null, JSON.stringify(spot));
    if (!spot) return;
    await sleep(400);
    await tap(page, 'ArrowUp');

    const look = () => page.evaluate(() => {
      const s = window.__scene;
      const f = window.__fire;
      return {
        lit: f.isLit,
        full: f.isFullyLit,
        keeper: s.fireKeepers.has(f),
        verb: s.useVerbAt(f.worldX, f.worldY),
        sleeping: s.sleeping === true,
        resting: s.resting === true,
      };
    });

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
    const kindling = await page.waitForFunction(() => {
      const f = window.__fire;
      return f.isLit && !f.isFullyLit;
    }, null, { timeout: 30000, polling: 50 }).then(() => true, () => false);
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

    // ── 3. O fogo terminou de pegar e o vizinho voltou: agora dorme ──
    const ready = await page.waitForFunction(() => {
      const s = window.__scene;
      const f = window.__fire;
      return f.isFullyLit && !s.fireKeepers.has(f);
    }, null, { timeout: 30000, polling: 100 }).then(() => true, () => false);
    st = await look();
    assert('O fogo termina de pegar e o vizinho vai embora', ready, JSON.stringify(st));
    assert('Com o fogo inteiro, o balão oferece dormir', st.verb === 'sleep', JSON.stringify(st));
    await tap(page, 'x');
    await sleep(800);
    st = await look();
    assert('Com o fogo inteiro, o X faz dormir', st.sleeping, JSON.stringify(st));
    await shot('dormindo', { note: 'Fogo aceso: o herói dorme' });
  },
};
