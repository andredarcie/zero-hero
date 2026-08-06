// The chunk-builder's complete first decision: dark roads create pressure, the hero cannot
// cross one, coins wake its seal, the card table pauses the world, and one chosen card becomes
// real terrain. The same pass checks that the editor exposes those cards as authored data.

export default {
  name: 'world-builder',
  description: 'Acampamento fixo, estradas fechadas, cards pausados, compra de chunk e biblioteca no editor.',
  needsGame: false,
  route: '/',
  async run({ driver, shot, assert, log }) {
    const page = driver.page;
    const state = () => driver.getState();
    const teleport = (x, y) => page.evaluate(([px, py]) => {
      const scene = window.__scene;
      scene.playerWorld.worldX = px;
      scene.playerWorld.worldY = py;
      scene.movementController.interruptMovement(px, py);
    }, [x, y]);

    await page.waitForFunction(() => window.__game?.scene.isActive('title'), null, { timeout: 30000 });
    await driver.settle(600);
    const titleTexts = await page.evaluate(() => window.__game.scene.getScene('title').children.list
      .map((child) => typeof child.text === 'string' ? child.text : null).filter(Boolean));
    assert('O unico caminho principal do titulo e construir um mundo',
      titleTexts.includes('Build a world'), JSON.stringify(titleTexts));
    await driver.press('Enter');
    await page.waitForFunction(() => window.gameDebug?.getState()?.explorer?.builder != null, null, { timeout: 30000 });
    await driver.settle(1400);
    const boot = await state();
    await shot('campfire-clearing', {
      note: 'O unico chunk inicial: fogueira, mago, espada e tres estradas na nevoa.',
      state: boot,
    });

    const builder = boot?.explorer?.builder;
    assert('A run comeca no construtor de mundo', boot?.explorer != null, `explorer=${Boolean(boot?.explorer)}`);
    assert('Existe somente o chunk inicial', builder?.built?.length === 1, JSON.stringify(builder?.built));
    assert('As tres entradas iniciais sao norte, leste inferior e oeste',
      JSON.stringify((builder?.gates ?? []).map((gate) => gate.direction).sort()) === JSON.stringify(['east', 'north', 'west']),
      JSON.stringify(builder?.gates));
    assert('A fogueira central esta acesa', boot?.litFires === 1, `litFires=${boot?.litFires}`);
    assert('A expedicao ja nasce com 100 moedas, na bolsa E no HUD',
      boot?.coins === 100 && boot?.explorer?.carried === 100,
      `wallet=${boot?.coins} run=${boot?.explorer?.carried}`);
    assert('A espada nasce no chao ao lado da fogueira',
      (boot?.groundItems ?? []).some((item) => item.kind === 'sword' && item.worldX === 7 && item.worldY === 8),
      JSON.stringify(boot?.groundItems));
    const wizard = await page.evaluate(() => ({
      kinds: window.gameDebug?.listNpcKinds() ?? [],
      authored: window.__scene.explorer.source.chunkContent(0, 0).npcs
        .find((npc) => npc.type === 'wizard') ?? null,
    }));
    assert('O mago nasce visivel acima e a esquerda da fogueira',
      wizard.kinds.includes('wizard') && wizard.authored?.worldX === 4 && wizard.authored?.worldY === 5,
      JSON.stringify(wizard));
    assert('A biblioteca inicial tem lago, floresta e caverna de aranhas',
      ['moonlit-lake', 'whispering-forest', 'spider-hollow'].every(
        (id) => (builder?.catalog ?? []).some((entry) => entry.id === id),
      ), JSON.stringify(builder?.catalog));
    assert('O baralho tem as 8 cartas de NPC alem das 6 de terreno (14 no total)',
      (builder?.catalog ?? []).length === 14
        && ['cat-cold-hearths', 'crater-quarry', 'timber-ranks', 'glowing-ford',
          'painted-beds', 'roadside-pond', 'singing-pines', 'silent-meadow',
          'granite-pass', 'sunken-graveyard', 'blooming-grove']
          .every((id) => (builder?.catalog ?? []).some((entry) => entry.id === id)),
      JSON.stringify((builder?.catalog ?? []).map((entry) => entry.id)));
    const spiderRules = await page.evaluate(() => {
      const template = window.__scene.explorer.source.catalog()
        .find((entry) => entry.catalog.id === 'spider-hollow');
      return template?.enemies.map((enemy) => enemy.type) ?? [];
    });
    assert('A Caverna das Aranhas so autora aranhas',
      spiderRules.length > 0 && spiderRules.every((kind) => kind === 'spider'), JSON.stringify(spiderRules));

    // As tres cartas de terreno novas existem para ESTREAR familias de tile que a biblioteca
    // nao usava: a montanha em cubo (39/40), o cemiterio (31 cova aberta / 25 tumulo) e os
    // pinheiros de fruto/flor (15/16). Cada uma tambem respeita "uma especie por tela".
    const newLands = await page.evaluate(() => {
      const catalog = window.__scene.explorer.source.catalog();
      const byId = (id) => catalog.find((entry) => entry.catalog.id === id);
      const summary = (id) => {
        const template = byId(id);
        if (!template) return null;
        const frames = new Set([...template.ground.flat(), ...template.upper.flat()]
          .filter((frame) => frame != null));
        return { frames: [...frames], enemies: template.enemies.map((enemy) => enemy.type) };
      };
      return {
        pass: summary('granite-pass'),
        graveyard: summary('sunken-graveyard'),
        grove: summary('blooming-grove'),
      };
    });
    assert('O Desfiladeiro usa a montanha em cubo (39/40) e so autora morcegos',
      [39, 40].every((frame) => newLands.pass?.frames.includes(frame))
        && newLands.pass?.enemies.length > 0 && newLands.pass?.enemies.every((kind) => kind === 'bat'),
      JSON.stringify(newLands.pass));
    assert('O Cemiterio usa cova aberta e tumulo (31/25) e so autora undead',
      [31, 25, 22].every((frame) => newLands.graveyard?.frames.includes(frame))
        && newLands.graveyard?.enemies.length > 0
        && newLands.graveyard?.enemies.every((kind) => kind === 'undead'),
      JSON.stringify(newLands.graveyard));
    assert('O Bosque usa os pinheiros de fruto e flor (15/16) e nao autora inimigo nenhum',
      [15, 16, 6].every((frame) => newLands.grove?.frames.includes(frame))
        && newLands.grove?.enemies.length === 0,
      JSON.stringify(newLands.grove));

    log('ESCURIDAO: todo chunk nao-comprado nasce sob a mortalha, sem nada legivel');
    const bootShroud = boot?.explorer?.builder?.shroud;
    assert('A mortalha cobre os tres alvos das estradas (e nada esta dissolvendo)',
      ['0,-1', '1,0', '-1,0'].every((key) => (bootShroud?.covered ?? []).includes(key))
        && (bootShroud?.revealing ?? []).length === 0,
      JSON.stringify(bootShroud));
    assert('O chunk inicial (comprado) nao esta coberto',
      !(bootShroud?.covered ?? []).includes('0,0'), JSON.stringify(bootShroud?.covered));

    log('PRESSAO: uma caveira entra discretamente por uma estrada ainda escura');
    await page.waitForFunction(() => (window.gameDebug?.getState()?.undead ?? []).length > 0, null, {
      timeout: 9000,
    });
    const invaded = await state();
    const spawnTiles = await page.evaluate(() => window.__scene.explorer.frontiers()
      .map((gate) => `${gate.enemyX},${gate.enemyY}`));
    const invaderTiles = (invaded?.undead ?? []).map((enemy) => `${enemy.worldX},${enemy.worldY}`);
    assert('O primeiro undead veio de uma entrada nao comprada',
      invaderTiles.some((tile) => spawnTiles.includes(tile)),
      `undead=${JSON.stringify(invaderTiles)} roads=${JSON.stringify(spawnTiles)}`);
    assert('A pressao inicial e pequena, sem enxame', (invaded?.undead ?? []).length <= 1,
      `alive=${invaded?.undead?.length}`);
    await page.evaluate(() => window.__scene.enemyManager.despawnAll());

    log('FRONTEIRA: o heroi pode chegar ao fim da estrada, mas nao pisa no chunk escuro');
    await teleport(11, 8);
    await driver.walk('right', 2);
    const refused = await state();
    assert('A fronteira sem compra bloqueia o jogador',
      refused?.player?.worldX === 11 && refused?.player?.worldY === 8,
      JSON.stringify(refused?.player));

    await teleport(10, 8);
    // A bolsa de partida (100) pagaria qualquer estrada: zera para testar o selo dormente.
    await page.evaluate(() => window.__scene.explorerDebugSetCoins(0));
    await driver.settle(220);
    const lockedPrompt = await page.locator('.zh-gate-prompt').textContent();
    assert('Sem moedas o selo explica que a estrada esta dormente',
      /DORMANT ROAD/u.test(lockedPrompt ?? '') && /NEEDS 3 COINS/u.test(lockedPrompt ?? ''),
      lockedPrompt ?? 'sem prompt');

    await page.evaluate(() => window.__scene.explorerDebugSetCoins(4));
    // Com o baralho grande (14 cartas), o sorteio da mao e forcado para o cenario ser
    // deterministico — a mao classica de terreno primeiro.
    await page.evaluate(() => window.__scene.explorerDebugSetNextOffers(
      ['moonlit-lake', 'whispering-forest', 'spider-hollow'],
    ));
    await driver.settle(220);
    const enabledPrompt = await page.locator('.zh-gate-prompt').textContent();
    assert('Com dinheiro o selo oferece o botao de construir', /BUILD/u.test(enabledPrompt ?? ''), enabledPrompt ?? 'sem prompt');
    await driver.useItem();
    await page.waitForSelector('.zh-build-backdrop', { state: 'visible', timeout: 5000 });
    await driver.settle(850);

    const lockedCards = await page.locator('.zh-build-card').evaluateAll((nodes) => nodes.map((node) => ({
      name: node.querySelector('.zh-build-name')?.textContent,
      disabled: node.disabled,
      lock: node.querySelector('.zh-build-lock')?.textContent,
    })));
    await shot('card-lock-state', {
      note: 'O baralho explica visualmente quais terras o heroi ainda nao consegue comprar.',
      state: { coins: 4, lockedCards },
    });
    assert('Moedas insuficientes travam duas cartas e deixam a de custo 3 disponivel',
      lockedCards.filter((card) => card.disabled).length === 2
        && lockedCards.some((card) => card.name === 'Moonlit Lake' && !card.disabled),
      JSON.stringify(lockedCards));
    assert('A trava da carta explica o custo em texto, nao apenas por cor',
      lockedCards.filter((card) => card.disabled).every((card) => /LOCKED · NEED/u.test(card.lock ?? '')),
      JSON.stringify(lockedCards));

    await page.keyboard.press('Escape');
    await page.waitForSelector('.zh-build-backdrop', { state: 'detached', timeout: 5000 });

    log('CARTAS DE NPC: naipe hearth, moldura violeta, uma por morador');
    await page.evaluate(() => window.__scene.explorerDebugSetCoins(20));
    await page.evaluate(() => window.__scene.explorerDebugSetNextOffers(
      ['cat-cold-hearths', 'painted-beds', 'silent-meadow'],
    ));
    await driver.settle(220);
    await driver.useItem();
    await page.waitForSelector('.zh-build-backdrop', { state: 'visible', timeout: 5000 });
    await driver.settle(850);
    const npcCards = await page.locator('.zh-build-card').evaluateAll((nodes) => nodes.map((node) => ({
      name: node.querySelector('.zh-build-name')?.textContent,
      npc: node.dataset.npc,
      suit: node.dataset.suit,
      borderColor: getComputedStyle(node.querySelector('.zh-build-face')).borderColor,
    })));
    await shot('npc-cards', {
      note: 'As cartas de NPC: naipe hearth (fogueira) e moldura violeta arcana, nao ouro.',
      state: { npcCards },
    });
    assert('As tres cartas de NPC usam o naipe hearth e a cor propria',
      npcCards.length === 3 && npcCards.every((card) => card.npc === 'true' && card.suit === 'hearth'),
      JSON.stringify(npcCards));
    assert('A moldura da carta de NPC nao e a de ouro',
      npcCards.every((card) => card.borderColor !== 'rgb(215, 184, 107)'),
      JSON.stringify(npcCards.map((card) => card.borderColor)));
    await page.keyboard.press('Escape');
    await page.waitForSelector('.zh-build-backdrop', { state: 'detached', timeout: 5000 });

    await page.evaluate(() => window.__scene.explorerDebugSetNextOffers(
      ['moonlit-lake', 'whispering-forest', 'spider-hollow'],
    ));
    await driver.settle(220);
    await driver.useItem();
    await page.waitForSelector('.zh-build-backdrop', { state: 'visible', timeout: 5000 });
    await driver.settle(850);

    const cards = await page.locator('.zh-build-card').evaluateAll((nodes) => nodes.map((node) => ({
      name: node.querySelector('.zh-build-name')?.textContent,
      disabled: node.disabled,
      opacity: getComputedStyle(node).opacity,
      ratio: node.getBoundingClientRect().width / node.getBoundingClientRect().height,
      corners: node.querySelectorAll('.zh-build-corner').length,
      sigils: node.querySelectorAll('.zh-build-sigil svg').length,
      hasBack: node.querySelector('.zh-build-back') != null,
      imageState: node.dataset.imageState,
    })));
    const modalState = await state();
    await shot('three-card-choice', {
      note: 'A acao para o jogo, desfoca o mundo e vira tres cards compraveis.',
      state: modalState,
    });
    assert('O baralho apresenta tres cards', cards.length === 3, JSON.stringify(cards));
    assert('Os tres cards terminaram a animacao de virar', cards.every((card) => Number(card.opacity) > 0.9), JSON.stringify(cards));
    assert('As cartas tem proporcao vertical de baralho 5:7',
      cards.every((card) => card.ratio > 0.68 && card.ratio < 0.75), JSON.stringify(cards));
    assert('Cada carta tem verso, dois cantos espelhados e naipe vetorial',
      cards.every((card) => card.hasBack && card.corners === 2 && card.sigils >= 3), JSON.stringify(cards));
    assert('As tres artes carregaram no estado normal', cards.every((card) => card.imageState === 'ready'), JSON.stringify(cards));
    assert('O estado marca que o jogo esta pausado nos cards', modalState?.explorer?.builder?.cardsOpen === true,
      JSON.stringify(modalState?.explorer?.builder));
    assert('O fundo usa desfoque durante a escolha',
      await page.locator('.zh-build-backdrop').evaluate((node) => getComputedStyle(node).backdropFilter.includes('blur')),
      'backdrop-filter');

    const firstCard = page.locator('.zh-build-card').first();
    const focusState = await firstCard.evaluate((node) => ({
      focused: document.activeElement === node,
      outlineWidth: getComputedStyle(node).outlineWidth,
      outlineStyle: getComputedStyle(node).outlineStyle,
    }));
    assert('A primeira carta compravel recebe foco visivel do teclado',
      focusState.focused && focusState.outlineStyle === 'solid' && parseFloat(focusState.outlineWidth) >= 2,
      JSON.stringify(focusState));

    const hoverCard = page.locator('.zh-build-card:not(:focus)').first();
    const restingTransform = await hoverCard.evaluate((node) => getComputedStyle(node).transform);
    await hoverCard.hover();
    await driver.settle(260);
    const hoverTransform = await hoverCard.evaluate((node) => getComputedStyle(node).transform);
    assert('Hover levanta e endireita a carta como uma escolha fisica', hoverTransform !== restingTransform,
      `rest=${restingTransform} hover=${hoverTransform}`);

    await page.mouse.move(0, 0);
    await driver.settle(180);
    const restingShadow = await hoverCard.locator('.zh-build-face').evaluate((node) => getComputedStyle(node).boxShadow);
    await hoverCard.evaluate((node) => node.classList.add('is-active'));
    await driver.settle(100);
    const activeShadow = await hoverCard.locator('.zh-build-face').evaluate((node) => getComputedStyle(node).boxShadow);
    await hoverCard.evaluate((node) => node.classList.remove('is-active'));
    assert('Pressionar assenta a carta e reduz a sombra', activeShadow !== restingShadow,
      `rest=${restingShadow} active=${activeShadow}`);

    const imageStates = await firstCard.evaluate((node) => {
      const stateOpacity = (selector) => getComputedStyle(node.querySelector(selector)).opacity;
      node.dataset.imageState = 'loading';
      const loading = stateOpacity('.zh-build-state-loading');
      node.dataset.imageState = 'error';
      const error = stateOpacity('.zh-build-state-error');
      node.dataset.imageState = 'ready';
      return { loading, error };
    });
    assert('Loading e erro da arte tem mensagens visuais proprias',
      Number(imageStates.loading) > 0.9 && Number(imageStates.error) > 0.9, JSON.stringify(imageStates));

    const responsiveChecks = [];
    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 800 });
      await driver.settle(160);
      responsiveChecks.push(await page.evaluate((testedWidth) => {
        const card = document.querySelector('.zh-build-card');
        const rect = card?.getBoundingClientRect();
        return {
          width: testedWidth,
          noPageOverflow: document.documentElement.scrollWidth <= window.innerWidth,
          cardVisible: rect != null && rect.width >= 220 && rect.left < window.innerWidth && rect.right > 0,
        };
      }, width));
      if (width === 375) {
        await shot('cards-mobile-375', {
          note: 'No celular, as cartas viram uma mao horizontal com snap e alvo de toque inteiro.',
          state: { width },
        });
      }
    }
    assert('O baralho nao estoura a pagina em 320, 375, 414 ou 768 px',
      responsiveChecks.every((check) => check.noPageOverflow && check.cardVisible),
      JSON.stringify(responsiveChecks));
    await page.setViewportSize({ width: 1280, height: 800 });
    await driver.settle(220);

    // If GameScene were still updating, this advances beyond the next road-spawn deadline.
    // With the chooser open, the early return freezes that director and no undead appears.
    await page.evaluate(() => window.advanceTime?.(7000));
    const paused = await state();
    assert('Nenhum undead nasce enquanto os cards estao abertos', (paused?.undead ?? []).length === 0,
      JSON.stringify(paused?.undead));
    assert('O heroi tambem permanece parado durante a escolha',
      paused?.player?.worldX === 10 && paused?.player?.worldY === 8, JSON.stringify(paused?.player));

    const spiderCard = page.locator('.zh-build-card').filter({ hasText: 'Spider Hollow' });
    await spiderCard.click();
    await driver.settle(420);
    const successState = await spiderCard.evaluate((node) => ({
      state: node.dataset.state,
      message: node.querySelector('.zh-build-state-success')?.textContent?.trim(),
      opacity: getComputedStyle(node.querySelector('.zh-build-state-success')).opacity,
    }));
    await shot('card-claimed', {
      note: 'A carta escolhida confirma a compra nela mesma antes de virar mundo.',
      state: { successState },
    });
    assert('A compra tem estado de sucesso silencioso dentro da propria carta',
      successState.state === 'success' && /LAND CLAIMED/u.test(successState.message ?? '')
        && Number(successState.opacity) > 0.9,
      JSON.stringify(successState));
    await page.waitForSelector('.zh-build-backdrop', { state: 'detached', timeout: 5000 });
    await driver.settle(500);
    const bought = await state();
    const east = bought?.explorer?.builder?.built?.find((chunk) => chunk.cx === 1 && chunk.cy === 0);
    assert('A carta escolhida virou um novo chunk a leste', east?.typeId === 'spider-hollow', JSON.stringify(east));
    assert('O custo da caverna foi descontado', bought?.explorer?.carried === 13 && bought?.coins === 13,
      `run=${bought?.explorer?.carried} wallet=${bought?.coins}`);
    assert('A compra abre novas fronteiras ao redor do terreno', bought?.explorer?.builder?.gates?.length === 5,
      JSON.stringify(bought?.explorer?.builder?.gates));
    assert('Carta comprada sai do baralho: cada carta existe UMA vez',
      !(bought?.explorer?.builder?.catalog ?? []).some((entry) => entry.id === 'spider-hollow')
        && (bought?.explorer?.builder?.catalog ?? []).length === 13,
      JSON.stringify((bought?.explorer?.builder?.catalog ?? []).map((entry) => entry.id)));
    const crossing = await page.evaluate(() => ({
      blocked: window.__scene.explorer.blocksPlayerAt(12, 8),
      tileBlocked: window.__scene.chunkManager.isCellBlocked(12, 8),
    }));
    assert('A estrada inferior direita conecta ao chunk comprado',
      crossing.blocked === false && crossing.tileBlocked === false, JSON.stringify(crossing));
    // Regressao das paredes invisiveis: estes dois tiles eram arvore na floresta escura e o
    // openSeams do template comprado GARANTE que estao abertos — se bloquearem, algum cache
    // ainda esta servindo a colisao do chunk que nao existe mais.
    const interior = await page.evaluate(() => ({
      seamNorth: window.__scene.chunkManager.isCellBlocked(18, 2),
      seamEast: window.__scene.chunkManager.isCellBlocked(22, 8),
    }));
    assert('O interior do chunk comprado nao guarda paredes invisiveis da escuridao antiga',
      interior.seamNorth === false && interior.seamEast === false, JSON.stringify(interior));

    log('REVELACAO: a mortalha do chunk comprado dissolve da boca da estrada para dentro');
    const revealShroud = bought?.explorer?.builder?.shroud;
    assert('O chunk comprado saiu da cobertura e esta em dissolucao',
      !(revealShroud?.covered ?? []).includes('1,0')
        && (revealShroud?.revealing ?? []).some((entry) => entry.key === '1,0'
          && entry.progress > 0 && entry.progress < 1),
      JSON.stringify(revealShroud));
    assert('Os novos vizinhos do terreno comprado ja nascem cobertos atras da dissolucao',
      ['2,0', '1,-1', '1,1'].every((key) => (revealShroud?.covered ?? []).includes(key)),
      JSON.stringify(revealShroud?.covered));
    await page.waitForFunction(() => {
      const shroud = window.gameDebug?.getState()?.explorer?.builder?.shroud;
      return shroud != null && shroud.revealing.length === 0 && !shroud.covered.includes('1,0');
    }, null, { timeout: 8000 });

    await teleport(11, 8);
    await driver.walk('right', 2);
    const entered = await state();
    await shot('spider-hollow-built', {
      note: 'O heroi atravessa a antiga nevoa: o segundo chunk agora faz parte desta run.',
      state: entered,
    });
    assert('O heroi consegue atravessar para o terreno comprado', entered?.activeScreen?.cx === 1,
      JSON.stringify({ player: entered?.player, screen: entered?.activeScreen }));

    log('EDITOR: cada card pode ser nomeado, precificado, ilustrado e aberto para pintura');
    await page.goto(new URL('/editor', page.url()).href, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#zh-editor-root .zh-btn', { state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /Chunks/u }).click();
    await page.waitForSelector('.zh-modal', { state: 'visible' });
    const editorCard = {
      count: await page.locator('.zh-modal select option').count(),
      name: await page.locator('.zh-field').filter({ hasText: 'Nome da carta' }).locator('input').inputValue(),
      cost: await page.locator('.zh-field').filter({ hasText: 'Custo em moedas' }).locator('input').inputValue(),
      image: await page.locator('.zh-field').filter({ hasText: 'Imagem da carta' }).locator('input').inputValue(),
      createVisible: await page.getByRole('button', { name: '+ Criar e abrir' }).isVisible(),
    };
    await shot('editor-chunk-library', {
      note: 'A biblioteca de chunks do /editor, sem salvar nenhuma alteracao de teste.',
      state: { editorCard },
    });
    assert('O editor lista os 14 chunks da biblioteca (6 terrenos + 8 NPCs)',
      editorCard.count === 14, JSON.stringify(editorCard));
    assert('Nome, custo e imagem da carta sao editaveis',
      editorCard.name === 'Moonlit Lake' && editorCard.cost === '3' && editorCard.image.length > 0,
      JSON.stringify(editorCard));
    assert('O editor permite criar outro chunk', editorCard.createVisible === true, JSON.stringify(editorCard));
  },
};
