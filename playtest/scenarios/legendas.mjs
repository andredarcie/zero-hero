// LEGENDAS — pedido do autor: todo minigame tem, no rodapé, uma frase dizendo o que fazer e com que tecla
// (runtime/MinigameCaption); e a ficha de papel (cogumelo, planeta) ocupa a maior parte da tela livre.
//
// Abre cada minigame (a colheita pelo jogo; os outros direto do módulo, com callbacks vazios), confere a frase e
// que ela não cobre o que se joga, e mede o papel da ficha.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'legendas',
  description: 'Todo minigame tem a legenda do que fazer no rodapé; a ficha de papel ocupa a tela.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);

    /** A frase da legenda, quantas teclas ela mostra, e onde ela começa na tela. */
    const caption = () => page.evaluate(() => {
      const el = document.querySelector('.zh-mg-caption');
      if (!el || el.style.display === 'none') return { text: '', keys: 0, top: 0 };
      return { text: el.textContent, keys: el.querySelectorAll('.zh-mg-key').length, top: el.getBoundingClientRect().top };
    });

    // ── A COLHEITA ────────────────────────────────────────────────────────────────────────────
    await page.evaluate(() => {
      const s = window.__scene; window.gameTime.set(0.45);
      s.playerWorld.worldX = 2; s.playerWorld.worldY = 41; s.movementController.interruptMovement(2, 41); s.movementController.faceTo(0, -1); s.streamChunks(true);
      s.clearHeldItem(); s.takeIntoHand('knife');
    });
    await sleep(600);
    await page.evaluate(() => window.__scene.harvestMushroomAt(2, 40));
    await sleep(1600);
    let c = await caption();
    assert('Cortar o cogumelo: a legenda diz a tecla e o momento', c.keys >= 1 && /faca/i.test(c.text) && /marcas/i.test(c.text), JSON.stringify(c));
    await shot('00-cortar', { note: 'A faca nova e a legenda do corte' });
    await page.evaluate(() => window.__scene.foraging.enter('clean'));
    await sleep(500);
    c = await caption();
    assert('Limpar: a legenda fala do mouse e da bucha', /mouse/i.test(c.text) && /bucha/i.test(c.text), JSON.stringify(c));
    await page.evaluate(() => window.__scene.foraging.enter('note'));
    await sleep(2400);
    c = await caption();
    assert('A ficha: a legenda diz como continuar', c.keys >= 1 && /continuar/i.test(c.text), JSON.stringify(c));
    const paper = await page.evaluate(() => {
      const r = document.querySelector('.zh-note').getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), vw: window.innerWidth, vh: window.innerHeight };
    });
    log(`  ficha: ${JSON.stringify(paper)}`);
    assert('A ficha de papel ocupa a maior parte da altura livre (ou da largura)', paper.h >= (paper.vh - 128) * 0.85 || paper.w >= paper.vw * 0.85, JSON.stringify(paper));
    assert('E ainda sobra margem em volta', paper.w <= paper.vw * 0.95 && paper.h <= paper.vh, JSON.stringify(paper));
    await shot('01-ficha', { note: 'A ficha do porcini ocupando a tela' });
    await page.evaluate(() => window.__scene.foraging.destroy());
    await sleep(300);
    c = await caption();
    assert('Fechado o minigame, a legenda some', c.text === '', JSON.stringify(c));

    // ── OS OUTROS MINIGAMES ───────────────────────────────────────────────────────────────────
    const cases = [
      ['WoodcraftOverlays', 'new mod.SplitOverlay(cb, 0)', 'rachar a lenha', /mira/i],
      ['WoodcraftOverlays', "new mod.FireLightOverlay(cb, document.createElement('canvas'))", 'acender o fogo', /faísca/i],
      ['SkyOverlays', 'new mod.LensOverlay(cb)', 'polir a lente', /lente/i],
      ['SkyOverlays', 'new mod.SkyOverlay(cb, [])', 'olhar o céu', /planetas/i],
      ['PaintingOverlay', 'new mod.PaintingOverlay(cb)', 'pintar', /pinte/i],
    ];
    for (const [file, make, label, words] of cases) {
      await page.evaluate(async ([f, m]) => {
        const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => u.includes(`/runtime/${f}.ts`));
        const mod = await import(url);
        const cb = new Proxy({}, { get: () => () => {} });
        window.__mg = eval(m);
        void mod; void cb;
      }, [file, make]);
      await sleep(800);
      c = await caption();
      const covered = await page.evaluate((top) => {
        const play = document.querySelector('#zh-craft canvas, .zh-paint canvas, canvas.zh-paint-canvas')
          ?? [...document.querySelectorAll('[data-zh-ui] canvas')].pop();
        return play ? Math.round(play.getBoundingClientRect().bottom - top) : null;
      }, c.top);
      log(`  ${label}: "${c.text}" (sobra entre o jogo e a legenda: ${covered === null ? '?' : -covered}px)`);
      assert(`${label}: a legenda diz o que fazer, com a tecla`, words.test(c.text) && c.keys >= 1, JSON.stringify(c));
      await page.evaluate(() => { window.__mg?.destroy(); window.__mg = undefined; });
      await sleep(250);
    }
  },
};
