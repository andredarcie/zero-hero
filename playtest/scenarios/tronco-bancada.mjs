// O TRONCO E A BANCADA (pedido do autor, 2026-11-17): o banquinho saiu (o tronco já senta; o banquinho posto num save
// antigo vira tronco), o herói sentado no tronco fica NA FRENTE dele (o tronco não o esconde mais), e a bancada se usa
// DE FRENTE — o carvalhinho que tapava a frente dela saiu do mapa. E CADA PEÇA UMA VEZ SÓ: o tronco posto não está nas
// cartas; levantado e desmontado, volta para elas com o material de volta na bancada, e se constrói de novo.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** O banquinho do save antigo, aqui: vira o tronco em que o herói senta. */
const LOG = [52, 49];
const BENCH_FRONT = [55, 46];

export default {
  name: 'tronco-bancada',
  description: 'O banquinho saiu, o herói senta na frente do tronco, e a bancada se usa de frente.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    const teleport = async (x, y, dx, dy) => { await g(([a, b, c, d]) => window.gameDebug.hero.teleport(a, b, c, d), [x, y, dx, dy]); await sleep(300); };
    await page.addInitScript(([lx, ly]) => {
      if (sessionStorage.getItem('tronco')) return;
      sessionStorage.setItem('tronco', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({
        started: true, introSeen: true, day: 0, clock: 0.42, respawn: { worldX: 54, worldY: 51 },
        // um save de antes: um banquinho posto (que agora vira tronco)
        home: { pieces: [{ kind: 'stool', x: lx, y: ly }], built: ['stool'], stock: { wood: 5, stone: 0, charcoal: 0, ore: 0 } },
      }));
    }, LOG);
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);

    // ── O BANQUINHO SAIU ──────────────────────────────────────────────────────────────────────────────────────────
    const old = await g(([x, y]) => window.gameDebug.valley.campAt(x, y), LOG);
    const built = await g(() => window.gameDebug.camp.home().built);
    assert('O banquinho de um save antigo vira tronco, no mesmo tile', old === 'log' && built.join() === 'log', JSON.stringify({ old, built }));

    // ── SENTAR NO TRONCO: O HERÓI NA FRENTE DELE ──────────────────────────────────────────────────────────────────
    await teleport(LOG[0], LOG[1] + 1, 0, -1);
    await page.keyboard.press('z');
    await sleep(1200);
    const sat = await g(([x, y]) => ({ rest: window.gameDebug.camp.rest(), at: window.gameDebug.hero.at(), body: window.gameDebug.valley.pieceBody(x, y), lift: window.gameDebug.getState().heroLift }), LOG);
    log(`  sentado: ${JSON.stringify(sat)}`);
    assert('O Z no tronco senta o herói em cima dele', sat.rest.resting && sat.at.x === LOG[0] && sat.at.y === LOG[1], JSON.stringify(sat));
    assert('O tronco fica um nada atrás do herói sentado (ele aparece sentado, não escondido)', sat.body && sat.body.y < sat.at.y, JSON.stringify(sat));
    assert('O corpo sobe no tampo do tronco (o tronco aparece embaixo dele)', Math.abs(sat.lift - 0.25) < 0.01, JSON.stringify({ lift: sat.lift }));
    await g(() => window.gameDebug.verbs.hidePrompt());
    await g(() => window.gameDebug.scene.dollyTo(0.7, 10));
    await sleep(900);
    await shot('00-sentado-no-tronco', { note: 'O herói sentado no tronco, na frente dele' });
    await g(() => window.gameDebug.scene.dollyTo(1, 10));
    await page.keyboard.press('ArrowDown');
    await sleep(900);
    const up = await g(() => ({ resting: window.gameDebug.camp.rest().resting, lift: window.gameDebug.getState().heroLift }));
    assert('Ao levantar, o corpo desce do tronco para o chão', !up.resting && up.lift === 0, JSON.stringify(up));

    // ── A BANCADA DE FRENTE ───────────────────────────────────────────────────────────────────────────────────────
    const front = await g(([x, y]) => ({ solid: window.gameDebug.world.solid(x, y), kind: window.gameDebug.valley.campAt(x, y) }), BENCH_FRONT);
    assert('A frente da bancada (55,46) está livre: o carvalhinho saiu', !front.solid && front.kind === null, JSON.stringify(front));
    await teleport(BENCH_FRONT[0], BENCH_FRONT[1], 0, -1);
    const prompt = await g(([x, y]) => window.gameDebug.verbs.prompt(x, y), BENCH_FRONT);
    assert('De frente para a bancada, o balão diz Construir', prompt.some((l) => /Construir|Build/u.test(l)), JSON.stringify(prompt));
    await g(() => window.gameDebug.verbs.hidePrompt());
    await g(() => window.gameDebug.scene.dollyTo(0.75, 10));
    await sleep(900);
    await shot('01-bancada-de-frente', { note: 'O herói diante da bancada, de frente' });
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.gameDebug.camp.build().open, null, { timeout: 8000 });
    await sleep(500);
    const b = await g(() => window.gameDebug.camp.build());
    assert('O Z de frente abre a bancada; nas cartas não há banquinho; e a frente dela não recebe peça',
      b.open && !b.cards.some((c) => c.kind === 'stool') && !b.cells.some((c) => c.x === BENCH_FRONT[0] && c.y === BENCH_FRONT[1]),
      JSON.stringify({ cards: b.cards.map((c) => c.kind) }));

    // ── CADA PEÇA UMA VEZ SÓ: o tronco posto não está nas cartas; desmontado volta, e se constrói de novo ─────────
    const kinds = async () => (await g(() => window.gameDebug.camp.build())).cards.map((c) => c.kind);
    const wood = async () => (await g(() => window.gameDebug.camp.home())).stock.wood;
    const clickTile = async (x, y) => {
      const px = await g(([a, c]) => window.gameDebug.camp.buildTilePx(a, c), [x, y]);
      await page.mouse.click(px.x, px.y);
      await sleep(400);
    };
    const before = { cards: await kinds(), wood: await wood() };
    assert('O tronco já posto não aparece nas cartas (a escada oferece a próxima)', !before.cards.includes('log') && before.cards.includes('sign'), JSON.stringify(before));
    await shot('02-tronco-fora-da-lista', { note: 'O tronco está no acampamento: a carta dele não está na tábua' });
    await clickTile(...LOG);
    const scrapVisible = await page.evaluate(() => [...document.querySelectorAll('#zh-build .zh-build-foot button')].some((el) => el.textContent === 'Desmontar' && !el.hidden));
    assert('Clicado, o tronco sobe para a mão, e aparece o botão Desmontar', scrapVisible, '');
    await shot('03-tronco-levantado', { note: 'O tronco levantado: mudar de lugar ou Desmontar' });
    await page.click('#zh-build .zh-build-foot button:has-text("Desmontar")');
    await sleep(500);
    const after = { cards: await kinds(), wood: await wood(), at: await g(([x, y]) => window.gameDebug.valley.campAt(x, y), LOG) };
    assert('Desmontado: o tronco sai do acampamento, os 2 gravetos voltam à bancada e a carta volta', after.at === null && after.wood === before.wood + 2 && after.cards.includes('log') && after.cards.includes('sign'), JSON.stringify({ before, after }));
    await shot('04-tronco-desmontado', { note: 'Desmontado: a carta do tronco de volta na tábua' });
    await page.click('.zh-build-card[data-kind="log"]');
    await sleep(250);
    await clickTile(...LOG);
    const again = { cards: await kinds(), wood: await wood(), at: await g(([x, y]) => window.gameDebug.valley.campAt(x, y), LOG) };
    assert('Construído de novo: paga de novo e a carta sai outra vez', again.at === 'log' && again.wood === before.wood && !again.cards.includes('log'), JSON.stringify(again));
    await page.keyboard.press('Escape');
    await sleep(600);
    await g(() => window.gameDebug.scene.dollyTo(1, 10));
  },
};
