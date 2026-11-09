// DICAS — o que deixa óbvio o que fazer (pedido do autor):
//   1. o porcini, o primeiro corte do jogo, nasce três tiles à esquerda da Shui (scripts/porcini-da-hollis.mjs);
//      na fala "aqui do meu lado esquerdo", a câmera vai até ele e volta para ela;
//   2. o balão de pensamento de uma FERRAMENTA ÚNICA ganha uma pontinha virada para onde ela está: quem a dá, ou
//      o chão onde ela ficou. A foice (a Morte não tem casa) só aponta quando está no chão;
//   3. em volta de cada cogumelo, cogumelinhos-filhos da mesma espécie, mais juntos perto dele, que somem na colheita.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'dicas',
  description: 'O porcini ao lado da Shui com o olhar da câmera, e a pontinha do balão das ferramentas únicas.',
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
      const g = window.gameDebug; window.gameTime.set(0.45);
      g.hero.teleport(5, 41, 0, -1);
      const porcini = g.items.ground().filter((i) => i.kind === 'porcini');
      const shui = g.npcs.list().find((n) => n.kind === 'radiationSuit');
      return { porcini, shui };
    });
    const near = place.porcini.find((p) => place.shui && p.worldY === place.shui.worldY && p.worldX === place.shui.worldX - 3);
    assert('O porcini nasce três tiles à esquerda da Shui, na mesma linha', Boolean(near), JSON.stringify(place));
    await sleep(800);
    await shot('00-porcini', { note: 'O porcini à vista, à esquerda da Shui' });

    // A conversa: a câmera fica na Shui até a linha do porcini, vai até ele e volta.
    await page.keyboard.press('z');
    const hintText = await page.evaluate(() => window.gameDebug.world.lines('npc.radiationSuitHint.porcini')[0]);
    assert('A dica do porcini fala do lado esquerdo e do corte', /esquerdo/i.test(hintText) && /corte/i.test(hintText), hintText);
    let rest = null;
    let farthest = 0;
    let shotDone = false;
    let backAt = null;
    for (let i = 0; i < 90; i += 1) {
      await sleep(200);
      const st = await state();
      if (!st.dialogOpen) break;
      const now = await page.evaluate(() => {
        const g = window.gameDebug;
        const line = g.dialog.box()?.line ?? null;
        return { cx: g.scene.cameraCentreX(), line, text: line === null ? null : g.dialog.lines()?.[line] };
      });
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
    assert('E volta para a Shui, com a conversa aberta', backAt !== null, String(backAt));
    for (let i = 0; i < 20 && (await state()).dialogOpen; i += 1) { await page.keyboard.press('z'); await sleep(400); }
    for (let i = 0; i < 10 && ((await state()).itemGetOpen || (await state()).cutsceneActive); i += 1) { await page.keyboard.press('z'); await sleep(400); }

    // ── 2. A PONTINHA ─────────────────────────────────────────────────────────────────────────
    const point = await page.evaluate(() => {
      const g = window.gameDebug;
      const home = (kind) => g.npcs.list().find((n) => n.kind === kind) ?? null;
      const [axe, shovel, scythe, wood] = ['axe', 'shovel', 'scythe', 'wood'].map((k) => g.forage.toolSource(k));
      return { axe, shovel, scythe, wood, marco: home('businessMan'), sisi: home('painter') };
    });
    log(`  pontinha: ${JSON.stringify(point)}`);
    assert('O machado aponta para o Marco', point.axe && point.axe.x === 53 && point.axe.y === 5, JSON.stringify(point.axe));
    assert('A pá aponta para a Sisi', point.shovel && point.shovel.x === 17 && point.shovel.y === 17, JSON.stringify(point.shovel));
    assert('A foice, que a Morte entrega, não tem pontinha', point.scythe === null, JSON.stringify(point.scythe));
    assert('Coisa comum (graveto) não tem pontinha', point.wood === null, JSON.stringify(point.wood));

    // O balão na tela, apontando: o herói diante de uma árvore seca, sem machado.
    const shown = await page.evaluate(() => {
      const g = window.gameDebug; window.gameTime.set(0.45);
      const t = g.props.dryTrees()[0];
      g.hero.teleport(t.x, t.y + 1, 0, -1);
      return [t.x, t.y];
    });
    await sleep(600);
    const balloon = await page.evaluate(([x, y]) => {
      const g = window.gameDebug;
      g.forage.thinkOfNeed(x, y);
      const th = g.forage.thought();
      return { icon: th.icon, to: th.pointing };
    }, shown);
    await sleep(250);
    await shot('02-pontinha', { note: 'O balão do machado, com a pontinha virada para o Marco' });
    assert('Sem machado, diante da árvore seca, o herói pensa no machado com a pontinha no Marco', balloon.icon === 'axe-icon' && balloon.to?.x === 53 && balloon.to?.y === 5, JSON.stringify(balloon));

    // ── 3. OS COGUMELINHOS-FILHOS ─────────────────────────────────────────────────────────────
    const kinds = ['porcini', 'morel', 'puffball', 'inkCap', 'chanterelle', 'flyAgaric'];
    const kin = await page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, window.gameDebug.forage.kin(k)])), kinds);
    log(`  filhos: ${JSON.stringify(kin)}`);
    assert('Cada cogumelo tem cogumelinhos-filhos em volta (a trilha que leva a ele)', kinds.every((k) => kin[k] >= 2), JSON.stringify(kin));
    await page.evaluate(() => {
      const g = window.gameDebug; window.gameTime.set(0.45);
      g.hero.teleport(2, 43, 0, -1);
    });
    await sleep(900);
    await shot('03-filhos', { note: 'Os cogumelinhos-filhos em volta do porcini' });
    await page.evaluate(() => window.gameDebug.forage.basket('porcini', 2, 40));
    await sleep(2500);
    const after = await page.evaluate(() => window.gameDebug.forage.kin('porcini'));
    assert('Colhido o porcini, os filhos dele somem', after === 0, String(after));
  },
};
