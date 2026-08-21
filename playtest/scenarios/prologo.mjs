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
//   6. O FIM: a carta mais cara do baralho (36, quatro barras) existe, e a Morte no meio dela diz que
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
    assert('E o selo cobra o preco da carta mais barata do baralho (uma carta do gato, 1)',
      /DORMANT ROAD/u.test(dormant ?? '') && /NEEDS 1 COINS/u.test(dormant ?? ''),
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
    await driver.settle(1400);
    const dead = await state();
    assert('A caveira enfrentada cai (uma nova pode estar nascendo na estrada)',
      (dead?.undead ?? []).every((enemy) => enemy.spawning), JSON.stringify(dead?.undead));
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

    // ── 2c. QUEM PAGA E A MORTE, NAO O GOLPE ────────────────────────────────────────────────
    // A moeda saia do `strike` da espada, entao um corpo comido pelo fogo (ou assado na beira de
    // uma fogueira, que hoje e o fim mais comum de uma caveira) morria de graca. Agora quem toca o
    // sino e o `die()` — e o teste e uma caveira que o heroi nunca encostou.
    log('SEM O HEROI: uma caveira que o fogo come tambem paga');
    const coinsOnGround = () => page.evaluate(
      () => window.__scene.coinManager.getActiveWorldPositions().length,
    );
    // O ima ja puxou tudo o que alcancava; o que sobrou no chao esta fora do raio dele e nao se
    // mexe mais. Sem esta pausa, uma moeda velha sendo apanhada no meio do incendio entraria na
    // conta como se o corpo tivesse largado uma a menos.
    await driver.settle(900);
    const groundBefore = await coinsOnGround();
    // Tres tiles ao norte: fora do ima (~2 tiles), e o panico corre PARA LONGE do heroi — entao
    // as moedas deste corpo caem longe e ficam no chao, contaveis.
    await page.evaluate(() => {
      window.__scene.enemyManager.spawn('undead', 6, 6, () => true);
    });
    await page.waitForFunction(
      () => (window.gameDebug?.getState()?.undead ?? [])
        .some((u) => u.worldX === 6 && u.worldY === 6 && u.spawning === false),
      null, { timeout: 20000 },
    );
    await page.evaluate(() => window.__scene.igniteFlammableAt(6, 6));
    // O fogo come o corpo em ~2,6s, correndo em panico — ele morre alguns tiles adiante.
    await page.waitForFunction(
      () => (window.gameDebug?.getState()?.undead ?? []).length === 0,
      null, { timeout: 15000 },
    );
    await driver.settle(600);
    const dropped = (await coinsOnGround()) - groundBefore;
    const mult = (await state())?.explorer?.multiplier ?? 0;
    assert('...e o multiplicador aqui e 1 (o degrau tem 24 tiles, e isto e o quintal do acampamento)',
      mult === 1, `multiplier=${mult}`);
    assert('A caveira que o fogo matou LARGOU moeda',
      dropped >= 1, `caiu ${dropped} moeda(s), incluindo outras mortes no mesmo fogo`);

    // ── 3. a mao ────────────────────────────────────────────────────────────────────────────
    log('MAO: a estreia traz tres cartas do gato a 1, e dali em diante sempre ha uma pagavel');
    // A MAO DE ABERTURA: enquanto nada foi comprado ela nao se sorteia — sao as tres mais
    // cartas do gato, e as tres custam uma moeda. A primeira decisao do jogo tem de ser uma
    // decisao, e uma carta ao alcance ao lado de dois cadeados nao e escolher entre tres coisas.
    const opening = await page.evaluate(() => {
      const explorer = window.__scene.explorer;
      const draw = () => explorer.offers(3).map((entry) => entry.catalog.id);
      const first = draw();
      return { first, costs: explorer.offers(3).map((e) => e.catalog.cost), stable: draw().join() === first.join() };
    });
    assert('A mao de abertura traz TRES cartas do gato a 1 moeda',
      opening.costs.length === 3 && opening.costs.every((cost) => cost === 1)
        && opening.first.every((id) => id.startsWith('cat-')),
      JSON.stringify(opening));
    assert('E ela nao se sorteia: repetir a pergunta devolve o mesmo trio',
      opening.stable, JSON.stringify(opening.first));
    const broke = await page.evaluate(() => window.__scene.explorer.offers(0).length);
    assert('E sem dinheiro nenhum a mesa ainda oferece (a recusa e do selo, nao um baralho vazio)',
      broke === 3, String(broke));

    // ── 4. a oficina ────────────────────────────────────────────────────────────────────────
    log('OFICINA: a carta do astronauta traz a cadeia do ferro inteira');
    await buy('crater-quarry', 10, 8, 7);
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
    assert('A lenha que REBROTA e a poca de agua existem (carvao renovavel + balde utilizavel)',
      kit.dryTrees >= 2 && kit.water >= 3, JSON.stringify(kit));
    assert('A bancada, o mato seco, os veios e as rochas estao la',
      kit.bench === 1 && kit.bushes >= 4 && kit.veins >= 2 && kit.rocks >= 2, JSON.stringify(kit));
    assert('E o astronauta mora nela', kit.npcs.includes('astronaut'), JSON.stringify(kit.npcs));

    // Com a primeira carta gasta, a mao volta a ser SORTEADA — e e aqui que a promessa antiga
    // vale: se existe carta que ele pode pagar, ela esta na mesa (senao o selo diz BUILD e a
    // mesa nao abre). Este teste so pode viver DEPOIS de uma compra.
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
      const s = window.__scene;
      // A FORNADA E UM PROCESSO (ver FurnaceObject.startHandSmelt): confirmar fecha o painel e
      // acende a maquina; o carvao so pula pela boca ~2s depois. Esperar o item — e nao um relogio
      // — deixa o teste imune ao tempo exato do ciclo.
      const charcoals = () => s.itemManager.snapshot().filter((i) => i.kind === 'charcoal').length;
      const trabalhando = s.furnaces.some((f) => f.isBusy);
      for (let i = 0; i < 60 && charcoals() === 0; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return { wood: s.inventory.count('wood'), onGround: charcoals(), trabalhando };
    });
    assert('E fabricar gasta as duas madeiras e o FORNO trabalha antes de entregar',
      built?.wood === 0 && built?.trabalhando === true, JSON.stringify(built));
    assert('...e no fim o carvao sai no chao', (built?.onGround ?? 0) >= 1, JSON.stringify(built));
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

    // ── 5b. o LAGO: a carta que virou uma renda ─────────────────────────────────────────────
    // O lago traz três zoras, que valem mais moedas que a caveira e dão função econômica ao local.
    log('LAGO: tres bichos de agua');
    // O portao e escolhido em tempo de execucao, e NUNCA o norte: aquele e o do fim do prologo,
    // logo abaixo, e comprar duas cartas no mesmo lugar deixaria a segunda sem terra.
    const lakeGate = await page.evaluate(() => {
      const gate = window.__scene.explorer.frontiers().find((f) => f.direction !== 'north');
      return gate ? { x: gate.gateX, y: gate.gateY, cx: gate.targetCx, cy: gate.targetCy } : null;
    });
    assert('ha um portao livre para o lago', lakeGate !== null, 'nenhuma fronteira fora do norte');
    await buy('moonlit-lake', lakeGate.x, lakeGate.y, 3);
    await driver.settle(900);
    const lago = await page.evaluate(({ cx, cy }) => {
      // Os bichos vem da CARTA (o `buy` limpa o campo no fim, e o conteudo autorado e o contrato):
      // o que se cobra aqui e o que a carta CARREGA, nao quantos corpos sobraram de pe.
      const content = window.__scene.explorer.source.chunkContent(cx, cy);
      return {
        zoras: content.enemies.filter((e) => e.type === 'zora').length,
      };
    }, { cx: lakeGate.cx, cy: lakeGate.cy });
    assert('O lago traz tres criaturas de agua', lago.zoras === 3, JSON.stringify(lago));
    await shot('prologo-lago', { note: 'O lago: tres criaturas de agua e uma fonte de renda.', state: lago });

    // O BICHO DE AGUA PAGA 3, E A MOEDA CAI EM TERRA. Um corpo que morre no meio do lago larga
    // moeda onde o heroi nunca alcanca — a pior recompensa possivel, a que se ve e nao se pega.
    // A morte aqui e por dano direto de proposito: o que se cobra e a REGRA do drop, e nao a
    // habilidade de matar um zora da margem (isso e do cenario `zora`).
    const pago = await page.evaluate(({ cx, cy }) => {
      const s = window.__scene;
      s.coinManager.getActiveWorldPositions().forEach(() => {});
      const antes = s.coinManager.getActiveWorldPositions().length;
      // Um tile de agua ABERTA no meio da carta comprada.
      let spot = null;
      for (let y = cy * 12; y < cy * 12 + 12 && !spot; y += 1) {
        for (let x = cx * 12; x < cx * 12 + 12 && !spot; x += 1) {
          if (s.isOpenWaterAt(x, y)) spot = { x, y };
        }
      }
      if (!spot) return { erro: 'sem agua na carta' };
      const zora = s.enemyManager.spawn('zora', spot.x, spot.y, () => true);
      if (!zora) return { erro: 'zora nao nasceu' };
      zora.takeDamage(999);
      const moedas = s.coinManager.getActiveWorldPositions().map((c) => ({ x: c.worldX, y: c.worldY }));
      return {
        spot,
        valor: s.coinsForKind('zora'),
        caiu: moedas.length - antes,
        // "Em terra" e a mesma pergunta que os pes do heroi fazem: um tile que ele PODE pisar.
        naAgua: moedas.filter((c) => s.isOpenWaterAt(c.x, c.y)).length,
      };
    }, { cx: lakeGate.cx, cy: lakeGate.cy });
    assert('O bicho de agua vale TRES moedas', pago?.valor === 3, JSON.stringify(pago));
    assert('...e nenhuma delas fica na agua, onde o heroi nunca alcancaria',
      pago?.naAgua === 0, JSON.stringify(pago));

    // ── 6. o fim do prologo ─────────────────────────────────────────────────────────────────
    log('FIM: a carta mais cara do baralho, e a Morte no meio dela');
    const finale = await page.evaluate(() => {
      const entry = window.__scene.explorer.source.catalog()
        .find((card) => card.catalog.id === 'prologue-end');
      return entry
        ? { cost: entry.catalog.cost, name: entry.catalog.name, npc: entry.npcs[0]?.type }
        : null;
    });
    // O PRECO E LIDO DO BARALHO, nunca escrito aqui: a tabela inteira mora em
    // `scripts/add-prologue.mjs` e ja foi reescrita duas vezes. O que este cenario tem a cobrar e
    // que ela seja a MAIS CARA de todas (o fim do prologo se compra, e o preco e a fabrica) — um
    // numero fixo no teste so garantiria que alguem o atualizasse junto, nunca a lei.
    const priciest = await page.evaluate(() => Math.max(
      ...window.__scene.explorer.source.catalog().map((card) => card.catalog.cost),
    ));
    assert('A ultima carta e a MAIS CARA do baralho e traz a Morte',
      finale?.cost === priciest && finale?.npc === 'death',
      JSON.stringify({ finale, priciest }));

    await buy('prologue-end', 6, 1, finale.cost);
    const spent = await state();
    assert('Comprar o fim do prologo esvazia a bolsa', (spent?.coins ?? 99) === 0, `coins=${spent?.coins}`);

    // A Morte fica no centro exato do adro: chunk (0,-1), tile local (6,6) → mundo (6,-6).
    await teleport(6, -5);
    await driver.settle(500);
    await driver.press('ArrowUp');
    await driver.settle(300);
    // FALAR E O Z, e so ele: o X virou "usar o item selecionado" e nao cumprimenta mais ninguem.
    // A tecla certa sempre esteve escrita na tela — o keycap que flutua sobre a cabeca do NPC diz
    // "Z" desde que os dois botoes existem.
    await driver.press('z', { count: 1 });
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
