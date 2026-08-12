// O PRÓLOGO — a economia inteira, do primeiro cobre até a Morte agradecendo.
//
// O modo começava com 100 moedas, e 100 comprava o baralho todo sem o jogador fazer nada: as
// cartas eram um menu e o mundo, uma tela de escolha. Agora a bolsa começa em ZERO, e este cenário
// percorre a corrente inteira que isso criou — cada assert é um elo, e um elo partido em qualquer
// ponto deixa o prólogo impossível de terminar:
//
//   1. A BOLSA COMEÇA VAZIA, e o selo da estrada anuncia o preço da carta mais barata.
//   2. A PRIMEIRA MOEDA VEM DO ESCURO: a caveira que entra pela estrada não comprada paga, e é
//      esse dinheiro que compra a primeira terra.
//   3. A MÃO SEMPRE TRAZ O QUE DÁ PRA PAGAR. Sorteio puro deixava o botão dizer "BUILD" e a mesa
//      não abrir — com a bolsa em zero isso deixaria de ser azar raro e viraria o caso comum.
//   4. A OFICINA EXISTE: a carta do astronauta traz a cadeia do ferro inteira dentro dela
//      (machado, balde, lenha que rebrota, poça, bancada). Sem qualquer uma dessas peças o pedido
//      dele é impossível de atender, e o prólogo não tem final.
//   5. A CARVOARIA: madeira + madeira no FORNO vira carvão. É o elo que tirou o teto da economia —
//      antes o carvão só saía de arbusto queimado (25%, sem rebrota), então cada mapa tinha um
//      número FINITO de barras de ferro dentro dele.
//   6. O FIM: a carta de 90 (dez barras) existe, está no baralho, e a Morte no meio dela diz que
//      o prólogo acabou.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'prologo',
  description: 'Bolsa zerada, a caveira que paga, a mão que sempre tem carta, a oficina do ferro e a Morte no fim.',
  needsGame: false,
  route: '/',
  async run({ driver, shot, assert, log }) {
    const page = driver.page;
    const state = () => driver.getState();
    const teleport = (x, y) => page.evaluate(([px, py]) => {
      const s = window.__scene;
      s.playerWorld.worldX = px;
      s.playerWorld.worldY = py;
      s.movementController.interruptMovement(px, py);
    }, [x, y]);
    const buy = async (id, gateX, gateY, coins) => {
      await page.evaluate((c) => window.__scene.explorerDebugSetCoins(c), coins);
      await page.evaluate((card) => window.__scene.explorerDebugSetNextOffers([card]), id);
      await teleport(gateX, gateY);
      await driver.settle(320);
      await driver.useItem();
      await page.waitForSelector('.zh-build-backdrop', { state: 'visible', timeout: 5000 });
      await driver.settle(520);
      await driver.press('Enter');
      await driver.settle(2200);
      await page.evaluate(() => window.__scene.enemyManager?.despawnAll());
    };

    await page.waitForFunction(() => window.__game?.scene.isActive('title'), null, { timeout: 30000 });
    await driver.settle(500);
    await driver.press('Enter');
    await page.waitForFunction(() => window.gameDebug?.getState()?.explorer?.builder != null, null, { timeout: 30000 });
    await driver.settle(1300);

    // ── 1. a bolsa vazia ────────────────────────────────────────────────────────────────────
    log('BOLSA: a expedicao comeca sem um cobre');
    const boot = await state();
    assert('A expedicao comeca com ZERO moedas (a bolsa de 100 acabou)',
      boot?.coins === 0 && boot?.explorer?.carried === 0,
      `wallet=${boot?.coins} run=${boot?.explorer?.carried}`);

    await teleport(10, 8);
    await driver.settle(320);
    const dormant = await page.locator('.zh-gate-prompt').textContent();
    assert('E o selo cobra o preco da carta mais barata do baralho (a cratera, 3)',
      /DORMANT ROAD/u.test(dormant ?? '') && /NEEDS 3 COINS/u.test(dormant ?? ''),
      dormant ?? 'sem prompt');

    // ── 2. a primeira moeda ─────────────────────────────────────────────────────────────────
    log('CAVEIRA: o primeiro dinheiro do jogo sai da estrada escura');
    await teleport(6, 8);
    await page.evaluate(() => {
      const s = window.__scene;
      s.inventory.add('sword', 1); // a espada esta no chao do acampamento; aqui ela vai direto pra mao
      s.enemyManager.spawn('undead', 6, 7, () => true);
    });
    await driver.settle(400);
    await driver.press('ArrowUp');
    await driver.settle(260);
    for (let i = 0; i < 10; i += 1) {
      if ((await state())?.undead?.length === 0) break;
      await driver.press('z', { count: 1, delay: 320 });
    }
    const dead = await state();
    assert('A caveira cai', (dead?.undead ?? []).length === 0, JSON.stringify(dead?.undead));
    // A moeda cai ao lado do corpo e VEM SOZINHA (o ímã, ver o bloco 2b): o herói não precisa
    // procurar nada. Este assert era um teleporte até o tile dela — hoje esperar basta, e isso
    // é o próprio recibo de que a coleta mudou.
    await driver.settle(1600);
    // O ímã alcança ~2 tiles; o espalhamento pode jogar a moeda um pouco além disso. Se ela ficou
    // fora do alcance, um passo até ela resolve — que é exatamente o que o jogador faria.
    if (((await state())?.explorer?.carried ?? 0) === 0) {
      const far = await page.evaluate(() => window.__scene.coinManager.getActiveWorldPositions());
      if (far[0]) await teleport(far[0].worldX, far[0].worldY);
      await driver.settle(900);
    }
    const paid = await state();
    assert('E ela PAGA: a primeira moeda do jogo veio de um corpo',
      (paid?.explorer?.carried ?? 0) >= 1 && (paid?.coins ?? 0) >= 1,
      `run=${paid?.explorer?.carried} wallet=${paid?.coins}`);

    // ── 2b. o ÍMÃ ───────────────────────────────────────────────────────────────────────────
    // A moeda deixou de ser um item que se PISA: dentro de ~2 tiles ela corre atrás do herói. É a
    // diferença entre catar e receber, e o assert prova a parte que a foto não prova — que ela foi
    // apanhada sem o herói jamais ter pisado no tile dela.
    log('IMA: a moeda corre atras do heroi');
    await teleport(6, 10);
    await page.evaluate(() => {
      const s = window.__scene;
      s.coinManager.spawnCoins(6, 8, s.chunkManager, 5);
    });
    await driver.settle(1100);
    const before = await page.evaluate(() => ({
      coins: window.gameDebug.getState().explorer.carried,
      tiles: window.__scene.coinManager.getActiveWorldPositions().map((c) => `${c.worldX},${c.worldY}`),
    }));
    await driver.walk('up', 1); // UM passo: o herói para em (6,9) e nunca pisa onde as moedas caíram
    await driver.settle(1200);
    const magnet = await page.evaluate(() => ({
      coins: window.gameDebug.getState().explorer.carried,
      player: `${window.__scene.playerWorld.worldX},${window.__scene.playerWorld.worldY}`,
    }));
    assert('Moeda perto vem sozinha — sem o heroi pisar no tile dela',
      magnet.coins > before.coins && !before.tiles.includes(magnet.player),
      `${JSON.stringify(before)} -> ${JSON.stringify(magnet)}`);

    // ── 3. a mao ────────────────────────────────────────────────────────────────────────────
    log('MAO: com dinheiro no bolso, sempre ha uma carta que ele pode pagar');
    const hands = await page.evaluate(() => {
      const explorer = window.__scene.explorer;
      const out = [];
      for (let i = 0; i < 24; i += 1) {
        const hand = explorer.offers(3).map((entry) => entry.catalog.cost);
        out.push({ hand, ok: hand.some((cost) => cost <= 3) });
      }
      return out;
    });
    assert('Toda mao sorteada com 3 moedas traz uma carta de ate 3',
      hands.every((h) => h.ok), JSON.stringify(hands.filter((h) => !h.ok).slice(0, 3)));
    const broke = await page.evaluate(() => window.__scene.explorer.offers(0).length);
    assert('E sem dinheiro nenhum a mesa ainda oferece (a recusa e do selo, nao um baralho vazio)',
      broke === 3, String(broke));

    // ── 4. a oficina ────────────────────────────────────────────────────────────────────────
    log('OFICINA: a carta do astronauta traz a cadeia do ferro inteira');
    await buy('crater-quarry', 10, 8, 3);
    const kit = await page.evaluate(() => {
      const s = window.__scene;
      const inChunk = (p) => Math.floor(p.worldX / 12) === 1 && Math.floor(p.worldY / 12) === 0;
      const items = s.itemManager.snapshot().filter(inChunk).map((i) => i.kind);
      return {
        items,
        dryTrees: s.dryTrees.filter(inChunk).length,
        water: s.waterTiles.filter(inChunk).length,
        bench: s.toolboxes.filter(inChunk).length,
        bushes: s.dryBushes.filter(inChunk).length,
        veins: s.rocks.filter((r) => inChunk(r) && r.ore).length,
        rocks: s.rocks.filter((r) => inChunk(r) && !r.ore).length,
        npcs: window.gameDebug.listNpcKinds(),
      };
    });
    assert('O machado e o balde estao no chao dela, ao lado da picareta',
      ['axe', 'bucket', 'pickaxe'].every((kind) => kit.items.includes(kind)), JSON.stringify(kit.items));
    assert('A lenha que REBROTA e a poca de agua existem (carvao renovavel + caldeira possivel)',
      kit.dryTrees >= 2 && kit.water >= 3, JSON.stringify(kit));
    assert('A bancada, o mato seco, os veios e as rochas estao la',
      kit.bench === 1 && kit.bushes >= 4 && kit.veins >= 2 && kit.rocks >= 2, JSON.stringify(kit));
    assert('E o astronauta mora nela', kit.npcs.includes('astronaut'), JSON.stringify(kit.npcs));

    await shot('prologo-oficina', {
      note: 'A oficina do astronauta: bancada, veio, mato seco, lenha e poca — a cadeia do ferro num mapa so.',
      state: kit,
    });

    // ── 5. a carvoaria ──────────────────────────────────────────────────────────────────────
    log('CARVOARIA: madeira + madeira no FORNO vira carvao');
    // Tile VAZIO de proposito: (18,5) e a fogueira da carta, e a guarda de ocupacao do
    // spawnStreamedProps (com razao) recusaria um forno em cima dela.
    await teleport(17, 8);
    await driver.settle(400);
    await page.evaluate(() => {
      const s = window.__scene;
      s.spawnStreamedProps([{ type: 'furnace', worldX: 17, worldY: 7, dir: 0 }]);
      s.inventory.clear();
      s.inventory.add('wood', 2);
      s.seenItems.add('wood');
    });
    await driver.settle(400);
    await driver.press('ArrowUp');
    await driver.settle(300);
    await driver.press('z', { count: 1 });
    await driver.settle(600);
    const menu = await page.evaluate(() => [...document.querySelectorAll('.zh-order-card')]
      .map((card) => card.dataset.kind));
    // O FORNO TAMBEM TEM ESCADA (catalogSteps): dois degraus, na ordem da propria quimica. Quem
    // nunca fez carvao ve UMA carta — a carvoaria —, e a esponja so entra na mesa depois dela.
    assert('O forno abre mostrando SO o primeiro degrau: a carvoaria',
      JSON.stringify(menu) === '["charcoal"]', JSON.stringify(menu));
    const built = await page.evaluate(async () => {
      const card = document.querySelector('.zh-order-card[data-kind="charcoal"]');
      if (!card) return null;
      card.click();
      await new Promise((r) => setTimeout(r, 700));
      const s = window.__scene;
      return {
        wood: s.inventory.count('wood'),
        onGround: s.itemManager.snapshot().filter((i) => i.kind === 'charcoal').length,
      };
    });
    assert('E fabricar gasta as duas madeiras e poe o carvao no chao',
      built?.wood === 0 && (built?.onGround ?? 0) >= 1, JSON.stringify(built));
    // E o degrau seguinte NASCE do primeiro: com o carvao conhecido, a esponja entra na mesa.
    await driver.settle(500);
    await driver.press('ArrowUp');
    await driver.settle(300);
    await driver.press('z', { count: 1 });
    await driver.settle(600);
    const menu2 = await page.evaluate(() => [...document.querySelectorAll('.zh-order-card')]
      .map((card) => card.dataset.kind));
    assert('Feito o carvao, a ESPONJA aparece como o proximo degrau',
      JSON.stringify(menu2) === '["charcoal","bloom"]', JSON.stringify(menu2));
    await page.keyboard.press('Escape');
    await driver.settle(400);

    // ── 6. o fim do prologo ─────────────────────────────────────────────────────────────────
    log('FIM: a carta de 90 moedas, e a Morte no meio dela');
    const finale = await page.evaluate(() => {
      const entry = window.__scene.explorer.source.catalog()
        .find((card) => card.catalog.id === 'prologue-end');
      return entry
        ? { cost: entry.catalog.cost, name: entry.catalog.name, npc: entry.npcs[0]?.type }
        : null;
    });
    assert('A ultima carta custa 90 (dez barras de ferro) e traz a Morte',
      finale?.cost === 90 && finale?.npc === 'death', JSON.stringify(finale));

    await buy('prologue-end', 6, 1, 90);
    const spent = await state();
    assert('Comprar o fim do prologo esvazia a bolsa', (spent?.coins ?? 99) === 0, `coins=${spent?.coins}`);

    // A Morte fica no centro exato do adro: chunk (0,-1), tile local (6,6) → mundo (6,-6).
    await teleport(6, -5);
    await driver.settle(500);
    await driver.press('ArrowUp');
    await driver.settle(300);
    await driver.press('x', { count: 1 });
    await driver.settle(1400);
    const speech = await page.evaluate(() => document.querySelector('.zh-dlg-panel')?.innerText ?? '');
    assert('A Morte fala, e ela fala do PROLOGO (nao das linhas de medo da fogueira apagada)',
      /DEATH/iu.test(speech) && /road stops|bought your way|prologue/iu.test(speech),
      JSON.stringify(speech.slice(0, 200)));
    await shot('prologo-fim', {
      note: 'A Morte no meio do adro: o fim do prologo.',
      state: { finale, speech: speech.slice(0, 240) },
    });
    // Duas teclas por fala (a primeira termina de datilografar, a segunda vira a linha), e o
    // texto é lido a CADA passo: no fim das quatro falas o painel fecha, e ler só depois do
    // último Z devolveria a tela vazia.
    let thanks = '';
    for (let i = 0; i < 10; i += 1) {
      const now = await page.evaluate(() => document.querySelector('.zh-dlg-panel')?.innerText ?? '');
      if (now) thanks = now;
      if (/thank you for testing/iu.test(thanks)) break;
      await driver.press('z', { count: 1 });
      await sleep(420);
    }
    assert('E ela agradece o teste', /thank you for testing/iu.test(thanks),
      JSON.stringify(thanks.slice(-200)));
  },
};
