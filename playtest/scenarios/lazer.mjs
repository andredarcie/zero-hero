// LAZER: o que se faz no vale entre os pedidos e depois deles (pedidos do autor, 2026-11-11 e 12): o caderno de campo
// em cima do colchão, o caderno de desenho (a carpa do laguinho), a pedra que quica (o lago a oeste do acampamento) e
// a meditação na pedra do alto da colina. Tudo pelas sondas (gameDebug.camp) e por teclas de verdade.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'lazer',
  description: 'O caderno de campo, o desenho de um bicho, a pedra que quica e uma sessão de meditação inteira.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const camp = (fn) => page.evaluate(fn);
    const prompt = () => page.evaluate(() => window.gameDebug.getState().actionPrompt);
    const go = async (x, y, dx, dy) => {
      await page.evaluate(([a, b, c, d]) => { window.gameTime.set(0.45); window.gameDebug.hero.teleport(a, b, c, d); }, [x, y, dx, dy]);
      await sleep(1600);
    };

    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);

    // ── 1. O CADERNO DE CAMPO: o Z abre, a seta folheia, o X fecha. ──────────────────────────────────────────────
    await go(54, 47, -1, 0);
    log(`  balão diante do caderno: ${JSON.stringify(await prompt())}`);
    await page.keyboard.press('z');
    await sleep(700);
    const book = await camp(() => window.gameDebug.camp.notebook());
    assert('1 · Caderno: o Z abre, com uma página por coisa do vale e por bicho', book.open && book.pages.length >= 36, JSON.stringify({ open: book.open, pages: book.pages.length }));
    await page.keyboard.press('ArrowDown');
    await sleep(200);
    const turned = await camp(() => window.gameDebug.camp.notebook().at);
    await shot('01-caderno', { note: 'O caderno de campo aberto' });
    await page.keyboard.press('x');
    await sleep(400);
    assert('1 · Caderno: a seta folheia e o X fecha', turned !== book.at && !(await camp(() => window.gameDebug.camp.notebook().open)), `${book.at} → ${turned}`);

    // ── 2. O DESENHO: perto da carpa, a etiqueta; o Z abre; quem solta quando ela olha termina o desenho. ──────
    await go(54, 54, 0, 1);
    const near = await camp(() => window.gameDebug.camp.sketch());
    assert('2 · Desenho: perto da carpa, a etiqueta "Desenhar" aparece', near.target === 'koi' && near.cue !== null, JSON.stringify(near));
    await page.keyboard.press('z');
    await sleep(500);
    let sketch = 'aberto';
    for (let i = 0; i < 500; i += 1) {
      const st = await camp(() => window.gameDebug.camp.sketch().open);
      if (!st) { sketch = 'fechou'; break; }
      if (st.phase === 'done') { sketch = 'pronto'; break; }
      if (st.phase === 'flee') { sketch = 'fugiu'; break; }
      await page.evaluate((h) => window.gameDebug.camp.holdPen(h), st.phase !== 'alert');
      await sleep(40);
    }
    await shot('02-desenho', { note: 'A carpa desenhada a pena' });
    await page.keyboard.press('x');
    await sleep(500);
    const page2 = (await camp(() => window.gameDebug.camp.notebook().pages)).find((p) => p.kind === 'koi');
    assert('2 · Desenho: soltando quando ela olha, o desenho fica pronto e entra no caderno', sketch === 'pronto' && page2?.known, `${sketch} ${JSON.stringify(page2)}`);

    // ── 3. A PEDRA QUE QUICA: o Z pega o seixo, o Z joga, o X desiste. ─────────────────────────────────────────
    await go(38, 54, 1, 0);
    log(`  balão diante do lago: ${JSON.stringify(await prompt())}`);
    await page.keyboard.press('z');
    await sleep(150);
    const aiming = await camp(() => window.gameDebug.camp.skip());
    // O seixo começa de pé e passa deitado (o brilho) ~0,4 s depois do Z.
    await sleep(250);
    await page.keyboard.press('z');
    await sleep(500);
    await shot('03-pedra', { note: 'A pedra quicando no lago' });
    await sleep(4000);
    const thrown = await camp(() => window.gameDebug.camp.skip());
    assert('3 · Pedra: o Z pega o seixo e o Z joga; ela quica (ou afunda) e para', aiming.aiming && !thrown.aiming && thrown.last >= 0, JSON.stringify({ aiming, thrown }));
    await page.keyboard.press('z');
    await sleep(200);
    await page.keyboard.press('x');
    await sleep(200);
    assert('3 · Pedra: o X desiste de jogar', !(await camp(() => window.gameDebug.camp.skip().aiming)), '');

    // ── 4. A MEDITAÇÃO: senta, respira junto do guia, percebe um pensamento, levanta com a nota do caderno. ──────
    await go(30, 21, 0, -1);
    log(`  balão diante da pedra: ${JSON.stringify(await prompt())}`);
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.gameDebug.camp.meditation() !== null, null, { timeout: 5000 }).catch(() => {});
    const sat = await camp(() => ({ med: window.gameDebug.camp.meditation(), rest: window.gameDebug.camp.rest() }));
    assert('4 · Meditação: o Z na pedra senta o herói e abre a sessão', sat.med !== null && sat.rest.resting, JSON.stringify(sat));
    // Segue o anel como uma pessoa (com atraso de reação), e percebe o primeiro pensamento que chegar.
    let down = false;
    let seen = null;
    let seenAt = 0;
    const end = Date.now() + 40000;
    while (Date.now() < end) {
      const m = await camp(() => window.gameDebug.camp.meditation());
      if (!m) break;
      if (m.inhaling !== seen) { seen = m.inhaling; seenAt = Date.now(); }
      const want = Date.now() - seenAt > 250 ? seen : down;
      if (want !== down) { if (want) await page.keyboard.down('z'); else await page.keyboard.up('z'); down = want; }
      if (m.thoughts.some((t) => t.endsWith(':caught'))) await page.keyboard.press('x');
      if (m.returns >= 1 && m.breaths >= 2) break;
      await sleep(30);
    }
    if (down) await page.keyboard.up('z');
    const mid = await camp(() => window.gameDebug.camp.meditation());
    await shot('04-meditacao', { note: 'Meditando na pedra da colina' });
    assert('4 · Meditação: quem segue o guia conta fôlegos, e perceber um pensamento é uma volta', mid && mid.breaths >= 2 && mid.returns >= 1, JSON.stringify(mid));
    await page.keyboard.press('Escape');
    await sleep(800);
    const note = await camp(() => window.gameDebug.camp.meditation()?.note ?? false);
    await shot('05-nota', { note: 'A nota do caderno ao levantar' });
    await page.keyboard.press('z');
    await sleep(800);
    const up = await camp(() => ({ med: window.gameDebug.camp.meditation(), rest: window.gameDebug.camp.rest() }));
    assert('4 · Meditação: o Esc traz a nota do caderno, e um toque levanta o herói', note && up.med === null && !up.rest.resting, JSON.stringify({ note, up }));
    // De pé em cima da pedra, o save volta da FRENTE dela: o tile da pedra é sólido, e o Continue o punha dentro dela
    // (RunSave.respawnTile).
    const respawn = await page.evaluate(() => JSON.parse(localStorage.getItem('zh.cozy.v1') ?? '{}').respawn ?? null);
    assert('4 · Meditação: de pé na pedra, o save volta da frente dela, e não de dentro da pedra', respawn?.worldX === 30 && respawn?.worldY === 21, JSON.stringify(respawn));

    // ── 5. DOIS DEDOS: um segura o fôlego, outro sai da tela (o polegar que tocou o B), e o fôlego não cai. ──────
    await go(30, 21, 0, -1);
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.gameDebug.camp.meditation() !== null, null, { timeout: 5000 }).catch(() => {});
    await page.mouse.move(640, 500);
    await page.mouse.down();
    await sleep(400);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, pointerType: 'touch' })));
    await sleep(150);
    const held = await camp(() => window.gameDebug.camp.meditation()?.holding);
    await page.mouse.up();
    await sleep(150);
    const released = await camp(() => window.gameDebug.camp.meditation()?.holding);
    assert('5 · Meditação: outro dedo saindo da tela não solta o fôlego; soltar o próprio, sim', held === true && released === false, JSON.stringify({ held, released }));
    await page.keyboard.press('Escape');
    await sleep(800);
  },
};
