// DICAS — o que deixa óbvio o que fazer (pedido do autor):
//   1. o porcini, o primeiro corte do jogo, nasce três tiles à esquerda da Hollis (scripts/porcini-da-hollis.mjs);
//      na fala "aqui do meu lado esquerdo", a câmera vai até ele e volta para ela;
//   2. o balão de pensamento de uma FERRAMENTA ÚNICA ganha uma pontinha virada para onde ela está: quem a dá, ou
//      o chão onde ela ficou. A foice (a Morte não tem casa) só aponta quando está no chão;
//   3. em volta de cada cogumelo, cogumelinhos-filhos da mesma espécie, mais juntos perto dele, que somem na colheita.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'dicas',
  description: 'O porcini ao lado da Hollis com o olhar da câmera, e a pontinha do balão das ferramentas únicas.',
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

    // ── 1. O PORCINI ──────────────────────────────────────────────────────────────────────────
    const place = await page.evaluate(() => {
      const s = window.__scene; window.gameTime.set(0.45);
      s.playerWorld.worldX = 5; s.playerWorld.worldY = 41; s.movementController.interruptMovement(5, 41); s.movementController.faceTo(0, -1); s.streamChunks(true);
      const porcini = s.itemManager.snapshot().filter((i) => i.kind === 'porcini');
      const hollis = s.npcManager.getActiveWorldPositions().find((n) => n.kind === 'radiationSuit');
      return { porcini, hollis };
    });
    const near = place.porcini.find((p) => place.hollis && p.worldY === place.hollis.worldY && p.worldX === place.hollis.worldX - 3);
    assert('O porcini nasce três tiles à esquerda da Hollis, na mesma linha', Boolean(near), JSON.stringify(place));
    await sleep(800);
    await shot('00-porcini', { note: 'O porcini à vista, à esquerda da Hollis' });

    // A conversa: a câmera fica na Hollis até a linha do porcini, vai até ele e volta.
    await page.keyboard.press('z');
    const hintText = await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => u.includes('/i18n/i18n.ts'));
      const { tLines } = await import(url);
      return tLines('npc.radiationSuitHint.porcini')[0].text;
    });
    assert('A dica do porcini fala do lado esquerdo e do corte', /esquerdo/i.test(hintText) && /corte/i.test(hintText), hintText);
    let rest = null;
    let farthest = 0;
    let shotDone = false;
    let backAt = null;
    for (let i = 0; i < 90; i += 1) {
      await sleep(200);
      const st = await state();
      if (!st.dialogOpen) break;
      const now = await page.evaluate(() => ({ cx: window.__scene.camera.screenCenterX, line: window.__scene.dialogOverlay.lineIndex, text: window.__scene.dialogOverlay.script?.lines[window.__scene.dialogOverlay.lineIndex]?.text }));
      if (now.text !== hintText) {
        if (rest === null && i > 3) rest = now.cx;
        if (i % 4 === 3) await page.keyboard.press('z');
        continue;
      }
      farthest = Math.max(farthest, Math.abs(now.cx - (rest ?? now.cx)));
      if (!shotDone && farthest > 100) { shotDone = true; await sleep(500); await shot('01-olhar', { note: 'Na fala dela, a câmera vai até o porcini' }); }
      if (farthest > 100 && rest !== null && Math.abs(now.cx - rest) < 4) { backAt = now.cx; break; }
    }
    log(`  câmera: repouso ${rest}, maior desvio ${farthest}, voltou em ${backAt}`);
    assert('Na linha do porcini a câmera vai até ele', farthest > 100, String(farthest));
    assert('E volta para a Hollis, com a conversa aberta', backAt !== null, String(backAt));
    for (let i = 0; i < 20 && (await state()).dialogOpen; i += 1) { await page.keyboard.press('z'); await sleep(400); }
    for (let i = 0; i < 10 && ((await state()).itemGetOpen || (await state()).cutsceneActive); i += 1) { await page.keyboard.press('z'); await sleep(400); }

    // ── 2. A PONTINHA ─────────────────────────────────────────────────────────────────────────
    const point = await page.evaluate(() => {
      const s = window.__scene;
      const home = (kind) => s.npcManager.getActiveWorldPositions().find((n) => n.kind === kind) ?? null;
      const axe = s.uniqueItemSource('axe');
      const shovel = s.uniqueItemSource('shovel');
      const scythe = s.uniqueItemSource('scythe');
      const wood = s.uniqueItemSource('wood');
      s.itemManager.dropAt?.('scythe', 30, 50);
      return { axe, shovel, scythe, wood, bram: home('businessMan'), iris: home('painter') };
    });
    log(`  pontinha: ${JSON.stringify(point)}`);
    assert('O machado aponta para o Bram', point.axe && point.axe.x === 53 && point.axe.y === 5, JSON.stringify(point.axe));
    assert('A pá aponta para a Iris', point.shovel && point.shovel.x === 17 && point.shovel.y === 17, JSON.stringify(point.shovel));
    assert('A foice, que a Morte entrega, não tem pontinha', point.scythe === null, JSON.stringify(point.scythe));
    assert('Coisa comum (graveto) não tem pontinha', point.wood === null, JSON.stringify(point.wood));

    // O balão na tela, apontando: o herói diante de uma árvore seca, sem machado.
    const shown = await page.evaluate(() => {
      const s = window.__scene; window.gameTime.set(0.45);
      const t = s.dryTrees[0];
      s.playerWorld.worldX = t.worldX; s.playerWorld.worldY = t.worldY + 1;
      s.movementController.interruptMovement(t.worldX, t.worldY + 1); s.movementController.faceTo(0, -1); s.streamChunks(true);
      return [t.worldX, t.worldY];
    });
    await sleep(600);
    const balloon = await page.evaluate(([x, y]) => {
      const s = window.__scene;
      s.thinkOfNeed(x, y, true);
      return { icon: s.heroThought.visibleIcon, to: s.heroThought.pointing };
    }, shown);
    await sleep(250);
    await shot('02-pontinha', { note: 'O balão do machado, com a pontinha virada para o Bram' });
    assert('Sem machado, diante da árvore seca, o herói pensa no machado com a pontinha no Bram', balloon.icon === 'axe-icon' && balloon.to?.x === 53 && balloon.to?.y === 5, JSON.stringify(balloon));

    // ── 3. OS COGUMELINHOS-FILHOS ─────────────────────────────────────────────────────────────
    const kinds = ['porcini', 'morel', 'puffball', 'inkCap', 'chanterelle', 'flyAgaric'];
    const kin = await page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, window.__scene.mushroomKin?.count(k) ?? 0])), kinds);
    log(`  filhos: ${JSON.stringify(kin)}`);
    assert('Cada cogumelo tem cogumelinhos-filhos em volta (a trilha que leva a ele)', kinds.every((k) => kin[k] >= 2), JSON.stringify(kin));
    await page.evaluate(() => {
      const s = window.__scene; window.gameTime.set(0.45);
      s.playerWorld.worldX = 2; s.playerWorld.worldY = 43; s.movementController.interruptMovement(2, 43); s.movementController.faceTo(0, -1); s.streamChunks(true);
    });
    await sleep(900);
    await shot('03-filhos', { note: 'Os cogumelinhos-filhos em volta do porcini' });
    await page.evaluate(() => window.__scene.basketMushroom('porcini', 2, 40));
    await sleep(2500);
    const after = await page.evaluate(() => window.__scene.mushroomKin?.count('porcini') ?? 0);
    assert('Colhido o porcini, os filhos dele somem', after === 0, String(after));
  },
};
