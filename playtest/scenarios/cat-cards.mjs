// Progressao do baralho: as aulas do gato formam o primeiro arco. Todas custam uma moeda e
// puzzles que nao pertencem ao gato so entram na mao quando a ultima aula tiver sido comprada.

export default {
  name: 'cat-cards',
  description: 'Todas as cartas do gato ativas por 1 moeda; puzzles comuns liberados ao concluir o gato.',
  needsGame: false,
  route: '/',
  async run({ driver, shot, assert, log }) {
    const page = driver.page;
    const teleport = (x, y) => page.evaluate(([px, py]) => {
      const scene = window.__scene;
      scene.playerWorld.worldX = px;
      scene.playerWorld.worldY = py;
      scene.movementController.interruptMovement(px, py);
    }, [x, y]);

    await page.waitForFunction(() => window.__game?.scene.isActive('title'), null, { timeout: 30000 });
    await driver.settle(500);
    await driver.press('Enter');
    await page.waitForFunction(
      () => window.gameDebug?.getState()?.explorer?.builder != null,
      null,
      { timeout: 30000 },
    );
    await driver.settle(1200);

    const boot = await page.evaluate(async () => {
      const world = await (await fetch(`${document.baseURI}world.json`)).json();
      const categoryOf = (chunk) => chunk.catalog.category
        ?? (chunk.npcs.length > 0 ? 'narrative' : chunk.enemies.length > 0 ? 'combat' : 'puzzle');
      const catCards = world.chunks
        .filter((chunk) => chunk.catalog?.id?.startsWith('cat-'))
        .map((chunk) => ({
          id: chunk.catalog.id,
          cost: chunk.catalog.cost,
          enabled: chunk.catalog.enabled !== false,
          category: categoryOf(chunk),
        }));
      const commonPuzzles = world.chunks
        .filter((chunk) => chunk.catalog && chunk.catalog.enabled !== false)
        .filter((chunk) => !chunk.catalog.id.startsWith('cat-') && categoryOf(chunk) === 'puzzle')
        .map((chunk) => chunk.catalog.id);
      const state = window.gameDebug.getState();
      return {
        catCards,
        commonPuzzles,
        catalogIds: state.explorer.builder.catalog.map((card) => card.id),
        progression: state.explorer.builder.progression,
      };
    });

    assert('A biblioteca tem as 11 cartas do gato ativas',
      boot.catCards.length === 11 && boot.catCards.every((card) => card.enabled),
      JSON.stringify(boot.catCards));
    assert('Todas as cartas do gato custam exatamente 1 moeda',
      boot.catCards.every((card) => card.cost === 1), JSON.stringify(boot.catCards));
    assert('Todas as cartas do gato aparecem no catalogo inicial',
      boot.catCards.every((card) => boot.catalogIds.includes(card.id)), JSON.stringify(boot.catalogIds));
    assert('Puzzles comuns nao aparecem antes de concluir as cartas do gato',
      boot.commonPuzzles.length > 0
        && boot.commonPuzzles.every((id) => !boot.catalogIds.includes(id))
        && boot.progression?.puzzleCardsUnlocked === false
        && boot.progression?.catCardsRemaining === boot.catCards.length,
      JSON.stringify(boot));

    log('MAO DO GATO: narrativa, combate e puzzle continuam visiveis; todas custam uma moeda');
    await page.evaluate(() => {
      window.__scene.explorerDebugSetCoins(1);
      window.__scene.explorerDebugSetNextOffers(['cat-cold-hearths', 'cat-blade', 'cat-crossing']);
    });
    await teleport(10, 8);
    await driver.settle(300);
    await driver.useItem();
    await page.waitForSelector('.zh-build-backdrop', { state: 'visible', timeout: 5000 });
    await driver.settle(850);
    const openingCards = await page.locator('.zh-build-card').evaluateAll((cards) => cards.map((card) => ({
      name: card.querySelector('.zh-build-name')?.textContent,
      cost: Number(card.querySelector('.zh-build-coin')?.textContent),
      category: card.dataset.category,
      disabled: card.disabled,
    })));
    await shot('all-cat-cards-cost-one', {
      note: 'Tres tipos de aula do gato na mesma mao, todos ativos e marcados com uma moeda.',
      state: { openingCards, progression: boot.progression },
    });
    assert('A mao mostra tres cartas do gato compraveis por uma moeda',
      openingCards.length === 3
        && openingCards.every((card) => card.cost === 1 && card.disabled === false),
      JSON.stringify(openingCards));
    assert('Carta de puzzle do gato aparece antes do desbloqueio dos puzzles comuns',
      openingCards.some((card) => card.category === 'puzzle'), JSON.stringify(openingCards));
    await page.keyboard.press('Escape');
    await page.waitForSelector('.zh-build-backdrop', { state: 'detached', timeout: 5000 });

    const completion = await page.evaluate((catIds) => {
      const source = window.__scene.explorer.source;
      const commonPuzzles = (() => {
        const initial = window.gameDebug.getState().explorer.builder;
        return initial.catalog.filter((card) => card.category === 'puzzle' && !card.id.startsWith('cat-'))
          .map((card) => card.id);
      })();
      const checkpoints = [];
      for (const id of catIds) {
        const gate = source.frontiers()[0];
        const built = gate ? source.purchase(gate, id) : null;
        checkpoints.push({
          id,
          bought: built !== null,
          remaining: source.catCardsRemaining(),
          unlocked: source.puzzleCardsUnlocked(),
        });
      }
      return {
        checkpoints,
        catalogIds: source.catalog().map((entry) => entry.catalog.id),
        progression: {
          catCardsRemaining: source.catCardsRemaining(),
          puzzleCardsUnlocked: source.puzzleCardsUnlocked(),
        },
        nextGate: source.frontiers()[0],
        commonPuzzles,
      };
    }, boot.catCards.map((card) => card.id));

    // O primeiro snapshot nao conhecia os puzzles no catalogo por design. A lista autorada e a
    // referencia para cobrar que TODOS voltaram, nao so um id escolhido a dedo.
    assert('Cada carta do gato foi comprada uma unica vez',
      completion.checkpoints.every((step) => step.bought)
        && completion.checkpoints.at(-1)?.remaining === 0,
      JSON.stringify(completion.checkpoints));
    assert('O desbloqueio acontece somente depois da ultima compra do gato',
      completion.checkpoints.slice(0, -1).every((step) => step.unlocked === false)
        && completion.checkpoints.at(-1)?.unlocked === true,
      JSON.stringify(completion.checkpoints));
    assert('Depois da ultima carta, todos os puzzles comuns entram no catalogo',
      boot.commonPuzzles.every((id) => completion.catalogIds.includes(id))
        && completion.progression.puzzleCardsUnlocked === true,
      JSON.stringify({ puzzles: boot.commonPuzzles, catalog: completion.catalogIds }));

    log('PUZZLES LIBERADOS: a mao comum so nasce depois da ultima compra do gato');
    await page.evaluate((ids) => {
      window.__scene.explorerDebugSetCoins(99);
      window.__scene.explorerDebugSetNextOffers(ids);
    }, boot.commonPuzzles);
    await teleport(completion.nextGate.gateX, completion.nextGate.gateY);
    await driver.settle(350);
    await driver.useItem();
    await page.waitForSelector('.zh-build-backdrop', { state: 'visible', timeout: 5000 });
    await driver.settle(850);
    const revealed = await page.locator('.zh-build-card').evaluateAll((cards) => cards.map((card) => ({
      name: card.querySelector('.zh-build-name')?.textContent,
      category: card.dataset.category,
      disabled: card.disabled,
    })));
    const textState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await shot('common-puzzles-unlocked', {
      note: 'Apos comprar todas as cartas do gato, os puzzles comuns finalmente entram na mao.',
      state: { revealed, progression: textState.explorer?.builder?.progression },
    });
    assert('A mao liberada contem somente os puzzles comuns solicitados',
      revealed.length === boot.commonPuzzles.length
        && revealed.every((card) => card.category === 'puzzle' && card.disabled === false),
      JSON.stringify(revealed));
    assert('render_game_to_text registra a progressao concluida',
      textState.explorer?.builder?.progression?.catCardsRemaining === 0
        && textState.explorer?.builder?.progression?.puzzleCardsUnlocked === true,
      JSON.stringify(textState.explorer?.builder?.progression));
  },
};
