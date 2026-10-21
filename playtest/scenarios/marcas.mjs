// MARCAS — o vale MUDA quando um pedido fecha: o marco da Vega, o cesto da Hollis, a lenha do Bram
// (e a fogueira dele acesa de dia) e o cavalete da Iris com a tela verde. Sem pedidos, so o
// cavalete cinza existe. E ao vivo: entregar as pedras a Vega faz o marco surgir ali.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ALL_DONE = {
  'radiationSuit/deliver:mushroom': 5, 'painter/grow': 2, 'businessMan/deliver:wood': 4, 'astronaut/deliver:stone': 3,
  'astronaut/deliver:iron': 1,
};

const boot = async (driver, save) => {
  const { page } = driver;
  await page.evaluate((s) => localStorage.setItem('zh.cozy.v1', JSON.stringify(s)), save);
  await driver.open('/?play');
  await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
  await sleep(700);
  return page.evaluate(() => window.__scene.questMarks.map((m) => ({
    dialog: m.def.dialog, done: m.done, texture: m.bb ? m.def[m.done ? 'after' : 'before'] : null, tile: m.tile,
  })));
};

export default {
  name: 'marcas',
  description: 'O vale responde aos pedidos (marco, cesto, lenha + fogo, cavalete) e os NPCs tem vida.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    await driver.open('/');
    const fresh = await boot(driver, { started: true, introSeen: true, questProgress: {} });
    assert('Antes dos pedidos so o cavalete cinza existe',
      fresh.filter((m) => m.texture).map((m) => m.texture).join() === 'quest-easel-grey', JSON.stringify(fresh));
    assert('Toda marca achou um tile', fresh.length === 4 && fresh.every((m) => m.tile), JSON.stringify(fresh));

    const all = await boot(driver, { started: true, introSeen: true, questProgress: ALL_DONE });
    assert('Com tudo feito, as quatro marcas aparecem',
      all.every((m) => m.done && m.texture === { astronaut: 'quest-cairn', radiationSuit: 'quest-basket', painter: 'quest-easel-green', businessMan: 'wood-item' }[m.dialog]),
      JSON.stringify(all));
    await page.evaluate(() => window.gameTime.set(0.5));
    await sleep(600);
    const fire = await page.evaluate(() => {
      const s = window.__scene;
      return [...s.keptLitFires].map((f) => ({ x: f.worldX, y: f.worldY, lit: f.isLit }));
    });
    assert('A fogueira do Bram fica acesa ao meio-dia', fire.length === 1 && fire[0].lit, JSON.stringify(fire));
    for (const m of all) {
      await page.evaluate(([x, y]) => { const s = window.__scene; s.playerWorld.worldX = x; s.playerWorld.worldY = y + 2; s.movementController.interruptMovement(x, y + 2); s.streamChunks(true); }, [m.tile.x, m.tile.y]);
      await sleep(900);
      await shot(`marca-${m.dialog}`, { note: m.dialog });
    }

    // Ao vivo: tres pedras na mochila, falar com a Vega, e o marco surge.
    const live = await boot(driver, {
      started: true, introSeen: true, questProgress: {}, giftsGiven: ['astronaut'],
      inventory: [{ kind: 'stone', count: 3 }], selected: 'none',
    });
    const vega = await page.evaluate(async () => {
      const w = await (await fetch('/world.json')).json();
      for (const c of w.chunks) for (const n of c.npcs) if (n.type === 'astronaut') return { x: n.worldX, y: n.worldY };
      return null;
    });
    await page.evaluate(() => {
      const s = window.__scene;
      window.__hearts = 0;
      const orig = s.spawnHearts.bind(s);
      s.spawnHearts = (x, y) => { window.__hearts += 1; orig(x, y); };
    });
    await page.evaluate(([x, y]) => { const s = window.__scene; s.playerWorld.worldX = x; s.playerWorld.worldY = y + 1; s.movementController.interruptMovement(x, y + 1); s.streamChunks(true); }, [vega.x, vega.y]);
    await sleep(500);
    const greeted = await page.evaluate(([x, y]) => window.__scene.greetedNpcs.has(`${x},${y}`), [vega.x, vega.y]);
    assert('Chegar perto faz a Vega dar oi (pulinho)', greeted, '');
    const breath = await page.evaluate(async () => {
      const sizes = [];
      for (let i = 0; i < 6; i += 1) {
        const npc = [...window.__scene.npcManager.byChunk.values()].flat().find((n) => n.kind === 'astronaut');
        sizes.push(npc.sprite.displayHeight);
        await new Promise((r) => setTimeout(r, 300));
      }
      return sizes;
    });
    assert('Os NPCs respiram', Math.max(...breath) - Math.min(...breath) > 0.01, JSON.stringify(breath.map((v) => v.toFixed(3))));
    await page.keyboard.down('ArrowUp'); await sleep(40); await page.keyboard.up('ArrowUp'); await sleep(300);
    await page.keyboard.down('z'); await sleep(50); await page.keyboard.up('z');
    await page.waitForFunction(() => window.gameDebug.getState().dialogOpen, null, { timeout: 5000 });
    await sleep(700);
    await shot('fala', { note: 'A placa do nome, sem gritar' });
    for (let i = 0; i < 20 && (await driver.getState()).dialogOpen; i += 1) {
      await page.keyboard.down('z'); await sleep(50); await page.keyboard.up('z'); await sleep(450);
    }
    await sleep(450);
    await shot('marco-surgindo', { note: 'O marco da Vega surge, e ela agradece' });
    assert('O obrigado vem com coracoes', (await page.evaluate(() => window.__hearts)) === 1, '');
    const after = await page.evaluate(() => window.__scene.questMarks.find((m) => m.def.dialog === 'astronaut'));
    assert('Entregar as pedras faz o marco surgir', after?.done === true && Boolean(after.bb), JSON.stringify({ done: after?.done }));
    void live;
  },
};
