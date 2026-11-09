// O BOSQUE E OS PÁSSAROS — pedido do autor: "árvores grandes e variadas" e "pássaros de dia" (objects/BigTrees.ts,
// objects/BirdLife.ts, scripts/bosque.mjs). Confere que as árvores estão no mapa (pé sólido), que a copa do carvalho
// fica translúcida com o herói atrás dela, que um bandinho desce para ciscar de dia e é espantado quando o herói
// chega perto, e que de noite não há pássaro. Fotografa o bosque de dia e os passarinhos no chão.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'bosque',
  description: 'O bosque (carvalhos velhos, bétulas, carvalhinhos, troncos caídos) e os passarinhos de dia.',
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
    await page.evaluate(() => window.gameTime.set(0.42));

    // Os passarinhos: um bandinho desce perto do herói, de dia. Eles moram na MATA (world/biomeLife), não no bosque
    // de outono: o teste vai até lá.
    await put(52, 20, 0, 1);
    await page.evaluate(() => { window.__scene.birdLife.nextLanding = 0; });
    await page.waitForFunction(() => window.__scene.birdLife.list.filter((b) => b.mode === 'ground').length >= 3, null, { timeout: 15000 }).catch(() => {});
    const birds = await page.evaluate(() => window.__scene.birdLife.list);
    const ground = birds.filter((b) => b.mode === 'ground');
    log(`  no chão: ${ground.map((b) => `${b.x.toFixed(1)},${b.y.toFixed(1)}`).join('  ')}`);
    assert('De dia um bandinho desce para ciscar', ground.length >= 3, JSON.stringify(birds));
    await sleep(1500);
    await shot('02-passarinhos', { note: 'Os passarinhos ciscando' });

    // O herói chega perto: o bando inteiro levanta voo.
    const target = ground[0];
    const flushesBefore = await page.evaluate(() => window.__scene.birdLife.flushes);
    await put(Math.round(target.x), Math.round(target.y) + 1, 0, -1);
    await sleep(700);
    const after = await page.evaluate(() => ({ list: window.__scene.birdLife.list, flushes: window.__scene.birdLife.flushes }));
    assert('Com o herói perto, o bando levanta voo', after.flushes > flushesBefore && !after.list.some((b) => b.mode === 'ground'), JSON.stringify(after));
    await shot('03-revoada', { note: 'O bando levantando voo' });

    const trees = await page.evaluate(() => {
      const s = window.__scene;
      const list = s.bigTrees.list;
      return { count: list.length, kinds: [...new Set(list.map((t) => t.kind))], solid: list.every((t) => s.isSolidForEntities(t.x, t.y)) };
    });
    assert('O bosque tem as 4 espécies, e o pé de cada árvore é sólido', trees.count >= 8 && trees.kinds.length === 4 && trees.solid, JSON.stringify(trees));

    // O bosque de dia, visto do sul do carvalho de (47,57).
    await put(46, 59, 0, -1);
    await sleep(1500);
    await shot('00-bosque', { note: 'O carvalho velho, a bétula e o tronco caído' });

    // O pinhal do mapa com as árvores novas no meio (o estilo tem de casar: o autor viu que não casava).
    await put(41, 51, 0, -1);
    await sleep(1400);
    await shot('00c-pinhal', { note: 'Os pinheiros do tileset ao lado do carvalho velho, do carvalhinho e do tronco caído' });

    // O carvalho de (50,46) inteiro, visto do sul.
    await put(50, 49, 0, -1);
    await sleep(1200);
    const oak = await page.evaluate(() => {
      const t = window.__scene.bigTrees.trees.find((q) => q.x === 50 && q.y === 46);
      const m = t.bb.mesh;
      return { visible: m.visible, pos: [m.position.x, m.position.y, m.position.z], scale: [m.scale.x, m.scale.y], opacity: m.material.opacity, parent: !!m.parent };
    });
    log(`  carvalho: ${JSON.stringify(oak)}`);
    await shot('00b-carvalho', { note: 'O carvalho velho inteiro, do sul' });

    // O herói atrás do carvalho de (50,46): a copa fica translúcida.
    await put(50, 45, 0, 1);
    await sleep(900);
    const alpha = await page.evaluate(() => window.__scene.bigTrees.list.find((t) => t.x === 50 && t.y === 46).alpha);
    assert('Com o herói atrás, a copa do carvalho fica translúcida', alpha < 0.6, String(alpha));
    await shot('01-atras-da-copa', { note: 'O herói atrás da copa' });

    // De noite, nenhum passarinho.
    await page.evaluate(() => window.gameTime.set(0.9));
    await sleep(6000);
    const night = await page.evaluate(() => window.__scene.birdLife.list.filter((b) => b.mode === 'ground' || b.mode === 'arriving').length);
    assert('De noite não há passarinho no chão', night === 0, String(night));
  },
};
